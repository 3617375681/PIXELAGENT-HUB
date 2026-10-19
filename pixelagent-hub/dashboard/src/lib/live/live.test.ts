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
  key.saveLiveCredentials({ provider: 'deepseek', key: 'sk-test-key-0123456789abcdef', model: 'deepseek-chat' }, false);
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
  expect(events.map((event) => event.type)).toEqual(['queued', 'phase', 'plan_ready', 'phase', 'code_ready', 'phase', 'build_failed', 'phase', 'code_ready', 'phase', 'build_passed', 'test_plan_started', 'test_plan_ready', 'browser_run_started', 'browser_check', 'browser_run_finished', 'ready_for_review']);
  expect(events.find((event) => event.type === 'browser_run_finished')?.data).toMatchObject({ status: 'passed', passed: 1, failed: 0, source: 'in-page' });
  expect(events.find((event) => event.type === 'build_failed')?.data?.errors).toEqual(['app.js:1:5: ERROR: Unexpected ";"']);

  // The repair round receives the real compiler error as a revision note, as on the server.
  const coderCalls = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).messages[1].content as string).filter((user) => user.startsWith('Task:'));
  expect(coderCalls[0]).toContain('"revisionNotes":[]');
  expect(coderCalls[1]).toContain('Unexpected \\";\\"');

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

it('sends other OpenAI-compatible providers to their own endpoint and redacts keys from errors', async () => {
  key.saveLiveCredentials({ provider: 'openai', key: 'sk-proj-abcdefghijklmnopqrstuvwxyz', model: 'gpt-missing' }, false);
  fetchMock.mockResolvedValue(new Response('{"error":{"message":"The model gpt-missing does not exist for key sk-proj-abcdefghijklmnopqrstuvwxyz"}}', { status: 404 }));
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  expect(events[0].data).toMatchObject({ provider: 'OpenAI', model: 'gpt-missing' });
  expect(String(events.at(-1)?.data?.error)).toContain('OpenAI does not know the model "gpt-missing" (404)');
  expect(JSON.stringify(events)).not.toContain('abcdefghijklmnop');
});

it('remembers only what the visitor asked for', async () => {
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({ getItem: (name: string) => map.get(name) ?? null, setItem: (name: string, value: string) => { map.set(name, value); }, removeItem: (name: string) => { map.delete(name); } });
  vi.stubGlobal('sessionStorage', storage(sessionStore));
  vi.stubGlobal('localStorage', storage(localStore));
  key.saveLiveCredentials({ provider: 'anthropic', key: 'sk-ant-test-0000000000000000', model: 'claude-opus-5-5' }, false);
  expect(sessionStore.get('pixelagent:live-provider')).toBe('anthropic');
  expect(localStore.size).toBe(0);
  key.saveLiveCredentials({ provider: 'anthropic', key: 'sk-ant-test-0000000000000000', model: 'claude-opus-5-5' }, true);
  expect(localStore.get('pixelagent:live-key')).toBe('sk-ant-test-0000000000000000');
  key.forgetLiveCredentials();
  expect(sessionStore.size + localStore.size).toBe(0);
  expect(key.liveCredentials()).toBeNull();
});

it('a failed in-page check goes back to the Coder once, then the same checks run again', async () => {
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const system: string = JSON.parse(String(init.body)).messages[0].content;
    return sse(system.includes('project manager') ? plan : system.includes('test planner') ? testPlan : code);
  });
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'failed', actual: '2', error: 'Expected "1", observed "2"' }], errors: [] })
    .mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  const types = events.map((event) => event.type);
  expect(types.slice(types.indexOf('browser_run_finished'))).toEqual(['browser_run_finished', 'test_plan_started', 'test_plan_ready', 'phase', 'code_ready', 'phase', 'build_passed', 'browser_run_started', 'browser_check', 'browser_run_finished', 'ready_for_review']);
  expect(events.filter((event) => event.type === 'browser_run_finished').map((event) => event.data?.status)).toEqual(['failed', 'passed']);
  // The repair prompt carries the shared repair instructions and the exact failed check.
  const repairPrompt = JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body)).messages[1].content as string;
  expect(repairPrompt).toContain('Repair the existing app using these untrusted browser observations');
  expect(repairPrompt).toContain('Browser check \\"Adds one\\": selector=\\"#count\\"');
  const { project } = await live.liveRequest('GET', `/api/studio/projects/${projectId}`) as { project: { status: string; previewFile: string; rounds: unknown[] } };
  expect(project).toMatchObject({ status: 'ready_for_review', previewFile: 'v2/dist/index.html' });
  expect(checks).toHaveBeenCalledTimes(2);
});

