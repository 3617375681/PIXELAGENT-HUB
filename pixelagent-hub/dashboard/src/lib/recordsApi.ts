import type {
  AgentRunMode,
  ApiErrorShape,
  ApprovalRecord,
  HealthOk,
  IntelligenceEventResponse,
  KnowledgeStats,
  MemoryResponse,
  PipelineRunRecord,
  RuntimeJob,
  RuntimeJobEnvelope,
  ScorerWeightsResponse,
  SelfImproveHistoryRow,
  SessionAttachment,
  SessionSummary,
  WorkflowDefinition,
} from '@/types/recordsApi';
import type { StudioChanges, StudioDiagnostic, StudioProject, StudioSummary, StudioVersions, StudioTestPlan, StudioReview, StudioBrowserRun } from '@/types/studio';

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

export function sessionFileUrl(sessionId: string, fileId: string): string {
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`;
  return API_BASE ? `${API_BASE}${path}` : path;
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

async function fileToUploadPart(file: File): Promise<{ name: string; mime: string; data: string }> {
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type || 'application/octet-stream', data };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    redirect: 'error',
    headers: {
      ...jsonHeaders(),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(normalizeError(body, res.status)), { status: res.status });
  return body as T;
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
  revise: (projectId: string, changeRequest: string) => request<{ projectId: string; jobId: string }>(`/api/studio/projects/${encodeURIComponent(projectId)}/revise`, { method: 'POST', body: JSON.stringify({ changeRequest }) }),
};

/** POST /api/run/:mode — supports async=1 (202 + jobUrl) or stream=1 (SSE text body). */
async function postAgentRun(
  mode: AgentRunMode,
  body: Record<string, unknown>,
  opts?: { async?: boolean; stream?: boolean; signal?: AbortSignal },
): Promise<unknown> {
  const q = new URLSearchParams();
  if (opts?.async) q.set('async', '1');
  if (opts?.stream) q.set('stream', '1');
  const qs = q.toString();
  const path = `/api/run/${encodeURIComponent(mode)}${qs ? `?${qs}` : ''}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: opts?.signal,
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} (stream)`);
    return { _stream: true as const, text };
  }
  const json = await res.json();
  if (!res.ok) throw new Error(normalizeError(json, res.status));
  return json;
}

export const recordsApi = {
  getHealth: () => request<HealthOk>('/health'),
  getLiveness: () => request<HealthOk>('/health/liveness'),
  getReadiness: () => request<HealthOk>('/health/readiness'),

  listSessions: (opts?: { signal?: AbortSignal }) =>
    request<{ sessions: SessionSummary[] }>('/api/sessions', { signal: opts?.signal }),
  getSession: (sessionId: string, opts?: { signal?: AbortSignal }) =>
    request<{ session: Record<string, unknown>; markdown: string }>(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
      { signal: opts?.signal },
    ),
  deleteSession: (sessionId: string) =>
    request<{ ok: boolean; sessionId: string }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }),
  getMemory: (sessionId: string) =>
    request<MemoryResponse>(`/api/memory?sessionId=${encodeURIComponent(sessionId)}`),
  /** Writes `session-index.json` under records root; optional `sessionId` query is accepted by backend. */
  exportSessionIndex: (sessionId?: string) =>
    request<{ ok: boolean; file: string }>(
      `/api/export${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`
    ),
  getRuntimeMetrics: () => request<{ runtime: Record<string, unknown> }>('/api/runtime/metrics'),
  listRuntimeJobs: (limit: number = 50) => request<{ jobs: RuntimeJob[] }>(`/api/runtime/jobs?limit=${limit}`),
  getRuntimeJob: (jobId: string, opts?: { signal?: AbortSignal }) =>
    request<RuntimeJobEnvelope>(`/api/runtime/jobs/${encodeURIComponent(jobId)}`, { signal: opts?.signal }),
  cancelRuntimeJob: (jobId: string) =>
    request<{ ok: true; jobId: string }>(`/api/runtime/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  listWorkflows: () => request<{ workflows: WorkflowDefinition[] }>('/api/intelligence/workflows'),
  triggerWorkflow: (workflowId: string) =>
    request<{ run: PipelineRunRecord }>('/api/intelligence/trigger', {
      method: 'POST',
      body: JSON.stringify({ workflowId }),
    }),
  validateWorkflowJson: (payload: unknown) =>
    request<{ ok: boolean; error?: string }>('/api/intelligence/workflows/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reloadWorkflows: (payload?: Record<string, unknown>) =>
    request<{ ok: boolean }>('/api/intelligence/workflows/reload', {
      method: 'POST',
      body: JSON.stringify(payload && Object.keys(payload).length > 0 ? payload : {}),
    }),
  postIntelligenceEvent: (eventType: string) =>
    request<IntelligenceEventResponse>('/api/intelligence/events', {
      method: 'POST',
      body: JSON.stringify({ eventType }),
    }),
  listRuns: (limit: number = 50) => request<{ runs: PipelineRunRecord[] }>(`/api/intelligence/runs?limit=${limit}`),
  getIntelligenceRun: (runId: string) =>
    request<{ run: PipelineRunRecord }>(`/api/intelligence/runs/${encodeURIComponent(runId)}`),
  listApprovals: (status: 'pending' | 'approved' | 'rejected' | '' = 'pending') =>
    request<{ approvals: ApprovalRecord[] }>(`/api/intelligence/approvals${status ? `?status=${status}` : ''}`),
  resolveApproval: (approvalId: string, payload: { decision: 'approved' | 'rejected'; operator: string; reason?: string }) =>
    request<{ approval: ApprovalRecord }>(`/api/intelligence/approvals/${encodeURIComponent(approvalId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getIntelMetrics: () => request<{ metrics: Record<string, number> }>('/api/intelligence/metrics'),
  runSelfImprove: (rounds: number) =>
    request<{ rounds: Array<{ round: number; metric: number; path?: string }> }>('/api/intelligence/self-improve', {
      method: 'POST',
      body: JSON.stringify({ rounds }),
    }),
  getSelfImproveHistory: (limit: number = 50) =>
    request<{ history: SelfImproveHistoryRow[] }>(`/api/intelligence/self-improve/history?limit=${limit}`),
  getRetrievalScorer: () => request<ScorerWeightsResponse>('/api/intelligence/retrieval-scorer'),
  getKnowledgeStats: () => request<KnowledgeStats>('/api/knowledge/stats'),
  indexKnowledge: (documents: Array<{ id?: string; title: string; text: string; sourceUrl?: string; tags?: string[] }>) =>
    request<{ ok: boolean; chunks: number; dim: number; documents: number }>('/api/knowledge/index', {
      method: 'POST',
      body: JSON.stringify({ documents }),
    }),

  /** Classic multi-agent modes (orchestrator): pipeline | parallel | debate | vote | roundtable | company */
  postRun: postAgentRun,

  uploadSessionAttachments: async (sessionId: string, files: File[]) => {
    const parts = await Promise.all(files.map((f) => fileToUploadPart(f)));
    return request<{ ok: boolean; attachments: SessionAttachment[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/attachments`,
      { method: 'POST', body: JSON.stringify({ files: parts }) },
    );
  },

  /** Proxy to Seedance 2.0 (server uses AIMLAPI_KEY / SEEDANCE_API_KEY). */
  seedanceCreateVideo: (body: Record<string, unknown>) =>
    request<unknown>('/api/capabilities/seedance/video', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  seedanceGetVideo: (generationId: string) =>
    request<unknown>(
      `/api/capabilities/seedance/video?generationId=${encodeURIComponent(generationId)}`,
    ),
};
