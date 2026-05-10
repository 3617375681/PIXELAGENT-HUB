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

/** Empty string = same-origin (use Vite `server.proxy` to Records API in dev). */
const RAW_API_BASE = import.meta.env.VITE_RECORDS_API_URL as string | undefined;
const API_BASE =
  typeof RAW_API_BASE === 'string' && RAW_API_BASE.trim().length > 0
    ? RAW_API_BASE.replace(/\/$/, '')
    : '';
const API_KEY = import.meta.env.VITE_RECORDS_API_KEY || '';

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
  ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
});

const authHeaders = (): Record<string, string> => (API_KEY ? { 'X-API-Key': API_KEY } : {});

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
  const res = await fetch(url, { headers: authHeaders() });
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
    headers: {
      ...jsonHeaders(),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(normalizeError(body, res.status));
  return body as T;
}

/** POST /api/run/:mode — supports async=1 (202 + jobUrl) or stream=1 (SSE text body). */
async function postAgentRun(
  mode: AgentRunMode,
  body: Record<string, unknown>,
  opts?: { async?: boolean; stream?: boolean },
): Promise<unknown> {
  const q = new URLSearchParams();
  if (opts?.async) q.set('async', '1');
  if (opts?.stream) q.set('stream', '1');
  const qs = q.toString();
  const path = `/api/run/${encodeURIComponent(mode)}${qs ? `?${qs}` : ''}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} (stream)`);
    return { _stream: true as const, text };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(normalizeError(json, res.status));
  return json;
}

export const recordsApi = {
  getHealth: () => request<HealthOk>('/health'),
  getLiveness: () => request<HealthOk>('/health/liveness'),
  getReadiness: () => request<HealthOk>('/health/readiness'),

  listSessions: () => request<{ sessions: SessionSummary[] }>('/api/sessions'),
  getSession: (sessionId: string) =>
    request<{ session: Record<string, unknown>; markdown: string }>(
      `/api/sessions/${encodeURIComponent(sessionId)}`
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
  getRuntimeJob: (jobId: string) =>
    request<RuntimeJobEnvelope>(`/api/runtime/jobs/${encodeURIComponent(jobId)}`),
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
