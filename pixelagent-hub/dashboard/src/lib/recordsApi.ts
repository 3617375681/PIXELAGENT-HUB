import type { ApiErrorShape } from '@/types/recordsApi';
import type { StudioChanges, StudioDiagnostic, StudioEvent, StudioProject, StudioSummary, StudioVersions, StudioTestPlan, StudioReview, StudioBrowserRun } from '@/types/studio';

/** Empty string = same-origin (use Vite `server.proxy` to Records API in dev). */
const RAW_API_BASE = import.meta.env.VITE_RECORDS_API_URL as string | undefined;
const API_BASE =
  typeof RAW_API_BASE === 'string' && RAW_API_BASE.trim().length > 0
    ? RAW_API_BASE.replace(/\/$/, '')
    : '';
const API_KEY = import.meta.env.VITE_RECORDS_API_KEY || '';
const CONNECTION_STORAGE_KEY = `pixelagent:records-key:${API_BASE || 'same-origin'}`;

/** An empty session override explicitly disables the legacy build-time key. */
export function hasRecordsCredential(): boolean {
  return Boolean(currentApiKey());
}

function currentApiKey(): string {
  try {
    return window.sessionStorage.getItem(CONNECTION_STORAGE_KEY) ?? API_KEY;
  } catch {
    return '';
  }
}

export async function connectRecordsApi(key: string): Promise<void> {
  const candidate = key.trim();
  if (!candidate || candidate.length > 4096 || /[^\x21-\x7e]/.test(candidate)) {
    throw new Error('请输入有效的 API Key（不含空格或控制字符）。');
  }
  const res = await fetch(`${API_BASE}/api/sessions`, {
    headers: { 'X-API-Key': candidate },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403
    ? 'API Key 无效或没有访问权限。' : `连接检查失败（HTTP ${res.status}）。`);
  const body = await res.json();
  if (!Array.isArray(body.sessions)) throw new Error('服务返回的内容不是 Records API。');
  window.sessionStorage.setItem(CONNECTION_STORAGE_KEY, candidate);
}

export function disconnectRecordsApi(): void {
  window.sessionStorage.setItem(CONNECTION_STORAGE_KEY, '');
}

function normalizeError(body: unknown, status: number): string {
  const b = (body || {}) as ApiErrorShape;
  if (typeof b.error?.message === 'string' && b.error.message) return b.error.message;
  if (body && typeof body === 'object' && 'ok' in body && (body as { ok: unknown }).ok === false) {
    const cap = body as unknown as { error?: unknown };
    if (typeof cap.error === 'string') return cap.error;
  }
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  if (typeof b.message === 'string' && b.message) return b.message;
  return `HTTP ${status}`;
}

const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

const authHeaders = (): Record<string, string> => {
  const key = currentApiKey();
  return key ? { 'X-API-Key': key } : {};
};

/** Same-origin in dev when Vite proxies `/api` to Records. */
export function getRecordsApiBaseUrl(): string {
  return API_BASE;
}

export async function fetchRecordsBinary(path: string): Promise<Blob> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const base = new URL(`${API_BASE}/`, window.location.origin);
  const target = new URL(url, window.location.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname}api/`) || target.username || target.password) {
    throw new Error('只能下载当前 Records API 的文件。');
  }
  const res = await fetch(target.href, { headers: authHeaders(), redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${path}`);
  return res.blob();
}

/** `offline`: no API reachable (network error, or a proxy/static host answering without JSON). */
export type ApiErrorKind = 'offline' | 'unauthorized' | 'http' | 'invalid';
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
export const OFFLINE_MESSAGE = '本地 API 未连接：请在 pixelagent-hub 目录运行 npm start（或 npm run records:api）。';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      redirect: 'error',
      headers: {
        ...jsonHeaders(),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new ApiError(OFFLINE_MESSAGE, 'offline');
  }
  const raw = await res.text();
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
  if (!res.ok) {
    if (body === undefined && res.status >= 500) throw new ApiError(OFFLINE_MESSAGE, 'offline', res.status);
    throw new ApiError(normalizeError(body, res.status), res.status === 401 || res.status === 403 ? 'unauthorized' : 'http', res.status);
  }
  if (body === undefined) throw new ApiError('服务返回的不是 Records API 数据：请确认 API 地址正确。', 'invalid', res.status);
  return body as T;
}

/**
 * Reads the Studio SSE stream with fetch (EventSource cannot send X-API-Key).
 * Resolves when the server closes the stream, i.e. after the generation's terminal event.
 */
