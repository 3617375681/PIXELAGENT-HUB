import { beforeEach, expect, it, vi } from 'vitest';
import { decodeSharedRun, encodeSharedRun, MAX_SHARE_CHARS, shareId, type SharedRun } from './share';

const run: SharedRun = {
  v: 1, description: 'A pixel counter', provider: 'DeepSeek', model: 'deepseek-chat', projectName: 'Pixel Counter',
  startedAt: '2026-10-18T00:00:00.000Z', finishedAt: '2026-10-18T00:00:20.000Z', round: 2,
  events: [
    { seq: 1, at: '2026-10-18T00:00:00.000Z', type: 'queued', data: { provider: 'DeepSeek', model: 'deepseek-chat' } },
    { seq: 2, at: '2026-10-18T00:00:05.000Z', type: 'build_failed', round: 1, data: { errors: ['app.js:1: ERROR'] } },
    { seq: 3, at: '2026-10-18T00:00:20.000Z', type: 'ready_for_review', round: 2 },
  ],
  html: '<!DOCTYPE html><html><body><button id="add">+1</button></body></html>',
  files: [{ path: 'index.html', content: '<button id="add">+1</button>' }],
  checks: [{ name: 'Adds one', actions: [], selector: '#count', expected: '1' }],
};

it('round-trips a run through a URL-safe fragment', () => {
  const encoded = encodeSharedRun(run);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodeSharedRun(encoded)).toEqual(run);
  expect(shareId(encoded)).toBe(shareId(encoded));
  expect(shareId(encoded)).not.toBe(shareId(encodeSharedRun({ ...run, description: 'Another' })));
});

it('rejects malformed, damaged, foreign and oversized links', () => {
  const encoded = encodeSharedRun(run);
  expect(() => decodeSharedRun('not a link!')).toThrow(/malformed/);
  expect(() => decodeSharedRun(encoded.slice(0, encoded.length / 2))).toThrow(/damaged|invalid/);
  expect(() => decodeSharedRun(encodeSharedRun({ ...run, v: 2 } as unknown as SharedRun))).toThrow(/different version/);
  expect(() => decodeSharedRun('A'.repeat(MAX_SHARE_CHARS + 1))).toThrow(/malformed/);
  const random = [0, 1].map(() => Array.from(crypto.getRandomValues(new Uint8Array(60_000)), (byte) => byte.toString(16).padStart(2, '0')).join('')).join('');
  expect(() => encodeSharedRun({ ...run, html: random })).toThrow(/too large/);
});

beforeEach(() => { vi.resetModules(); });

it('opens a link as a read-only recorded run that replays its timeline', async () => {
  const live = await import('./studio');
  live.resetLiveStudioForTests();
  const projectId = live.importSharedRun(encodeSharedRun(run));
  expect(live.isSharedProject(projectId) && live.isLiveProject(projectId) && !live.isLiveRun(projectId)).toBe(true);
  const { project } = await live.liveRequest('GET', `/api/studio/projects/${projectId}`) as { project: { status: string; previewFile: string; rounds: { code: { output: { llmModel: string } } }[] } };
  expect(project).toMatchObject({ status: 'ready_for_review', previewFile: 'v2/dist/index.html' });
  expect(project.rounds[0].code.output.llmModel).toBe('deepseek-chat');
  // The first page is empty so the dashboard opens the stream and watches the run play back.
  expect(await live.liveRequest('GET', `/api/studio/projects/${projectId}/events?after=0`)).toEqual({ events: [], derived: false });
  const played: string[] = [];
  await live.liveEventStream(projectId, 0, (event) => played.push(event.type), new AbortController().signal);
  expect(played).toEqual(['queued', 'build_failed', 'ready_for_review']);
  expect(await live.liveRequest('GET', `/api/studio/projects/${projectId}/preview`)).toEqual({ html: run.html });
  // Shared runs never show up as the visitor's own live runs.
  expect(await live.liveSummaries()).toEqual([]);
}, 15_000);
