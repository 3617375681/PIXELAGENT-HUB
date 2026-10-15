import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendStudioEvent, deriveEventsFromRecord, readStudioEvents, studioEventListenerCount, subscribeStudioEvents, type StudioEvent } from './events.js';

async function withRoot(work: (root: string, projectId: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'studio-events-'));
  try { await work(root, randomUUID()); } finally { await rm(root, { recursive: true, force: true }); }
}

test('concurrent appends get unique ordered sequence numbers', () => withRoot(async (root, projectId) => {
  await Promise.all(Array.from({ length: 20 }, (_, index) => appendStudioEvent(root, projectId, { type: 'phase', data: { phase: 'coding', index } })));
  const events = await readStudioEvents(root, projectId);
  assert.deepEqual(events.map((event) => event.seq), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual((await readStudioEvents(root, projectId, 15)).map((event) => event.seq), [16, 17, 18, 19, 20]);
}));

test('only the first terminal event is kept, later preview checks still append', () => withRoot(async (root, projectId) => {
  assert.equal((await appendStudioEvent(root, projectId, { type: 'cancelled', data: { error: 'User cancelled generation' } }))?.seq, 1);
  assert.equal(await appendStudioEvent(root, projectId, { type: 'cancelled', data: { error: 'aborted' } }), null);
  assert.equal(await appendStudioEvent(root, projectId, { type: 'failed' }), null);
  assert.equal((await appendStudioEvent(root, projectId, { type: 'test_plan_started' }))?.seq, 2);
  assert.deepEqual((await readStudioEvents(root, projectId)).map((event) => event.type), ['cancelled', 'test_plan_started']);
}));

test('after a crash leaves a truncated line, reads skip it and the next append starts a fresh line', () => withRoot(async (root, projectId) => {
  // Written directly, as a previous process would have left it; this process has no cached state for the file.
  await mkdir(join(root, projectId), { recursive: true });
  await appendFile(join(root, projectId, 'events.jsonl'), '{"seq":1,"at":"2026-10-14T00:00:00.000Z","type":"queued"}\n{"seq":2,"at":"');
  assert.deepEqual((await readStudioEvents(root, projectId)).map((event) => event.seq), [1]);
  await appendStudioEvent(root, projectId, { type: 'phase', data: { phase: 'planning' } });
  assert.deepEqual((await readStudioEvents(root, projectId)).map((event) => `${event.seq}:${event.type}`), ['1:queued', '2:phase']);
}));

test('subscribers receive live events and unsubscribe cleanly', () => withRoot(async (root, projectId) => {
  const received: StudioEvent[] = [];
  const unsubscribe = subscribeStudioEvents(root, projectId, (event) => received.push(event));
  assert.equal(studioEventListenerCount(root, projectId), 1);
  await appendStudioEvent(root, projectId, { type: 'queued' });
  unsubscribe();
  await appendStudioEvent(root, projectId, { type: 'phase', data: { phase: 'planning' } });
  assert.deepEqual(received.map((event) => event.type), ['queued']);
  assert.equal(studioEventListenerCount(root, projectId), 0);
}));

test('legacy records produce a coarse derived timeline', () => {
  const events = deriveEventsFromRecord({
    projectId: randomUUID(), description: 'Legacy', status: 'ready_for_review', startedAt: '2026-10-09T00:00:00.000Z', finishedAt: '2026-10-09T00:01:00.000Z', previewFile: 'v2/dist/index.html',
    plan: { taskId: 'p', agentId: 'manager', status: 'success', output: { projectName: 'Legacy app' }, reasoning: '', timestamp: 0 },
    rounds: [
      { round: 1, code: { taskId: 'c1', agentId: 'coder', status: 'success', output: { files: [{ path: 'index.html', content: 'x' }] }, reasoning: '', timestamp: 0 }, build: { status: 'failed', errors: ['x'.repeat(500)], checkedFiles: [], browserVerified: false } },
      { round: 2, code: { taskId: 'c2', agentId: 'coder', status: 'success', output: { files: [{ path: 'index.html', content: 'y' }] }, reasoning: '', timestamp: 0 }, build: { status: 'passed', errors: [], checkedFiles: [], browserVerified: false } },
    ],
  } as never);
  assert.deepEqual(events.map((event) => `${event.type}${event.round ?? ''}`), ['phase', 'plan_ready', 'phase1', 'code_ready1', 'phase1', 'build_failed1', 'phase2', 'code_ready2', 'phase2', 'build_passed2', 'ready_for_review2']);
  assert.ok(events.every((event) => event.data?.derived === true));
  assert.equal((events[5].data!.errors as string[])[0].length, 300);
  assert.equal(events.at(-1)!.at, '2026-10-09T00:01:00.000Z');
});
