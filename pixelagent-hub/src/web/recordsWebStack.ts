import { readdir, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createOrchestrator } from '../factory.js';
import { ModeRunResponse, RunProgressEvent, RunTrace, RuntimeJobRecord, Task, TaskRunControl } from '../core/types.js';
import { LocalKeywordRetriever, DEFAULT_KNOWLEDGE_BASE, Retriever } from '../core/retriever.js';
import { LocalEmbeddingRetriever } from '../core/embeddingRetriever.js';
import { KnowledgeStore } from '../core/KnowledgeStore.js';
import { RoundtableRunner } from '../core/RoundtableRunner.js';
import { loadWebServerConfig, resolveRunTimeoutMs } from './config.js';
import { toApiError } from './errors.js';
import { FixedWindowRateLimiter } from './rateLimiter.js';
import { RunRuntime } from './runRuntime.js';
import { WorkflowConfigService } from '../intelligence/core/workflowConfig.js';
import { IntelligenceRunStore } from '../intelligence/core/runStore.js';
import { IntelligencePipelineService } from '../intelligence/core/pipelineService.js';
import { readSessionUploadFile, saveSessionAttachments } from './sessionUploads.js';
import { seedanceCreateTask, seedanceGetTask } from './seedanceClient.js';

export type RecordsWebStack = ReturnType<typeof createRecordsWebStack>;

/** Aligns HTTP job payloads with the frontend `RuntimeJob` type (`createdAt` alias). */
function serializeRuntimeJobForApi(job: RuntimeJobRecord): RuntimeJobRecord & { createdAt: string } {
  return { ...job, createdAt: job.queuedAt };
}

type SessionSummary = {
  sessionId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed';
  taskDescription: string;
  wordCount: number;
};

