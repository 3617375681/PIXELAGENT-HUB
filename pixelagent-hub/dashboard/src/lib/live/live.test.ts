import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StudioEvent } from '../../types/studio';

const build = vi.fn();
const checks = vi.fn();
vi.mock('./build', () => ({ buildInBrowser: (...args: unknown[]) => build(...args) }));
vi.mock('./checks', () => ({ runInPageChecks: (...args: unknown[]) => checks(...args) }));

const plan = { projectName: 'Pixel Counter', goal: 'Count', phases: [{ id: 'p1', name: 'Build', tasks: ['UI'], assignee: 'coder', priority: 'high' }], estimatedRounds: 1, risks: [] };
const code = { language: 'javascript', files: [{ path: 'index.html', content: '<button id="add">+1</button>', description: 'UI' }], explanation: 'ok', dependencies: [] };
const testPlan = { checks: [{ name: 'Adds one', actions: [{ type: 'click', selector: '#add' }], selector: '#count', expected: '1' }], limitations: [] };

/** A DeepSeek-style SSE body that splits the reply across chunks, with usage in the last one. */
const sse = (reply: unknown) => {
  const text = '```json\n' + JSON.stringify(reply) + '\n```';
  const half = Math.floor(text.length / 2);
  const chunk = (content: string, usage?: object) => `data: ${JSON.stringify({ model: 'deepseek-flash', choices: [{ delta: { content } }], usage: usage ?? null })}\n\n`;
  return new Response(new ReadableStream({ start(controller) {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(chunk(text.slice(0, half))));
    controller.enqueue(encoder.encode(chunk(text.slice(half), { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }) + 'data: [DONE]\n\n'));
    controller.close();
  } }), { status: 200 });
};

let fetchMock: ReturnType<typeof vi.fn>;
let live: typeof import('./studio');
let key: typeof import('./key');

beforeEach(async () => {
  vi.resetModules();
  build.mockReset(); checks.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  live = await import('./studio');
  key = await import('./key');
  live.resetLiveStudioForTests();
  key.saveLiveCredentials('sk-test-key-0123456789abcdef', 'deepseek-chat', false);
});
afterEach(() => { vi.unstubAllGlobals(); });

const runToEnd = async (projectId: string) => {
  const events: StudioEvent[] = [];
  // Resolves at the generation's terminal event, like the server's SSE stream.
  await live.liveEventStream(projectId, 0, (event) => events.push(event), new AbortController().signal);
  return events;
};

it('runs plan → code → failed build → repaired build → in-page checks, with server-shaped events', async () => {
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test-key-0123456789abcdef' });
    const system: string = body.messages[0].content;
    return sse(system.includes('project manager') ? plan : system.includes('test planner') ? testPlan : code);
  });
  build.mockResolvedValueOnce({ status: 'failed', errors: ['app.js:1:5: ERROR: Unexpected ";"'], checkedFiles: [] })
    .mockResolvedValueOnce({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<!DOCTYPE html><html></html>' });
  checks.mockResolvedValue({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });

  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  expect(live.isLiveProject(projectId)).toBe(true);
  const events = await runToEnd(projectId);
  expect(events.map((event) => event.type)).toEqual(['queued', 'phase', 'plan_ready', 'phase', 'code_ready', 'phase', 'build_failed', 'phase', 'code_ready', 'phase', 'build_passed', 'ready_for_review']);
  expect(events.find((event) => event.type === 'build_failed')?.data?.errors).toEqual(['app.js:1:5: ERROR: Unexpected ";"']);

  // The repair round receives the real compiler error as a revision note, as on the server.
  const coderCalls = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).messages[1].content as string).filter((user) => user.startsWith('Task:'));
  expect(coderCalls[0]).toContain('"revisionNotes":[]');
  expect(coderCalls[1]).toContain('Unexpected \\";\\"');

  await vi.waitFor(async () => {
    const page = await live.liveRequest('GET', `/api/studio/projects/${projectId}/events?after=12`) as { events: StudioEvent[] };
    expect(page.events.map((event) => event.type)).toEqual(['test_plan_started', 'test_plan_ready', 'browser_run_started', 'browser_check', 'browser_run_finished']);
    expect(page.events.at(-1)?.data).toMatchObject({ status: 'passed', passed: 1, failed: 0, source: 'in-page' });
  });
  const { project } = await live.liveRequest('GET', `/api/studio/projects/${projectId}`) as { project: { status: string; previewFile: string; generationMetrics: { reportedTokens: number; buildAttempts: number } } };
  expect(project).toMatchObject({ status: 'ready_for_review', previewFile: 'v2/dist/index.html' });
  expect(project.generationMetrics).toMatchObject({ buildAttempts: 2, reportedTokens: 90 });
  expect(await live.liveRequest('GET', `/api/studio/projects/${projectId}/preview`)).toEqual({ html: '<!DOCTYPE html><html></html>' });
  expect((await live.liveArchive(projectId)).size).toBeGreaterThan(100);
  await expect(live.liveRequest('GET', '/api/studio/projects/not-live/events?after=0')).resolves.toBeUndefined();
});

it('cancel stops the run with a cancelled event', async () => {
  fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  }));
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await live.liveRequest('POST', `/api/studio/projects/${projectId}/cancel`);
  const events = await runToEnd(projectId);
  expect(events.at(-1)).toMatchObject({ type: 'cancelled', data: { stoppedPhase: 'planning', error: 'Cancelled by you' } });
});

it('a rejected key fails the run with a readable message and never echoes the key', async () => {
  fetchMock.mockResolvedValue(new Response('{"error":{"message":"Authentication Fails, sk-test-key-0123456789abcdef is invalid"}}', { status: 401 }));
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(events.at(-1)).toMatchObject({ type: 'failed', data: { stoppedPhase: 'planning' } });
  expect(String(events.at(-1)?.data?.error)).toContain('rejected the API key');
  expect(JSON.stringify(events)).not.toContain('0123456789abcdef');
});

it('refuses to start without a key', async () => {
  key.forgetLiveCredentials();
  await expect(live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' }))).rejects.toMatchObject({ status: 401 });
});
