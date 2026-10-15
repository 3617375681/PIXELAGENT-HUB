import type { ModeRunResponse, RunProgressEvent } from '../../core/types.js';
import { resolveRunTimeoutMs, type WebServerConfig } from '../config.js';
import { toApiError } from '../errors.js';
import { corsHeaders, readBody, sendError, withTimeout } from '../http/respond.js';
import type { FixedWindowRateLimiter } from '../rateLimiter.js';
import type { RunRuntime } from '../runRuntime.js';
import { buildTask, type ModeRunner } from '../runModes.js';
import type { Route } from './context.js';
import { serializeRuntimeJobForApi } from './runtime.js';

/** Maps a failed run to an HTTP status and API error code. */
function classifyRunError(message: string): { status: number; code: Parameters<typeof toApiError>[0]; message: string } {
  if (message.includes('QUEUE_FULL')) return { status: 429, code: 'RUN_CONCURRENCY_LIMIT', message };
  if (message.includes('UNSUPPORTED_MODE_')) return { status: 400, code: 'BAD_REQUEST', message: message.replace('UNSUPPORTED_MODE_', 'Unsupported mode: ') };
  if (message.includes('_TIMEOUT_') || message.includes('AGENT_TIMEOUT_')) return { status: 504, code: 'TIMEOUT', message };
  if (message.includes('JOB_CANCELLED')) return { status: 409, code: 'CANCELLED', message: 'Run was cancelled' };
  return { status: 500, code: 'INTERNAL_ERROR', message };
}

/** POST /api/run/:mode — synchronous JSON, `?async=1` background job, or `?stream=1` SSE progress. */
export function runRoutes(deps: {
  config: WebServerConfig; runtime: RunRuntime; runtimeReady: Promise<void>; modes: ModeRunner;
  rateLimiter: FixedWindowRateLimiter; logError: (event: string, payload: Record<string, unknown>) => void;
}): Route {
  const { runtime } = deps;
  return async (ctx) => {
    const match = ctx.pathname.match(/^\/api\/run\/([^/]+)$/);
    if (!match || ctx.req.method !== 'POST') return false;
    const { req, res, url, requestId, log } = ctx;
    await deps.runtimeReady;
    const mode = log.mode = decodeURIComponent(match[1]);
    const input = await readBody(req);
    const task = buildTask(input);
    log.taskId = task.id;
    if (typeof input?.sessionId === 'string') log.sessionId = input.sessionId;

    const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    const authKey = String(req.headers['x-api-key'] || req.headers.authorization || '');
    const rate = deps.rateLimiter.consume(`${authKey || clientIp}|${mode}`);
    if (!rate.allowed) {
      ctx.error(429, 'RATE_LIMITED', 'Run rate limit exceeded', { limit: rate.limit, remaining: rate.remaining, resetAtMs: rate.resetAtMs });
      return true;
    }
    if (runtime.isTaskActive(task.id)) { ctx.error(409, 'CONFLICT', `Task ${task.id} is already running`); return true; }
    if (log.sessionId && runtime.isSessionActive(log.sessionId)) { ctx.error(409, 'CONFLICT', `Session ${log.sessionId} is already running`); return true; }

    const wantStream = url.searchParams.get('stream') === '1';
    const wantAsync = url.searchParams.get('async') === '1';
    const jobId = `job-${Date.now()}-${task.id}`;
    if (mode === 'company') log.sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${task.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const sessionId = log.sessionId;
    const writeSse = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    const modeTimeoutMs = resolveRunTimeoutMs(deps.config, mode);

    // Detach from the job signal so a timeout can abort the run, then give cooperative agents a
    // bounded moment to persist their terminal session before the job itself becomes terminal.
    const runControlled = async (signal: AbortSignal, emit?: (event: RunProgressEvent) => void): Promise<ModeRunResponse> => {
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
      const execution = deps.modes.run(mode, input, task, modeTimeoutMs, sessionId, { signal: controller.signal, emit });
      try {
        return await withTimeout(execution, modeTimeoutMs, `${mode.toUpperCase()}_RUN`, () => controller.abort(new Error(`${mode.toUpperCase()}_RUN_TIMEOUT_${modeTimeoutMs}ms`)));
      } catch (error) {
        if (controller.signal.aborted) await withTimeout(execution.catch(() => undefined), 5000, 'RUN_CLEANUP').catch(() => undefined);
        throw error;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    };

    if (wantAsync && wantStream) { ctx.error(400, 'BAD_REQUEST', 'Cannot combine async=1 with stream=1'); return true; }
    try {
      if (wantAsync) {
        runtime.submitBackground({ jobId, taskId: task.id, sessionId, mode, run: async ({ signal }) => runControlled(signal) });
        ctx.json(202, { jobId, jobUrl: `/api/runtime/jobs/${encodeURIComponent(jobId)}`, sessionId, message: 'Job accepted; poll GET jobUrl until status is terminal' });
        return true;
      }
      if (wantStream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', ...corsHeaders(res) });
        writeSse('meta', { jobId, mode, stream: true });
        writeSse('progress', { type: 'job_queued', jobId } as RunProgressEvent);
      }
      const runtimeResult = await runtime.execute({
        jobId, taskId: task.id, sessionId, mode,
        run: async ({ signal }) => {
          const emit = wantStream ? (event: RunProgressEvent) => writeSse('progress', event) : undefined;
          emit?.({ type: 'job_running', jobId });
          return runControlled(signal, emit);
        },
      });
      const payload = runtimeResult.result;
      payload.artifacts = { ...(payload.artifacts || {}), runtime: serializeRuntimeJobForApi(runtimeResult.job) };
      if (wantStream) { log.statusCode = 200; writeSse('done', payload); res.end(); }
      else ctx.json(200, payload);
    } catch (err) {
      deps.logError('run.failed', { requestId, mode, taskId: task.id, error: String(err) });
      const failure = classifyRunError(String(err));
      const details = failure.code === 'RUN_CONCURRENCY_LIMIT' ? runtime.getSnapshot() : undefined;
      log.statusCode = failure.status;
      if (wantStream && res.headersSent) { writeSse('error', toApiError(failure.code, failure.message, requestId, details)); res.end(); }
      else sendError(res, failure.status, failure.code, failure.message, requestId, details);
    }
    return true;
  };
}
