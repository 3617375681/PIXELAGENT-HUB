export type TriggerType = 'cron' | 'event';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'waiting_approval';

export type IntelligenceSource = {
  kind: 'search' | 'feed' | 'webhook';
  query: string;
  maxItems?: number;
};

export type IntelligenceActionType =
  | 'send_message'
  | 'create_task'
  | 'add_to_bitable'
  | 'schedule_meeting'
  /** NanoClaw-style local tools (paths relative to sandbox root). */
  | 'local_read_file'
  | 'local_write_file'
  | 'local_shell'
  | 'local_http_get'
  | 'local_notify';

export type IntelligenceAction = {
  id: string;
  type: IntelligenceActionType;
  target: string;
  params: Record<string, unknown>;
  idempotencyKey: string;
  requiresApproval: boolean;
};

export type CollectedItem = {
  id: string;
  title: string;
  url?: string;
  content: string;
  publishedAt?: string;
  source: string;
};

export type Insight = {
  summary: string;
  keywords: string[];
  risk: RiskLevel;
  priority: 'P0' | 'P1' | 'P2';
  evidence: CollectedItem[];
};

export type DecisionOutput = {
  summary: string;
  risk: RiskLevel;
  requiresApproval: boolean;
  actions: IntelligenceAction[];
};

export type ActionExecutionResult = {
  actionId: string;
  type: IntelligenceAction['type'];
  status: 'success' | 'failed' | 'skipped';
  retryable: boolean;
  message: string;
  providerRef?: string;
};

export type MonitorSummary = {
  successActions: number;
  failedActions: number;
  skippedActions: number;
  retryableActions: number;
  message: string;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: TriggerType;
    cron?: string;
    eventType?: string;
  };
  sources: IntelligenceSource[];
  analysis: {
    maxItems: number;
    riskThreshold: RiskLevel;
  };
  decision: {
    autoExecuteBelow: RiskLevel;
  };
  actions: Array<{
    type: IntelligenceActionType;
    target: string;
    params: Record<string, unknown>;
  }>;
};

export type WorkflowConfig = {
  version: 1;
  workflows: WorkflowDefinition[];
};

export type PipelineRunRecord = {
  runId: string;
  workflowId: string;
  traceId: string;
  status: RunStatus;
  triggeredBy: 'cron' | 'event' | 'manual' | 'approval';
  startedAt: string;
  finishedAt?: string;
  collectorOutput?: CollectedItem[];
  insight?: Insight;
  decision?: DecisionOutput;
  execution?: ActionExecutionResult[];
  monitor?: MonitorSummary;
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