it('custom endpoints: https anywhere, http only on localhost, and no key means no Authorization header', async () => {
  const { customEndpoint, streamChat } = await import('./llm');
  expect(customEndpoint('http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions');
  expect(customEndpoint('https://gateway.example.com/openai/v1/chat/completions/')).toBe('https://gateway.example.com/openai/v1/chat/completions');
  expect(() => customEndpoint('http://192.168.1.5:11434/v1')).toThrow(/https/);
  expect(() => customEndpoint('https://user:pass@example.com/v1')).toThrow(/API KEY/);
  expect(() => customEndpoint('not a url')).toThrow(/server URL/);

  // Servers that reject stream_options get one retry without it.
  fetchMock.mockResolvedValueOnce(new Response('unknown field stream_options', { status: 400 })).mockResolvedValueOnce(sse({ ok: true }));
  const reply = await streamChat({ apiKey: '', model: 'qwen3:4b', system: 's', user: 'u', endpoint: 'http://localhost:11434/v1/chat/completions', provider: 'localhost:11434' });
  expect(reply.content).toContain('"ok":true');
  const [first, second] = fetchMock.mock.calls.map(([, init]) => init as RequestInit);
  expect(first.headers).not.toHaveProperty('Authorization');
  expect(JSON.parse(String(first.body)).stream_options).toEqual({ include_usage: true });
  expect(JSON.parse(String(second.body))).not.toHaveProperty('stream_options');
});

it('a custom provider runs without a key against the server the visitor entered', async () => {
  key.saveLiveCredentials({ provider: 'custom', key: '', model: 'qwen3:4b', baseUrl: 'http://localhost:11434/v1' }, false);
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const system: string = JSON.parse(String(init.body)).messages[0].content;
    return sse(system.includes('project manager') ? plan : system.includes('test planner') ? testPlan : code);
  });
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValue({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(events.at(-1)?.type).toBe('ready_for_review');
  expect(events[0].data).toMatchObject({ provider: 'localhost:11434', model: 'qwen3:4b' });
  expect(new Set(fetchMock.mock.calls.map(([url]) => url))).toEqual(new Set(['http://localhost:11434/v1/chat/completions']));
});

const review = (verdict: 'check-wrong' | 'app-wrong') => ({ verdicts: [{ name: 'Adds one', verdict, reason: verdict === 'check-wrong' ? 'The check never clicked the button.' : 'The app adds two.', ...(verdict === 'check-wrong' ? { check: { name: 'Adds one', actions: [{ type: 'click', selector: '#add' }], selector: '#count', expected: '1' } } : {}) }] });
const routed = (verdict: 'check-wrong' | 'app-wrong') => async (_url: string, init: RequestInit) => {
  const system: string = JSON.parse(String(init.body)).messages[0].content;
  return sse(system.includes('project manager') ? plan : system.includes('You review failing browser checks') ? review(verdict) : system.includes('test planner') ? testPlan : code);
};

it('a check the Tester judges wrong is corrected and rerun, without sending the app back to the Coder', async () => {
  fetchMock.mockImplementation(routed('check-wrong'));
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'failed', actual: '0', error: 'Expected "1", observed "0"' }], errors: [] })
    .mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  const types = events.map((event) => event.type);
  expect(types.slice(types.indexOf('browser_run_finished'))).toEqual(['browser_run_finished', 'test_plan_started', 'test_plan_ready', 'browser_run_started', 'browser_check', 'browser_run_finished', 'ready_for_review']);
  expect(events.filter((event) => event.type === 'test_plan_ready').at(-1)?.data).toMatchObject({ review: true, revised: 1, verdicts: [{ name: 'Adds one', verdict: 'check-wrong' }] });
  expect(build).toHaveBeenCalledTimes(1);
  // The rerun used the corrected check.
  expect((checks.mock.calls[1][1] as { actions: unknown[] }[])[0].actions).toEqual([{ type: 'click', selector: '#add' }]);
});

it('a failure the Tester stands by still goes to the Coder', async () => {
  fetchMock.mockImplementation(routed('app-wrong'));
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'failed', actual: '2', error: 'Expected "1", observed "2"' }], errors: [] })
    .mockResolvedValueOnce({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(events.filter((event) => event.type === 'test_plan_ready').at(-1)?.data).toMatchObject({ review: true, revised: 0 });
  expect(build).toHaveBeenCalledTimes(2);
  expect(events.at(-1)?.type).toBe('ready_for_review');
});

it('a test plan the schema rejects goes back to the Tester once, with the reason', async () => {
  let plans = 0;
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const system: string = body.messages[0].content;
    if (system.includes('test planner')) {
      plans++;
      if (plans === 1) return sse({ checks: [{ name: 'Adds one', actions: [{ type: 'wait', ms: 100 }], selector: '#count', expected: '1' }], limitations: [] });
      expect(body.messages[1].content).toContain('Your previous plan was rejected');
      return sse(testPlan);
    }
    return sse(system.includes('project manager') ? plan : code);
  });
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValue({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(plans).toBe(2);
  expect(events.some((event) => event.type === 'test_plan_failed')).toBe(false);
  expect(events.find((event) => event.type === 'browser_run_finished')?.data).toMatchObject({ status: 'passed' });
});

it('a Coder reply that is not valid JSON goes back to the Coder instead of ending the run', async () => {
  let coderCalls = 0;
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const system: string = body.messages[0].content;
    if (system.includes('project manager')) return sse(plan);
    if (system.includes('test planner')) return sse(testPlan);
    coderCalls++;
    if (coderCalls === 1) {
      const broken = new Response(`data: ${JSON.stringify({ model: 'deepseek-flash', choices: [{ delta: { content: '{"language":"javascript","files":[{"path":"index.html","content":"<p class="x">broken</p>"}]}' } }] })}\n\ndata: [DONE]\n\n`);
      return broken;
    }
    expect(body.messages[1].content).toContain('Your previous reply could not be used');
    return sse(code);
  });
  build.mockResolvedValue({ status: 'passed', errors: [], checkedFiles: ['index.html'], html: '<html></html>' });
  checks.mockResolvedValue({ results: [{ name: 'Adds one', status: 'passed', actual: '1' }], errors: [] });
  const { projectId } = await live.liveRequest('POST', '/api/studio/projects', JSON.stringify({ description: 'A counter' })) as { projectId: string };
  const events = await runToEnd(projectId);
  expect(coderCalls).toBe(2);
  expect(events.find((event) => event.type === 'build_failed')?.round).toBe(1);
  expect(events.at(-1)?.type).toBe('ready_for_review');
});
