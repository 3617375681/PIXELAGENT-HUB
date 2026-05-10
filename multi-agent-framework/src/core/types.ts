// 核心类型定义

export interface Message {
  id: string;
  from: string;
  to: string;
  type: 'task' | 'result' | 'feedback' | 'system';
  payload: any;
  timestamp: number;
}

/** Progress events for SSE / UI; emitted during in-process runs only */
export type RunProgressEvent =
  | { type: 'job_queued'; jobId: string }
  | { type: 'job_running'; jobId: string }
  | { type: 'pipeline_step_start'; stepIndex: number; agentId: string }
  | { type: 'pipeline_step_done'; stepIndex: number; agentId: string; status: string }
  | { type: 'parallel_agent_done'; agentId: string; status: string }
  | { type: 'debate_round_start'; round: number }
  | { type: 'debate_round_done'; round: number }
  | { type: 'vote_agent_done'; agentId: string; status: string }
  | { type: 'company_step'; step: string; agentId: string }
  | { type: 'roundtable_round_start'; round: number }
  | { type: 'roundtable_speaker_done'; round: number; agentId: string; status: string };

/** In-process only: cancellation + progress; strip before sending task JSON to untrusted peers */
export type TaskRunControl = {
  signal?: AbortSignal;
  emit?: (event: RunProgressEvent) => void;
};

export interface Task {
  id: string;
  type: string;
  description: string;
  context?: Record<string, any>;
  priority?: number;
  deadline?: number;
  _exec?: TaskRunControl;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'partial' | 'failed';
  output: any;
  reasoning?: string;
  metadata?: Record<string, any>;
}

export interface Citation {
  id: string;
  sourceTitle: string;
  sourceUrl?: string;
  snippet: string;
  score?: number;
}

export interface EvidenceBundle {
  query: string;
  citations: Citation[];
}

export interface ConversationTurn {
  turnId: string;
  round: number;
  speakerId: string;
  speakerRole: string;
  message: string;
  action: 'question' | 'analysis' | 'proposal' | 'review' | 'decision';
  evidence?: EvidenceBundle;
  timestamp: string;
}

export interface AgentAction {
  agentId: string;
  action: string;
  reasoning?: string;
  payload?: Record<string, any>;
}

export interface RunTrace {
  mode: string;
  startedAt: string;
  finishedAt?: string;
  rounds?: number;
  converged?: boolean;
  actions: AgentAction[];
  conversation?: ConversationTurn[];
}

export interface ModeRunArtifacts {
  sessionId?: string;
  files?: string[];
  memorySnapshot?: Record<string, any>;
  citations?: Citation[];
  runtime?: RuntimeJobRecord;
  observability?: {
    llmCalls: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    estimatedCostUsd?: number;
    byModel?: Record<string, number>;
  };
}

export interface ModeRunResponse {
  mode: string;
  task: Task;
  status: 'success' | 'failed';
  final: any;
  trace: RunTrace;
  artifacts?: ModeRunArtifacts;
  raw?: any;
}

export type RuntimeJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RuntimeJobRecord {
  jobId: string;
  taskId: string;
  sessionId?: string;
  mode: string;
  status: RuntimeJobStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  attempts: number;
  maxRetries: number;
  error?: string;
  queueWaitMs?: number;
  runDurationMs?: number;
  /** Populated when async job completes successfully (see submitBackground). */
  runResult?: ModeRunResponse;
}

export interface VoteCandidate {
  agentId: string;
  score: number;
  rationale: string;
  output: any;
}

export interface VoteResult {
  topic: string;
  winner: VoteCandidate;
  candidates: VoteCandidate[];
  scoreBreakdown: Record<string, number>;
  confidence: number;
  threshold: number;
  tieBreakBy: 'highest_score' | 'agent_order';
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  systemPrompt?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface Agent {
  config: AgentConfig;
  receive(message: Message): Promise<void>;
  execute(task: Task): Promise<TaskResult>;
}

export interface MessageBus {
  subscribe(agentId: string, handler: (msg: Message) => void): void;
  unsubscribe(agentId: string): void;
  send(message: Message): void;
  broadcast(message: Omit<Message, 'to'>): void;
}

export interface PipelineStep {
  agentId: string;
  taskType: string;
  /** Per-step wait timeout for TaskRouter (ms). Falls back to pipeline default. */
  stepTimeoutMs?: number;
  transform?: (prevResult: TaskResult, originalTask: Task) => Task;
}

export interface OrchestratorConfig {
  name: string;
  agents: AgentConfig[];
  pipelines: Record<string, PipelineStep[]>;
  defaultPipeline?: string;
}