export async function streamStudioEvents(projectId: string, after: number, onEvent: (event: StudioEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/api/studio/projects/${encodeURIComponent(projectId)}/events?stream=1&after=${after}`, { headers: authHeaders(), redirect: 'error', signal });
  if (!res.ok || !res.body) throw new ApiError(`事件流不可用（HTTP ${res.status}）`, res.status === 401 || res.status === 403 ? 'unauthorized' : 'http', res.status);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
      if (data) onEvent(JSON.parse(data));
    }
  }
}

export const studioApi = {
  browserRuns: (projectId: string, signal?: AbortSignal) => request<{ enabled: boolean; runs: StudioBrowserRun[] }>(`/api/studio/projects/${encodeURIComponent(projectId)}/browser-runs`, { signal }),
  startBrowserRun: (projectId: string, testPlanId: string) => request<{ runId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/browser-runs`, { method: 'POST', body: JSON.stringify({ testPlanId }) }),
  cancelBrowserRun: (projectId: string, cancelRunId: string) => request<{ runId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/browser-runs`, { method: 'POST', body: JSON.stringify({ cancelRunId }) }),
  reviews: (projectId: string, signal?: AbortSignal) => request<{ reviews: StudioReview[]; current: StudioReview | null }>(`/api/studio/projects/${encodeURIComponent(projectId)}/reviews`, { signal }),
  saveReview: (projectId: string, payload: Omit<StudioReview, 'id' | 'savedAt' | 'source'>) => request<{ review: StudioReview }>(`/api/studio/projects/${encodeURIComponent(projectId)}/reviews`, { method: 'POST', body: JSON.stringify(payload) }),
  list: (signal?: AbortSignal) => request<{ projects: StudioSummary[] }>('/api/studio/projects', { signal }),
  create: (description: string, idempotencyKey?: string) => request<{ projectId: string; jobId: string }>('/api/studio/projects', { method: 'POST', headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined, body: JSON.stringify({ description }) }),
  project: (projectId: string, signal?: AbortSignal) => request<{ project: StudioProject }>(`/api/studio/projects/${encodeURIComponent(projectId)}`, { signal }),
  preview: (projectId: string, signal?: AbortSignal) => request<{ html: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/preview`, { signal }),
  cancel: (projectId: string) => request<{ project: StudioProject }>(`/api/studio/projects/${encodeURIComponent(projectId)}/cancel`, { method: 'POST' }),
  retry: (projectId: string) => request<{ projectId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/retry`, { method: 'POST', body: '{}' }),
  archive: (projectId: string) => fetchRecordsBinary(`/api/studio/projects/${encodeURIComponent(projectId)}/archive`),
  diagnostics: (projectId: string, signal?: AbortSignal) => request<{ reports: StudioDiagnostic[] }>(`/api/studio/projects/${encodeURIComponent(projectId)}/diagnostics`, { signal }),
  saveDiagnostic: (projectId: string, payload: Pick<StudioDiagnostic, 'previewFile' | 'loaded' | 'errors' | 'testPlanId' | 'checks'>) => request<{ report: StudioDiagnostic }>(`/api/studio/projects/${encodeURIComponent(projectId)}/diagnostics`, { method: 'POST', body: JSON.stringify(payload) }),
  testPlans: (projectId: string, signal?: AbortSignal) => request<{ plans: StudioTestPlan[] }>(`/api/studio/projects/${encodeURIComponent(projectId)}/test-plans`, { signal }),
  createTestPlan: (projectId: string) => request<{ planId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/test-plans`, { method: 'POST', body: '{}' }),
  cancelTestPlan: (projectId: string, cancelPlanId: string) => request<{ plan: StudioTestPlan }>(`/api/studio/projects/${encodeURIComponent(projectId)}/test-plans`, { method: 'POST', body: JSON.stringify({ cancelPlanId }) }),
  repair: (projectId: string, diagnosticId: string) => request<{ projectId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/repair`, { method: 'POST', body: JSON.stringify({ diagnosticId }) }),
  repairBrowserRun: (projectId: string, browserRunId: string) => request<{ projectId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/repair`, { method: 'POST', body: JSON.stringify({ browserRunId }) }),
  changes: (projectId: string, signal?: AbortSignal) => request<{ changes: StudioChanges }>(`/api/studio/projects/${encodeURIComponent(projectId)}/changes`, { signal }),
  versions: (projectId: string, signal?: AbortSignal) => request<StudioVersions>(`/api/studio/projects/${encodeURIComponent(projectId)}/versions`, { signal }),
  selectVersion: (projectId: string, target: string) => request<{ selectedProjectId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/versions`, { method: 'POST', body: JSON.stringify({ projectId: target }) }),
  events: (projectId: string, after = 0, signal?: AbortSignal) => request<{ events: StudioEvent[]; derived: boolean }>(`/api/studio/projects/${encodeURIComponent(projectId)}/events?after=${after}`, { signal }),
  revise: (projectId: string, changeRequest: string) => request<{ projectId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/revise`, { method: 'POST', body: JSON.stringify({ changeRequest }) }),
};
