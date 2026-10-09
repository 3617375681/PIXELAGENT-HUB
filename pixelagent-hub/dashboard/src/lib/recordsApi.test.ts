import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let storage: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:3100' },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  vi.stubEnv('VITE_RECORDS_API_URL', '');
  vi.stubEnv('VITE_RECORDS_API_KEY', 'legacy-fixture-key');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('sends the explicit creation key with authentication on repeated requests', async () => {
  const api = await import('./recordsApi');
  fetchMock.mockImplementation(async () => Response.json({ projectId: 'fixture', jobId: 'studio-fixture' }));
  await api.studioApi.create('Counter', 'same-request');
  await api.studioApi.create('Counter', 'same-request');
  for (const call of fetchMock.mock.calls) {
    expect(call[1].headers['Idempotency-Key']).toBe('same-request');
    expect(call[1].headers['X-API-Key']).toBe('legacy-fixture-key');
    expect(JSON.parse(call[1].body)).toEqual({ description: 'Counter' });
  }
});

it('verifies a candidate before saving and keeps the old connection after rejection', async () => {
  const api = await import('./recordsApi');
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  await expect(api.connectRecordsApi('wrong-fixture-key')).rejects.toThrow('无效');
  expect(storage.size).toBe(0);
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await api.recordsApi.listSessions();
  expect(fetchMock.mock.calls[1][1].headers['X-API-Key']).toBe('legacy-fixture-key');
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await api.connectRecordsApi('new-fixture-key');
  expect(fetchMock.mock.calls[2][0]).toBe('/api/sessions');
  expect(fetchMock.mock.calls[2][1].redirect).toBe('error');
  expect(api.hasRecordsCredential()).toBe(true);
  expect([...storage.values()]).toEqual(['new-fixture-key']);
});

it('uses the runtime credential for JSON, streaming and binary then clears even a bundled key', async () => {
  const api = await import('./recordsApi');
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await api.connectRecordsApi('session-fixture-key');
  fetchMock.mockResolvedValueOnce(Response.json({ projects: [] }));
  await api.studioApi.list();
  fetchMock.mockResolvedValueOnce(new Response('data: done', { headers: { 'content-type': 'text/event-stream' } }));
  await api.recordsApi.postRun('pipeline', {}, { stream: true });
  fetchMock.mockResolvedValueOnce(new Response('zip'));
  await api.studioApi.archive('fixture');
  for (const call of fetchMock.mock.calls.slice(1)) {
    expect(call[1].headers['X-API-Key']).toBe('session-fixture-key');
    expect(call[1].redirect).toBe('error');
    expect(call[0]).not.toContain('session-fixture-key');
  }
  api.disconnectRecordsApi();
  expect(api.hasRecordsCredential()).toBe(false);
  vi.resetModules();
  const reloaded = await import('./recordsApi');
  fetchMock.mockResolvedValueOnce(Response.json({ projects: [] }));
  await reloaded.studioApi.list();
  expect(fetchMock.mock.lastCall?.[1].headers).not.toHaveProperty('X-API-Key');
});

it('scopes credentials to the configured API and blocks external or non-API downloads before fetching', async () => {
  vi.stubEnv('VITE_RECORDS_API_URL', 'https://records.example/service');
  const api = await import('./recordsApi');
  for (const path of ['https://other.example/api/file', 'https://records.example/api/file', '/api/../private', '/private', 'https://user:pass@records.example/service/api/file']) {
    await expect(api.fetchRecordsBinary(path)).rejects.toThrow('当前 Records API');
  }
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(new Response('image'));
  await api.fetchRecordsBinary('https://records.example/service/api/file');
  expect(fetchMock.mock.lastCall?.[0]).toBe('https://records.example/service/api/file');
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await api.connectRecordsApi('scoped-fixture-key');
  vi.resetModules();
  vi.stubEnv('VITE_RECORDS_API_URL', 'https://other.example');
  const other = await import('./recordsApi');
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await other.recordsApi.listSessions();
  expect(fetchMock.mock.lastCall?.[1].headers['X-API-Key']).toBe('legacy-fixture-key');
});

it('rejects invalid keys and unexpected service responses without storing credentials', async () => {
  const api = await import('./recordsApi');
  for (const key of ['', 'bad\r\nkey', 'a'.repeat(4097)]) await expect(api.connectRecordsApi(key)).rejects.toThrow('有效');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  await expect(api.connectRecordsApi('fixture-key')).rejects.toThrow('不是 Records API');
  expect(storage.size).toBe(0);
});

it('fails closed when session storage is unavailable', async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:3100' }, sessionStorage: {
    getItem: () => { throw new Error('storage unavailable'); },
    setItem: () => { throw new Error('storage unavailable'); },
  } });
  const api = await import('./recordsApi');
  expect(api.hasRecordsCredential()).toBe(false);
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await api.recordsApi.listSessions();
  expect(fetchMock.mock.lastCall?.[1].headers).not.toHaveProperty('X-API-Key');
  expect(() => api.disconnectRecordsApi()).toThrow('storage unavailable');
  fetchMock.mockResolvedValueOnce(Response.json({ sessions: [] }));
  await expect(api.connectRecordsApi('fixture-key')).rejects.toThrow('storage unavailable');
});
