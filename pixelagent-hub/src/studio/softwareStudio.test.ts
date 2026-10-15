import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { runSoftwareStudio } from './softwareStudio.js';
import { readStudioEvents } from './events.js';

class FixtureProvider extends MockProvider {
  codes = 0;
  revisionPrompt = '';
  constructor(private alwaysBroken = false) { super(); }
  async askWithUsage(system: string, user: string) {
    if (system.includes('project manager')) return super.askWithUsage(system, user);
    this.codes++;
    this.revisionPrompt = user;
    return { content: JSON.stringify({ language: 'javascript', files: [
      { path: 'index.html', content: '<html><body><button>Start</button><script src="game.js"></script></body></html>', description: 'UI' },
      { path: 'game.js', content: this.alwaysBroken || this.codes === 1 ? 'const = ;' : 'document.body.dataset.ready = "true";', description: 'Game' },
    ], explanation: 'Test fixture', dependencies: [] }), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'fixture', provider: 'mock' as const };
  }
}

for (const strategy of ['manager-coder', 'coder-only'] as const) for (const alwaysBroken of [false, true]) {
  test(`compiler evidence controls bounded revision flow, strategy=${strategy}, alwaysBroken=${alwaysBroken}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-flow-'));
    try {
      const provider = new FixtureProvider(alwaysBroken);
      const record = await runSoftwareStudio({ description: 'Create a game', root, strategy, orchestrator: createOrchestrator('fixture', provider) });
      assert.equal(record.strategy, strategy);
      assert.equal(Boolean(record.plan), strategy === 'manager-coder');
      assert.equal(record.status, alwaysBroken ? 'failed' : 'ready_for_review');
      assert.equal(record.rounds.length, alwaysBroken ? 3 : 2);
      assert.equal(record.rounds[0].build?.status, 'failed');
      assert.match(provider.revisionPrompt, /revisionNotes/);
      assert.ok(provider.revisionPrompt.includes(JSON.stringify(record.rounds[0].build!.errors[0]).slice(1, -1)));
      assert.equal(JSON.parse(await readFile(join(root, record.projectId, 'project.json'), 'utf-8')).status, record.status);
      if (!alwaysBroken) assert.ok((await readFile(join(root, record.projectId, 'source.zip'))).length);
      else assert.equal(record.archiveFile, undefined);
      const events = await readStudioEvents(root, record.projectId);
      assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
      const timeline = events.map((event) => `${event.type === 'phase' ? event.data!.phase : event.type}${event.round ?? ''}`);
      const planning = strategy === 'manager-coder' ? ['planning', 'plan_ready'] : [];
      const round = (n: number, result: 'build_failed' | 'build_passed') => [`coding${n}`, `code_ready${n}`, `building${n}`, `${result}${n}`];
      assert.deepEqual(timeline, alwaysBroken
        ? [...planning, ...round(1, 'build_failed'), ...round(2, 'build_failed'), ...round(3, 'build_failed'), 'failed']
        : [...planning, ...round(1, 'build_failed'), ...round(2, 'build_passed'), 'ready_for_review2']);
      assert.ok((events.find((event) => event.type === 'build_failed')!.data!.errors as string[]).every((error) => error.length <= 300));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('pre-cancelled generation persists cancellation and never calls agents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-cancel-'));
  try {
    const provider = new FixtureProvider();
    const signal = AbortSignal.abort(new Error('Cancelled fixture'));
    const record = await runSoftwareStudio({ description: 'Create a game', root, signal, orchestrator: createOrchestrator('fixture', provider) });
    assert.equal(record.status, 'cancelled');
    assert.equal(provider.codes, 0);
    assert.equal(record.plan, undefined);
    assert.deepEqual((await readStudioEvents(root, record.projectId)).map((event) => event.type), ['cancelled']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the plain mock provider builds a playable app after one real compiler repair', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-mock-'));
  try {
    const record = await runSoftwareStudio({ description: 'Pixel counter', root, orchestrator: createOrchestrator('mock', new MockProvider()) });
    assert.equal(record.status, 'ready_for_review', record.error);
    assert.deepEqual(record.rounds.map((round) => round.build?.status), ['failed', 'passed']);
    assert.match(await readFile(join(root, record.projectId, record.previewFile!), 'utf-8'), /Mock Pixel Counter/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
