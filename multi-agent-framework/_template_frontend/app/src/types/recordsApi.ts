export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
  ok?: boolean;
  message?: string;
};

export type SessionSummary = {
  sessionId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed';
  taskDescription: string;
  wordCount: number;
};

export type RuntimeJob = {
  jobId: string;
  taskId: string;
  mode: string;
  status: string;
  attempts: number;
  /** Same instant as server `queuedAt`; always set on API responses. */
  createdAt: string;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: 'cron' | 'event'; cron?: string; eventType?: string };
};

export type PipelineRunRecord = {
  runId: string;
  workflowId: string;
  traceId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'waiting_approval';
  triggeredBy: 'cron' | 'event' | 'manual' | 'approval';
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export type ApprovalRecord = {
  approvalId: string;
  runId: string;
  workflowId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt?: string;
  operator?: string;
  reason?: string;
};

export type KnowledgeStats = {
  enabled: boolean;
  retriever: 'keyword' | 'embedding';
  stats?: { model: string; chunks: number; dim: number; updatedAt?: string };
};

export type ScorerWeightsResponse = {
  path: string | null;
  weights: { version: 1; bias: number; cos: number; logChunkLen: number };
};

export type SelfImproveHistoryRow = {
  round: number;
  metric: number;
  hits?: number;
  total?: number;
  at?: string;
};

/** POST /api/run/:mode — supported server modes */
export type AgentRunMode = 'pipeline' | 'parallel' | 'debate' | 'vote' | 'roundtable' | 'company';

export type HealthOk = {
  ok: boolean;
  service?: string;
  recordsRoot?: string;
  runtime?: Record<string, unknown>;
  error?: string;
};

export type MemoryResponse = {
  sessionId: string;
  memory: unknown;
};

export type RuntimeJobEnvelope = { job: Record<string, unknown> };

export type IntelligenceEventResponse = {
  eventType: string;
  matched: number;
  runs: PipelineRunRecord[];
};

/** POST /api/sessions/:sessionId/attachments */
export type SessionAttachment = {
  id: string;
  name: string;
  mime: string;
  path: string;
};