export function createRecordsWebStack(env: NodeJS.ProcessEnv = process.env) {
  function logInfo(event: string, payload: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', event, at: new Date().toISOString(), ...payload }));
  }

  function logError(event: string, payload: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', event, at: new Date().toISOString(), ...payload }));
  }

  const RECORDS_ROOT = env.RECORDS_ROOT_OVERRIDE?.trim() || join(process.cwd(), 'records', 'company-mode');
  const config = loadWebServerConfig(env);
  const PORT = config.port;
  const scorerWeightsPath = join(RECORDS_ROOT, 'intelligence', 'retrieval-scorer.json');
  const retriever: Retriever = env.ENABLE_EMBEDDING_RETRIEVER === 'true'
    ? new LocalEmbeddingRetriever({
        storePath: join(RECORDS_ROOT, 'knowledge', 'vector-store.json'),
        ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        model: env.OLLAMA_EMBED_MODEL || 'qwen3:14b',
        chunkSize: Number(env.KB_CHUNK_SIZE || 500),
        overlap: Number(env.KB_CHUNK_OVERLAP || 80),
        scorerWeightsPath,
        defaultDocuments: DEFAULT_KNOWLEDGE_BASE.map((x, idx) => ({
          id: `seed-${idx + 1}`,
          title: x.title,
          sourceUrl: x.url,
          text: x.text,
          tags: x.tags,
        })),
      })
    : new LocalKeywordRetriever();
  const runRateLimiter = new FixedWindowRateLimiter(config.runRateLimitPerMinute, 60_000);
  const USD_PER_1K_TOKENS = Number(env.USD_PER_1K_TOKENS || 0.002);
  const runtime = new RunRuntime({
    recordsRoot: RECORDS_ROOT,
    maxConcurrency: config.maxRunConcurrency,
    maxQueueSize: config.runQueueSize,
    maxRetries: config.runMaxRetries,
  });
  const intelligenceConfig = new WorkflowConfigService(join(process.cwd(), 'config', 'workflows.yaml'));
  const intelligenceStore = new IntelligenceRunStore(join(RECORDS_ROOT, 'intelligence', 'runs.json'));
  const intelligence = new IntelligencePipelineService(intelligenceConfig, intelligenceStore, {
    actionProvider: String(env.INTELLIGENCE_PROVIDER || '').toLowerCase() === 'local' ? 'local' : 'mock',
    recordsRoot: RECORDS_ROOT,
    retriever,
    evalDatasetPath: join(process.cwd(), 'config', 'eval', 'knowledge-qa.json'),
    scorerWeightsPath,
    env,
  });
  const runtimeReady = runtime.init().then(async () => {
    const recovered = await runtime.recoverInterruptedJobs();
    if (recovered > 0) {
      logInfo('runtime.recovered_jobs', { recovered });
    }
  });
  const intelligenceReady = intelligence.init().catch((err) => {
    logError('intelligence.init_failed', { error: String(err) });
  });

async function ensureRecordsRoot(): Promise<void> {
  await mkdir(RECORDS_ROOT, { recursive: true });
}

async function listSessionIds(): Promise<string[]> {
  await ensureRecordsRoot();
  const entries = await readdir(RECORDS_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readJson(path: string): Promise<any> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

async function listSummaries(): Promise<SessionSummary[]> {
  const ids = await listSessionIds();
  const rows: SessionSummary[] = [];
  for (const sessionId of ids) {
    const sessionPath = join(RECORDS_ROOT, sessionId, 'session.json');
    try {
      const data = await readJson(sessionPath);
      rows.push({
        sessionId,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        status: data.status,
        taskDescription: data.task?.description || data.final?.topic || '',
        wordCount: Number(data.finalDraft?.wordCount || 0),
      });
    } catch (err) {
      logError('sessions.read_failed', { sessionId, error: String(err) });
    }
  }
  rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return rows;
}

async function readSessionSummary(sessionId: string): Promise<SessionSummary | null> {
  const sessionPath = join(RECORDS_ROOT, sessionId, 'session.json');
  try {
    const data = await readJson(sessionPath);
    return {
      sessionId,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      status: data.status,
      taskDescription: data.task?.description || data.final?.topic || '',
      wordCount: Number(data.finalDraft?.wordCount || 0),
    };
  } catch {
    return null;
  }
}

function corsOrigin(req: any): string {
  const origin = req.headers?.origin || '';
  if (config.allowedOrigins.length > 0 && config.allowedOrigins.includes(origin)) {
    return origin;
  }
  if (config.allowUnauthInDev && config.allowedOrigins.length === 0) {
    return origin || '*';
  }
  return config.allowedOrigins[0] || '';
}

function sendJson(res: any, status: number, payload: unknown): void {
  // CORS headers are set per-request in handleRequest's OPTIONS check
  // sendJson adds minimal headers; the handleRequest wrapper adds CORS via res._corsOrigin
  const extraHeaders: Record<string, string> = {};
  if ((res as any)._corsOrigin) {
    extraHeaders['Access-Control-Allow-Origin'] = (res as any)._corsOrigin;
    extraHeaders['Vary'] = 'Origin';
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendBinary(res: any, status: number, body: Buffer, contentType: string, filename: string): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': String(body.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  res.end(body);
}

function setResponseCors(req: any, res: any): void {
  const origin = corsOrigin(req);
  if (origin) (res as any)._corsOrigin = origin;
}

function sendError(
  res: any,
  status: number,
  code: Parameters<typeof toApiError>[0],
  message: string,
  requestId: string,
  details?: Record<string, unknown>
): void {
  sendJson(res, status, toApiError(code, message, requestId, details));
}

function nowMs(): number {
  return Date.now();
}

function getRequestId(req: any): string {
  const fromHeader = req.headers['x-request-id'];
  return typeof fromHeader === 'string' && fromHeader.length > 0
    ? fromHeader
    : `req-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAuthorized(req: any): boolean {
  if (config.allowUnauthInDev) return true;
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const token = (typeof apiKeyHeader === 'string' ? apiKeyHeader : '') || bearer;
  return Boolean(token) && token === config.recordsApiKey;
}

function isProtectedPath(pathname: string, _method: string): boolean {
  return pathname.startsWith('/api/');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, tag: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${tag}_TIMEOUT_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBody(req: any): Promise<any> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildTask(input: any): Task {
  return {
    id: input?.id || `task-${Date.now()}`,
    type: input?.type || 'content',
    description: input?.description || '请生成一份结构化分析内容',
    context: input?.context || {},
  };
}

function sanitizeTaskForResponse(task: Task): Task {
  const { _exec: _drop, ...rest } = task;
  return rest as Task;
}

function createBaseTrace(mode: string): RunTrace {
  return {
    mode,
    startedAt: new Date().toISOString(),
    actions: [],
  };
}

function finishTrace(trace: RunTrace, rounds?: number, converged?: boolean): RunTrace {
  return {
    ...trace,
    rounds,
    converged,
    finishedAt: new Date().toISOString(),
  };
}

function buildRunResponse(mode: string, task: Task, final: any, trace: RunTrace, status: 'success' | 'failed', raw?: any, artifacts?: any): ModeRunResponse {
  const safeTask = sanitizeTaskForResponse(task);
  const toSerializable = (value: any) => {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'object') return value;
    const seen = new WeakSet();
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      })
    );
  };
  return {
    mode,
    task: toSerializable(safeTask),
    status,
    final: toSerializable(final),
    trace: toSerializable(trace),
    raw: toSerializable(raw),
    artifacts: toSerializable(artifacts),
  };
}

function safeStringifyObject(value: any): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  });
}

type UsagePoint = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model?: string;
};

function collectUsagePoints(input: unknown, points: UsagePoint[] = [], seen: WeakSet<object> = new WeakSet()): UsagePoint[] {
  if (!input || typeof input !== 'object') return points;
  const node = input as Record<string, unknown>;
  if (seen.has(node)) return points;
  seen.add(node);
  const llmUsage = node.llmUsage as Record<string, unknown> | undefined;
  if (llmUsage) {
    points.push({
      prompt_tokens: Number(llmUsage.prompt_tokens || 0),
      completion_tokens: Number(llmUsage.completion_tokens || 0),
      total_tokens: Number(llmUsage.total_tokens || 0),
      model: typeof node.llmModel === 'string' ? node.llmModel : undefined,
    });
  }
  Object.values(node).forEach((child) => {
    collectUsagePoints(child, points, seen);
  });
  return points;
}

function buildObservability(raw: unknown): {
  llmCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  byModel?: Record<string, number>;
} {
  const points = collectUsagePoints(raw);
  const byModel: Record<string, number> = {};
  const summary = points.reduce((acc, p) => {
    acc.totalPromptTokens += p.prompt_tokens;
    acc.totalCompletionTokens += p.completion_tokens;
    acc.totalTokens += p.total_tokens;
    if (p.model) byModel[p.model] = (byModel[p.model] || 0) + 1;
    return acc;
  }, {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
  });
  const estimatedCostUsd = Number(((summary.totalTokens / 1000) * USD_PER_1K_TOKENS).toFixed(6));
  return {
    llmCalls: points.length,
    totalPromptTokens: summary.totalPromptTokens,
    totalCompletionTokens: summary.totalCompletionTokens,
    totalTokens: summary.totalTokens,
    estimatedCostUsd,
    byModel,
  };
}

async function writeSessionRecord(record: any): Promise<void> {
  await ensureRecordsRoot();
  const sessionDir = join(RECORDS_ROOT, record.sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, 'session.json'), JSON.stringify(record, null, 2), 'utf-8');
  if (record.finalDraft?.content) {
    await writeFile(join(sessionDir, 'output.md'), String(record.finalDraft.content), 'utf-8');
  } else if (record.final?.summary) {
    await writeFile(join(sessionDir, 'output.md'), String(record.final.summary), 'utf-8');
  }
  if (Array.isArray(record.notes)) {
    await writeFile(join(sessionDir, 'notes.txt'), record.notes.join('\n'), 'utf-8');
  }
}

async function runCompanyMode(input: any, control?: TaskRunControl): Promise<ModeRunResponse> {
  const orchestrator = createOrchestrator('OnePersonCompanyAPI');
  const memory = new KnowledgeStore(input?.description || 'company-mode-task');
  const task = buildTask({
    ...input,
    type: input?.type || 'content_delivery',
  });
  const trace = createBaseTrace('company');
  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${task.id}`;
  const record: any = {
    sessionId,
    mode: 'company',
    startedAt: new Date().toISOString(),
    status: 'running',
    task,
    drafts: [],
    reviews: [],
    notes: [],
  };
  await writeSessionRecord(record);

  if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
  control?.emit?.({ type: 'company_step', step: 'plan', agentId: 'manager' });
  const plan = await orchestrator.runTask(task, 'manager', control);
  record.plan = plan;
  trace.actions.push({ agentId: 'manager', action: 'plan', reasoning: plan.reasoning });
  if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
  control?.emit?.({ type: 'company_step', step: 'research', agentId: 'researcher' });
  const research = await orchestrator.runTask({ ...task, id: `research-${task.id}` }, 'researcher', control);
  record.research = research;
  trace.actions.push({ agentId: 'researcher', action: 'research', reasoning: research.reasoning });
  record.notes.push('manager_planning_done', 'research_done');
  const researchEvidence = await retriever.retrieve(`${task.description} research evidence`, 3);
  memory.updateFromTurn({
    turnId: 'company-research',
    round: 0,
    speakerId: 'researcher',
    speakerRole: 'researcher',
    message: String(research.output?.summary || ''),
    action: 'analysis',
    evidence: { query: task.description, citations: researchEvidence },
    timestamp: new Date().toISOString(),
  });

  let round = 1;
  let approved = false;
  let currentDraft: any = null;
  const reviewHistory: any[] = [];

  while (!approved && round <= 5) {
    if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
    control?.emit?.({ type: 'company_step', step: `draft_${round}`, agentId: 'writer' });
    const draft = await orchestrator.runTask({
      ...task,
      id: `draft-${round}-${task.id}`,
      context: {
        ...(task.context || {}),
        researchData: research.output,
        groundedEvidence: researchEvidence,
        memorySummary: memory.getSummaryPrompt(),
        revisionNotes: round > 1 ? (reviewHistory[reviewHistory.length - 1]?.output?.requiredChanges || []) : [],
      },
    }, 'writer', control);
    currentDraft = draft.output;
    record.drafts.push(draft);
    record.finalDraft = currentDraft;
    trace.actions.push({ agentId: 'writer', action: 'draft', reasoning: draft.reasoning, payload: { round } });

    control?.emit?.({ type: 'company_step', step: `review_${round}`, agentId: 'senior_editor' });
    const review = await orchestrator.runTask({
      ...task,
      id: `review-${round}-${task.id}`,
      context: {
        ...(task.context || {}),
        draft: currentDraft,
        round,
      },
    }, 'senior_editor', control);
    reviewHistory.push(review);
    record.reviews.push(review);
    trace.actions.push({ agentId: 'senior_editor', action: 'review', reasoning: review.reasoning, payload: { round, status: review.status } });
    memory.updateFromTurn({
      turnId: `company-review-${round}`,
      round,
      speakerId: 'senior_editor',
      speakerRole: 'senior_editor',
      message: String(review.reasoning || ''),
      action: 'review',
      evidence: { query: `${task.description} review ${round}`, citations: await retriever.retrieve(`${task.description} review ${round}`, 2) },
      timestamp: new Date().toISOString(),
    });
    approved = review.status === 'success';
    round += approved ? 0 : 1;
  }

  if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
  control?.emit?.({ type: 'company_step', step: 'final', agentId: 'director' });
  const final = await orchestrator.runTask({
    ...task,
    id: `final-${task.id}`,
    context: {
      ...(task.context || {}),
      draft: currentDraft,
      reviewHistory,
    },
  }, 'director', control);

  record.finalReview = final;
  trace.actions.push({ agentId: 'director', action: 'final_review', reasoning: final.reasoning, payload: { status: final.status } });
  record.status = final.status === 'success' ? 'success' : 'failed';
  record.finishedAt = new Date().toISOString();
  if (record.status === 'success') record.notes.push('final_approved');
  else record.notes.push('final_rejected');
  record.trace = finishTrace(trace, reviewHistory.length, approved);
  record.memory = memory.snapshot();
  record.observability = buildObservability(record);
  await writeSessionRecord(record);

  return buildRunResponse(
    'company',
    task,
    {
      title: record.finalDraft?.title,
      content: record.finalDraft?.content,
      qualityScore: record.finalReview?.output?.qualityScore || null,
      totalRounds: reviewHistory.length,
    },
    record.trace,
    record.status,
    record,
    {
      sessionId,
      memorySnapshot: record.memory,
      citations: researchEvidence,
      files: [`${sessionId}/session.json`, `${sessionId}/output.md`],
      observability: record.observability,
    }
  );
}

async function runRoundtableMode(input: any, control?: TaskRunControl): Promise<ModeRunResponse> {
  const orchestrator = createOrchestrator('RoundtableAPI');
  const task = buildTask(input);
  const participants = Array.isArray(input?.agentIds) && input.agentIds.length > 0
    ? input.agentIds
    : ['researcher', 'writer', 'reviewer'];
  const rounds = Number(input?.rounds || 4);
  const runner = new RoundtableRunner(orchestrator, retriever, participants, rounds);
  const result = await runner.run(task.description, control);

  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${task.id}`;
  const record = {
    sessionId,
    mode: 'roundtable',
    startedAt: result.trace.startedAt,
    finishedAt: result.trace.finishedAt,
    status: 'success',
    task,
    notes: ['roundtable_completed'],
    trace: result.trace,
    memory: result.memory,
    final: result.final,
  };
  (record as any).observability = buildObservability(record);
  await writeSessionRecord(record);

  return buildRunResponse(
    'roundtable',
    task,
    result.final,
    result.trace,
    'success',
    record,
    {
      sessionId,
      memorySnapshot: result.memory,
      citations: result.trace.conversation?.flatMap((x) => x.evidence?.citations || []) || [],
      files: [`${sessionId}/session.json`, `${sessionId}/output.md`],
      observability: (record as any).observability,
    }
  );
}

async function handleRequest(req: any, res: any): Promise<void> {
  const startedAt = nowMs();
  const requestId = getRequestId(req);
  const method = req.method || 'UNKNOWN';
  let statusCode = 500;
  let mode: string | undefined;
  let taskId: string | undefined;
  let sessionId: string | undefined;

  const finishLog = () => {
    const runtimeStats = runtime.getSnapshot();
    logInfo('request.completed', {
      requestId,
      method,
      path: req.url || '',
      statusCode,
      durationMs: nowMs() - startedAt,
      mode: mode || null,
      taskId: taskId || null,
      sessionId: sessionId || null,
      activeRunCount: runtimeStats.running,
      queuedRunCount: runtimeStats.queued,
    });
  };

  try {
  if (!req.url || !req.method) {
    statusCode = 400;
    sendError(res, 400, 'BAD_REQUEST', 'Invalid request', requestId);
    finishLog();
    return;
  }

  setResponseCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin(req),
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key,X-Request-Id',
      'Vary': 'Origin',
    });
    res.end();
    statusCode = 204;
    finishLog();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (isProtectedPath(pathname, req.method) && !isAuthorized(req)) {
    statusCode = 401;
    sendError(res, 401, 'UNAUTHORIZED', 'Valid API key required', requestId);
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    statusCode = 200;
    sendJson(res, 200, { ok: true });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/health/liveness') {
    statusCode = 200;
    sendJson(res, 200, { ok: true, service: 'records-api' });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/health/readiness') {
    try {
      await ensureRecordsRoot();
      const markerPath = join(RECORDS_ROOT, '.readiness-check');
      await writeFile(markerPath, new Date().toISOString(), 'utf-8');
      statusCode = 200;
      sendJson(res, 200, {
        ok: true,
        recordsRoot: RECORDS_ROOT,
        runtime: runtime.getSnapshot(),
      });
    } catch (err) {
      logError('health.readiness.failed', { requestId, error: String(err), recordsRoot: RECORDS_ROOT });
      statusCode = 503;
      sendJson(res, 503, { ok: false, error: 'Records root is not writable' });
    }
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const sessions = await listSummaries();
    statusCode = 200;
    sendJson(res, 200, { sessions });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/runtime/metrics') {
    statusCode = 200;
    sendJson(res, 200, { runtime: runtime.getSnapshot() });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/runtime/jobs') {
    const limit = Number(url.searchParams.get('limit') || 50);
    statusCode = 200;
    sendJson(res, 200, {
      jobs: runtime.listJobs(Number.isFinite(limit) ? limit : 50).map(serializeRuntimeJobForApi),
    });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/workflows') {
    await intelligenceReady;
    statusCode = 200;
    sendJson(res, 200, { workflows: await intelligence.listWorkflows() });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/intelligence/workflows/validate') {
    await intelligenceReady;
    const input = await readBody(req);
    const result = await intelligence.validateWorkflowConfig(input);
    statusCode = result.ok ? 200 : 400;
    sendJson(res, statusCode, result);
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/intelligence/workflows/reload') {
    await intelligenceReady;
    const input = await readBody(req);
    await intelligence.reloadWorkflows(Object.keys(input || {}).length > 0 ? input : undefined);
    statusCode = 200;
    sendJson(res, 200, { ok: true });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/intelligence/trigger') {
    await intelligenceReady;
    const input = await readBody(req);
    const workflowId = String(input?.workflowId || '');
    if (!workflowId) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'workflowId is required', requestId);
      finishLog();
      return;
    }
    const run = await intelligence.triggerWorkflow(workflowId, 'manual');
    statusCode = 200;
    sendJson(res, 200, { run });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/intelligence/events') {
    await intelligenceReady;
    const input = await readBody(req);
    const eventType = String(input?.eventType || '');
    if (!eventType) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'eventType is required', requestId);
      finishLog();
      return;
    }
    const workflows = await intelligence.listWorkflows();
    const matched = workflows.filter((x) => x.enabled && x.trigger.type === 'event' && x.trigger.eventType === eventType);
    const runs = [];
    for (const wf of matched) {
      runs.push(await intelligence.triggerWorkflow(wf.id, 'event'));
    }
    statusCode = 200;
    sendJson(res, 200, { eventType, matched: matched.length, runs });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/runs') {
    await intelligenceReady;
    const limit = Number(url.searchParams.get('limit') || 50);
    statusCode = 200;
    sendJson(res, 200, { runs: await intelligence.listRuns(Number.isFinite(limit) ? limit : 50) });
    finishLog();
    return;
  }

  const intelRunMatch = pathname.match(/^\/api\/intelligence\/runs\/([^/]+)$/);
  if (intelRunMatch && req.method === 'GET') {
    await intelligenceReady;
    const runId = decodeURIComponent(intelRunMatch[1]);
    const run = await intelligence.getRun(runId);
    if (!run) {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Run not found', requestId);
      finishLog();
      return;
    }
    statusCode = 200;
    sendJson(res, 200, { run });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/approvals') {
    await intelligenceReady;
    const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
    statusCode = 200;
    sendJson(res, 200, { approvals: await intelligence.listApprovals(status || undefined) });
    finishLog();
    return;
  }

  const approvalMatch = pathname.match(/^\/api\/intelligence\/approvals\/([^/]+)\/resolve$/);
  if (approvalMatch && req.method === 'POST') {
    await intelligenceReady;
    const approvalId = decodeURIComponent(approvalMatch[1]);
    const input = await readBody(req);
    const decision = input?.decision === 'rejected' ? 'rejected' : input?.decision === 'approved' ? 'approved' : '';
    const operator = String(input?.operator || '');
    if (!decision || !operator) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'decision(approved/rejected) and operator are required', requestId);
      finishLog();
      return;
    }
    const approval = await intelligence.resolveApproval(approvalId, operator, decision, typeof input?.reason === 'string' ? input.reason : undefined);
    statusCode = 200;
    sendJson(res, 200, { approval });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/metrics') {
    await intelligenceReady;
    statusCode = 200;
    sendJson(res, 200, { metrics: intelligence.metrics() });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/intelligence/self-improve') {
    await intelligenceReady;
    try {
      const input = await readBody(req);
      const result = await intelligence.runSelfImprove({
        rounds: typeof input?.rounds === 'number' ? input.rounds : undefined,
      });
      statusCode = 200;
      sendJson(res, 200, result);
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      statusCode = msg.includes('SELF_IMPROVE_NOT_CONFIGURED') ? 503 : msg.includes('SELF_IMPROVE_EMPTY') ? 400 : 500;
      sendJson(res, statusCode, { ok: false, error: msg });
    }
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/retrieval-scorer') {
    await intelligenceReady;
    statusCode = 200;
    sendJson(res, 200, await intelligence.getRetrievalScorerWeights());
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/intelligence/self-improve/history') {
    await intelligenceReady;
    const lim = Number(url.searchParams.get('limit') || 50);
    statusCode = 200;
    sendJson(res, 200, { history: await intelligence.listSelfImproveHistory(Number.isFinite(lim) ? lim : 50) });
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/knowledge/stats') {
    if (!(retriever instanceof LocalEmbeddingRetriever)) {
      statusCode = 200;
      sendJson(res, 200, { enabled: false, retriever: 'keyword' });
      finishLog();
      return;
    }
    const stats = await retriever.stats();
    statusCode = 200;
    sendJson(res, 200, { enabled: true, retriever: 'embedding', stats });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/knowledge/index') {
    if (!(retriever instanceof LocalEmbeddingRetriever)) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'Embedding retriever is disabled. Set ENABLE_EMBEDDING_RETRIEVER=true', requestId);
      finishLog();
      return;
    }
    const input = await readBody(req);
    const docs = Array.isArray(input?.documents) ? input.documents : [];
    if (docs.length === 0) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'documents[] is required', requestId);
      finishLog();
      return;
    }
    const normalized = docs
      .filter((x: any) => typeof x?.title === 'string' && typeof x?.text === 'string')
      .map((x: any, idx: number) => ({
        id: typeof x.id === 'string' ? x.id : `doc-${Date.now()}-${idx + 1}`,
        title: x.title,
        text: x.text,
        sourceUrl: typeof x.sourceUrl === 'string' ? x.sourceUrl : undefined,
        tags: Array.isArray(x.tags) ? x.tags.filter((t: unknown) => typeof t === 'string') : [],
      }));
    if (normalized.length === 0) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'No valid documents with title/text', requestId);
      finishLog();
      return;
    }
    const result = await retriever.buildIndex(normalized);
    statusCode = 200;
    sendJson(res, 200, { ok: true, ...result, documents: normalized.length });
    finishLog();
    return;
  }

  const jobGetMatch = pathname.match(/^\/api\/runtime\/jobs\/([^/]+)$/);
  if (jobGetMatch && req.method === 'GET') {
    await runtimeReady;
    const jobId = decodeURIComponent(jobGetMatch[1]);
    const job = runtime.getJob(jobId);
    if (!job) {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Job not found', requestId);
      finishLog();
      return;
    }
    statusCode = 200;
    sendJson(res, 200, { job: serializeRuntimeJobForApi(job) });
    finishLog();
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/runtime\/jobs\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    await runtimeReady;
    const jobId = decodeURIComponent(cancelMatch[1]);
    const job = runtime.getJob(jobId);
    if (!job) {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Job not found', requestId);
      finishLog();
      return;
    }
    if (job.status !== 'queued' && job.status !== 'running') {
      statusCode = 409;
      sendError(res, 409, 'CONFLICT', `Job is not cancellable (status=${job.status})`, requestId);
      finishLog();
      return;
    }
    const cancelled = runtime.cancelJob(jobId);
    if (!cancelled) {
      statusCode = 409;
      sendError(res, 409, 'CONFLICT', 'Unable to cancel job (no active controller)', requestId);
      finishLog();
      return;
    }
    statusCode = 200;
    sendJson(res, 200, { ok: true, jobId });
    finishLog();
    return;
  }

  const runMatch = pathname.match(/^\/api\/run\/([^/]+)$/);
  if (runMatch && req.method === 'POST') {
    await runtimeReady;
    mode = decodeURIComponent(runMatch[1]);
    const input = await readBody(req);
    const task = buildTask(input);
    taskId = task.id;
    if (typeof input?.sessionId === 'string') sessionId = input.sessionId;
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    const authKey = String(req.headers['x-api-key'] || req.headers.authorization || '');
    const rateLimitKey = authKey || clientIp;
    const rateCompositeKey = `${rateLimitKey}|${mode}`;
    const rate = runRateLimiter.consume(rateCompositeKey);
    if (!rate.allowed) {
      statusCode = 429;
      sendError(res, 429, 'RATE_LIMITED', 'Run rate limit exceeded', requestId, {
        limit: rate.limit,
        remaining: rate.remaining,
        resetAtMs: rate.resetAtMs,
      });
      finishLog();
      return;
    }
    if (runtime.isTaskActive(task.id)) {
      statusCode = 409;
      sendError(res, 409, 'CONFLICT', `Task ${task.id} is already running`, requestId);
      finishLog();
      return;
    }
    if (sessionId && runtime.isSessionActive(sessionId)) {
      statusCode = 409;
      sendError(res, 409, 'CONFLICT', `Session ${sessionId} is already running`, requestId);
      finishLog();
      return;
    }

    const wantStream = url.searchParams.get('stream') === '1';
    const jobId = `job-${Date.now()}-${task.id}`;

    const writeSse = (event: string, data: unknown) => {
      const line = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${line}\n\n`);
    };

    try {
      if (wantStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        writeSse('meta', { jobId, mode, stream: true });
        writeSse('progress', { type: 'job_queued', jobId } as RunProgressEvent);
      }

      const orchestrator = createOrchestrator('WebRun');
      const modeTimeoutMs = resolveRunTimeoutMs(config, mode);
      const runOnce = async (control?: { signal: AbortSignal; emit?: (e: RunProgressEvent) => void }): Promise<ModeRunResponse> => {
        if (mode === 'pipeline') {
          const result = await orchestrator.runPipeline('content-creation', task, modeTimeoutMs, control);
          const citations = await retriever.retrieve(`${task.description} pipeline evidence`, 3);
          const trace = finishTrace(
            {
              mode: 'pipeline',
              startedAt: new Date().toISOString(),
              actions: result.results.map((x) => ({ agentId: x.agentId, action: 'pipeline_step', reasoning: x.reasoning })),
            },
            result.results.length,
            true
          );
          return buildRunResponse('pipeline', task, result.finalOutput, trace, 'success', result, { citations, observability: buildObservability(result) });
        }
        if (mode === 'parallel') {
          const agentIds: string[] = Array.isArray(input?.agentIds) && input.agentIds.length > 0 ? input.agentIds : ['researcher', 'coder'];
          const result = await orchestrator.runParallel(task, agentIds, control);
          const trace = finishTrace(
            {
              mode: 'parallel',
              startedAt: new Date().toISOString(),
              actions: result.map((x) => ({ agentId: x.agentId, action: 'parallel_task', reasoning: x.reasoning })),
            },
            1,
            true
          );
          return buildRunResponse('parallel', task, result, trace, 'success', { agentIds, result }, { observability: buildObservability(result) });
        }
        if (mode === 'debate') {
          const agentIds: string[] = Array.isArray(input?.agentIds) && input.agentIds.length > 0 ? input.agentIds : ['researcher', 'writer'];
          const rounds = Number(input?.rounds || 3);
          const result = await orchestrator.runDebate(task.description, agentIds, rounds, control);
          const debateSummary = result.map((r) => ({
            round: r.round,
            results: r.results.map((x) => ({
              agentId: x.agentId,
              status: x.status,
              reasoning: x.reasoning,
              outputSummary: typeof x.output === 'string' ? x.output.slice(0, 200) : (x.output?.summary || x.output?.position || safeStringifyObject(x.output || {}).slice(0, 200)),
            })),
          }));
          const trace = finishTrace(
            {
              mode: 'debate',
              startedAt: new Date().toISOString(),
              actions: result.flatMap((r) => r.results.map((x) => ({ agentId: x.agentId, action: `debate_round_${r.round}`, reasoning: x.reasoning }))),
            },
            rounds,
            true
          );
          return buildRunResponse('debate', task, debateSummary, trace, 'success', { agentIds, rounds, result: debateSummary }, { observability: buildObservability(result) });
        }
        if (mode === 'vote') {
          const agentIds: string[] = Array.isArray(input?.agentIds) && input.agentIds.length > 0 ? input.agentIds : ['researcher', 'writer', 'reviewer'];
          const threshold = Number(input?.threshold || 0.6);
          const tieBreakBy = input?.tieBreakBy === 'agent_order' ? 'agent_order' : 'highest_score';
          const weights = input?.weights && typeof input.weights === 'object' ? input.weights : undefined;
          const result = await orchestrator.runVote(task.description, agentIds, { threshold, tieBreakBy, weights, control });
          const trace = finishTrace(
            {
              mode: 'vote',
              startedAt: new Date().toISOString(),
              actions: result.candidates.map((x) => ({ agentId: x.agentId, action: 'vote_candidate', reasoning: x.rationale, payload: { score: x.score } })),
            },
            1,
            true
          );
          return buildRunResponse('vote', task, result, trace, 'success', { agentIds, threshold, tieBreakBy, result }, { observability: buildObservability(result) });
        }
        if (mode === 'roundtable') return runRoundtableMode(input, control);
        if (mode === 'company') return runCompanyMode(input, control);
        throw new Error(`UNSUPPORTED_MODE_${mode}`);
      };

      const wantAsync = url.searchParams.get('async') === '1';
      if (wantAsync && wantStream) {
        statusCode = 400;
        sendError(res, 400, 'BAD_REQUEST', 'Cannot combine async=1 with stream=1', requestId);
        finishLog();
        return;
      }

      if (wantAsync) {
        runtime.submitBackground({
          jobId,
          taskId: task.id,
          sessionId,
          mode,
          run: async ({ signal }) =>
            withTimeout(runOnce({ signal, emit: undefined }), modeTimeoutMs, `${String(mode).toUpperCase()}_RUN`),
        });
        statusCode = 202;
        sendJson(res, 202, {
          jobId,
          jobUrl: `/api/runtime/jobs/${encodeURIComponent(jobId)}`,
          message: 'Job accepted; poll GET jobUrl until status is terminal',
        });
        finishLog();
        return;
      }

      const runtimeResult = await runtime.execute({
        jobId,
        taskId: task.id,
        sessionId,
        mode,
        run: async ({ signal }) => {
          const emit = wantStream
            ? (e: RunProgressEvent) => writeSse('progress', e)
            : undefined;
          if (wantStream) emit!({ type: 'job_running', jobId });
          return withTimeout(
            runOnce({ signal, emit }),
            modeTimeoutMs,
            `${String(mode).toUpperCase()}_RUN`
          );
        },
      });
      const payload = runtimeResult.result;
      payload.artifacts = {
        ...(payload.artifacts || {}),
        runtime: serializeRuntimeJobForApi(runtimeResult.job),
      };
      statusCode = 200;
      if (wantStream) {
        writeSse('done', payload);
        res.end();
      } else {
        sendJson(res, 200, payload);
      }
      finishLog();
      return;
    } catch (err) {
      logError('run.failed', { requestId, mode, taskId: task.id, error: String(err) });
      const errorMessage = String(err);
      if (errorMessage.includes('QUEUE_FULL')) {
        statusCode = 429;
        if (wantStream && res.headersSent) {
          writeSse('error', toApiError('RUN_CONCURRENCY_LIMIT', errorMessage, requestId, runtime.getSnapshot()));
          res.end();
        } else {
          sendError(res, 429, 'RUN_CONCURRENCY_LIMIT', errorMessage, requestId, runtime.getSnapshot());
        }
      } else if (errorMessage.includes('UNSUPPORTED_MODE_')) {
        statusCode = 400;
        if (wantStream && res.headersSent) {
          writeSse('error', toApiError('BAD_REQUEST', errorMessage.replace('UNSUPPORTED_MODE_', 'Unsupported mode: '), requestId));
          res.end();
        } else {
          sendError(res, 400, 'BAD_REQUEST', errorMessage.replace('UNSUPPORTED_MODE_', 'Unsupported mode: '), requestId);
        }
      } else if (errorMessage.includes('_TIMEOUT_') || errorMessage.includes('AGENT_TIMEOUT_')) {
        statusCode = 504;
        if (wantStream && res.headersSent) {
          writeSse('error', toApiError('TIMEOUT', errorMessage, requestId));
          res.end();
        } else {
          sendError(res, 504, 'TIMEOUT', errorMessage, requestId);
        }
      } else if (errorMessage.includes('JOB_CANCELLED')) {
        statusCode = 409;
        if (wantStream && res.headersSent) {
          writeSse('error', toApiError('CANCELLED', 'Run was cancelled', requestId));
          res.end();
        } else {
          sendError(res, 409, 'CANCELLED', 'Run was cancelled', requestId);
        }
      } else {
        statusCode = 500;
        if (wantStream && res.headersSent) {
          writeSse('error', toApiError('INTERNAL_ERROR', errorMessage, requestId));
          res.end();
        } else {
          sendError(res, 500, 'INTERNAL_ERROR', errorMessage, requestId);
        }
      }
      finishLog();
      return;
    }
  }

  const sessionFileMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/files\/([^/]+)$/);
  if (sessionFileMatch && req.method === 'GET') {
    const sid = decodeURIComponent(sessionFileMatch[1]);
    const fid = decodeURIComponent(sessionFileMatch[2]);
    const sessionDir = join(RECORDS_ROOT, sid);
    try {
      await stat(sessionDir);
      const file = await readSessionUploadFile(sessionDir, fid);
      if (!file) {
        statusCode = 404;
        sendError(res, 404, 'NOT_FOUND', 'File not found', requestId);
        finishLog();
        return;
      }
      statusCode = 200;
      sendBinary(res, 200, file.buf, file.mime, file.name);
      finishLog();
      return;
    } catch {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Session or file not found', requestId);
      finishLog();
      return;
    }
  }

  const sessionAttachMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/attachments$/);
  if (sessionAttachMatch && req.method === 'POST') {
    const sid = decodeURIComponent(sessionAttachMatch[1]);
    const sessionDir = join(RECORDS_ROOT, sid);
    try {
      await stat(sessionDir);
      const input = await readBody(req);
      const files = Array.isArray(input?.files) ? input.files : [];
      const saved = await saveSessionAttachments(sessionDir, files);
      const attachments = saved.map((x) => ({
        ...x,
        path: x.path.replace('__SID__', encodeURIComponent(sid)),
      }));
      statusCode = 200;
      sendJson(res, 200, { ok: true, attachments });
      finishLog();
      return;
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      statusCode = msg.includes('ENOENT') ? 404 : 400;
      sendError(res, statusCode, statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', msg, requestId);
      finishLog();
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/capabilities/seedance/video') {
    try {
      const input = await readBody(req);
      const prompt = String(input?.prompt || '').trim();
      if (!prompt) {
        statusCode = 400;
        sendError(res, 400, 'BAD_REQUEST', 'prompt is required', requestId);
        finishLog();
        return;
      }
      const out = await seedanceCreateTask(env, {
        prompt,
        image_url: typeof input?.image_url === 'string' ? input.image_url : undefined,
        image_urls: Array.isArray(input?.image_urls) ? input.image_urls.filter((x: unknown) => typeof x === 'string') : undefined,
        aspect_ratio: typeof input?.aspect_ratio === 'string' ? input.aspect_ratio : undefined,
        resolution: input?.resolution === '480p' || input?.resolution === '720p' ? input.resolution : undefined,
        duration: typeof input?.duration === 'number' ? input.duration : undefined,
        generate_audio: typeof input?.generate_audio === 'boolean' ? input.generate_audio : undefined,
      });
      statusCode = 200;
      sendJson(res, 200, out);
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      statusCode = msg.includes('SEEDANCE_NOT_CONFIGURED') ? 503 : 502;
      sendJson(res, statusCode, { ok: false, error: msg });
    }
    finishLog();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/capabilities/seedance/video') {
    const gid = url.searchParams.get('generationId') || url.searchParams.get('generation_id');
    if (!gid) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'generationId query required', requestId);
      finishLog();
      return;
    }
    try {
      const out = await seedanceGetTask(env, gid);
      statusCode = 200;
      sendJson(res, 200, out);
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      statusCode = msg.includes('SEEDANCE_NOT_CONFIGURED') ? 503 : 502;
      sendJson(res, statusCode, { ok: false, error: msg });
    }
    finishLog();
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === 'GET') {
    sessionId = decodeURIComponent(sessionMatch[1]);
    const sessionDir = join(RECORDS_ROOT, sessionId);
    try {
      await stat(sessionDir);
      const session = await readJson(join(sessionDir, 'session.json'));
      let markdown = '';
      try {
        markdown = await readFile(join(sessionDir, 'output.md'), 'utf-8');
      } catch {
        markdown = '';
      }
      statusCode = 200;
      sendJson(res, 200, { session, markdown });
      finishLog();
      return;
    } catch {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Session not found', requestId);
      finishLog();
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/memory') {
    const memorySessionId = url.searchParams.get('sessionId');
    if (!memorySessionId) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'sessionId is required', requestId);
      finishLog();
      return;
    }
    sessionId = memorySessionId;
    try {
      const session = await readJson(join(RECORDS_ROOT, memorySessionId, 'session.json'));
      statusCode = 200;
      sendJson(res, 200, { sessionId: memorySessionId, memory: session.memory || null });
      finishLog();
      return;
    } catch {
      statusCode = 404;
      sendError(res, 404, 'NOT_FOUND', 'Session not found', requestId);
      finishLog();
      return;
    }
  }

  if (sessionMatch && req.method === 'DELETE') {
    sessionId = decodeURIComponent(sessionMatch[1]);
    const sessionDir = join(RECORDS_ROOT, sessionId);
    try {
      await rm(sessionDir, { recursive: true, force: true });
      statusCode = 200;
      sendJson(res, 200, { ok: true, sessionId });
      finishLog();
      return;
    } catch (err) {
      logError('session.delete.failed', { requestId, sessionId, error: String(err) });
      statusCode = 500;
      sendError(res, 500, 'INTERNAL_ERROR', String(err), requestId);
      finishLog();
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/export') {
    await ensureRecordsRoot();
    const scopedId = url.searchParams.get('sessionId')?.trim();
    if (scopedId) {
      const summary = await readSessionSummary(scopedId);
      if (!summary) {
        statusCode = 404;
        sendError(res, 404, 'NOT_FOUND', 'Session not found', requestId);
        finishLog();
        return;
      }
      const exportDir = join(RECORDS_ROOT, 'exports');
      await mkdir(exportDir, { recursive: true });
      const exportPath = join(exportDir, `${scopedId}.json`);
      await writeFile(
        exportPath,
        JSON.stringify(
          { generatedAt: new Date().toISOString(), sessionId: scopedId, sessions: [summary] },
          null,
          2
        ),
        'utf-8'
      );
      statusCode = 200;
      sendJson(res, 200, { ok: true, file: exportPath, scoped: true });
      finishLog();
      return;
    }
    const sessions = await listSummaries();
    const path = join(RECORDS_ROOT, 'session-index.json');
    await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), sessions }, null, 2), 'utf-8');
    statusCode = 200;
    sendJson(res, 200, { ok: true, file: path });
    finishLog();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    statusCode = 200;
    mode = 'chat';
    const input = await readBody(req);
    const messages: Array<{ role: string; content: any }> = Array.isArray(input?.messages) ? input.messages : [];
    const stream = input?.stream !== false;

    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userText = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
        : '';

    if (!userText && messages.length === 0) {
      statusCode = 400;
      sendError(res, 400, 'BAD_REQUEST', 'messages is required', requestId);
      finishLog();
      return;
    }

    const task = buildTask({
      id: `chat-${Date.now()}`,
      description: userText || 'chat',
      type: 'chat',
      context: { messages, systemPrompt: input?.systemPrompt || '' },
    });

    const chatId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const writeSse = (event: string, data: unknown) => {
      const line = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${line}\n\n`);
    };

    try {
      const orchestrator = createOrchestrator('ChatAPI');

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        writeSse('meta', { chatId, stream: true });

        const emitProgress = (e: RunProgressEvent) => { writeSse('progress', e); };

        const result = await withTimeout(
          orchestrator.runTask(task, 'writer', { signal: new AbortController().signal, emit: emitProgress }),
          resolveRunTimeoutMs(config, 'chat'),
          'CHAT_RUN',
        );

        const content = typeof result.output === 'string'
          ? result.output
          : result.output?.content || result.output?.summary || JSON.stringify(result.output || {});

        writeSse('done', { chatId, content, reasoning: result.reasoning, llmUsage: result.metadata?.llmUsage });
        res.end();
      } else {
        const result = await withTimeout(
          orchestrator.runTask(task, 'writer'),
          resolveRunTimeoutMs(config, 'chat'),
          'CHAT_RUN',
        );

        const content = typeof result.output === 'string'
          ? result.output
          : result.output?.content || result.output?.summary || JSON.stringify(result.output || {});

        sendJson(res, 200, { chatId, content, reasoning: result.reasoning, llmUsage: result.metadata?.llmUsage });
      }
    } catch (err) {
      logError('chat.failed', { requestId, error: String(err) });
      const errorMessage = String(err);
      if (errorMessage.includes('_TIMEOUT_')) {
        if (stream && res.headersSent) {
          writeSse('error', { message: 'Chat request timed out' });
          res.end();
        } else {
          sendError(res, 504, 'TIMEOUT', 'Chat request timed out', requestId);
        }
      } else {
        if (stream && res.headersSent) {
          writeSse('error', { message: errorMessage });
          res.end();
        } else {
          sendError(res, 500, 'INTERNAL_ERROR', errorMessage, requestId);
        }
      }
    }
    finishLog();
    return;
  }

  statusCode = 404;
  sendError(res, 404, 'NOT_FOUND', 'Not found', requestId);
  finishLog();
  } catch (err) {
    logError('request.unhandled_error', { requestId, method, path: req.url || '', error: String(err) });
    if (!res.headersSent) {
      statusCode = 500;
      sendError(res, 500, 'INTERNAL_ERROR', 'Internal Server Error', requestId);
    }
    finishLog();
  }
}

  return {
    handleRequest,
    config,
    port: PORT,
    recordsRoot: RECORDS_ROOT,
    runtime,
    runtimeReady,
    logServerStarted: () => {
      logInfo('server.started', {
        port: PORT,
        recordsRoot: RECORDS_ROOT,
        nodeEnv: config.nodeEnv,
        authEnabled: !config.allowUnauthInDev,
        runTimeoutMs: config.runTimeoutMs,
        maxRunConcurrency: config.maxRunConcurrency,
        runRateLimitPerMinute: config.runRateLimitPerMinute,
        runQueueSize: config.runQueueSize,
        runMaxRetries: config.runMaxRetries,
      });
    },
  };
}
