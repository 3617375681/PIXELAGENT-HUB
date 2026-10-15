import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { LocalKeywordRetriever, DEFAULT_KNOWLEDGE_BASE, Retriever } from '../core/retriever.js';
import { LocalEmbeddingRetriever } from '../core/embeddingRetriever.js';
import { loadWebServerConfig, resolveRunTimeoutMs } from './config.js';
import { FixedWindowRateLimiter } from './rateLimiter.js';
import { RunRuntime } from './runRuntime.js';
import { createStudioApi } from './studioApi.js';
import { createSessionStore } from './sessionStore.js';
import { createModeRunner } from './runModes.js';
import { corsOrigin, getRequestId, isAuthorized, sendError, type ApiResponse } from './http/respond.js';
import { createRouteContext, type RequestLog, type Route } from './routes/context.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { runtimeRoutes } from './routes/runtime.js';
import { runRoutes } from './routes/runs.js';
import { studioRoutes } from './routes/studio.js';

export type RecordsWebStack = ReturnType<typeof createRecordsWebStack>;

/**
 * Composition root of the Records API: builds config, runtime, stores and route groups, then
 * answers each request with CORS/preflight handling, API-key auth for /api/*, the first matching
 * route group, and one structured access-log line.
 */
export function createRecordsWebStack(env: NodeJS.ProcessEnv = process.env) {
  const logInfo = (event: string, payload: Record<string, unknown>) => console.log(JSON.stringify({ level: 'info', event, at: new Date().toISOString(), ...payload }));
  const logError = (event: string, payload: Record<string, unknown>) => console.error(JSON.stringify({ level: 'error', event, at: new Date().toISOString(), ...payload }));

  const RECORDS_ROOT = env.RECORDS_ROOT_OVERRIDE?.trim() || join(process.cwd(), 'records', 'company-mode');
  const config = loadWebServerConfig(env);
  const retriever: Retriever = env.ENABLE_EMBEDDING_RETRIEVER === 'true'
    ? new LocalEmbeddingRetriever({
        storePath: join(RECORDS_ROOT, 'knowledge', 'vector-store.json'),
        ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        model: env.OLLAMA_EMBED_MODEL || 'qwen3:14b',
        chunkSize: Number(env.KB_CHUNK_SIZE || 500),
        overlap: Number(env.KB_CHUNK_OVERLAP || 80),
        scorerWeightsPath: join(RECORDS_ROOT, 'intelligence', 'retrieval-scorer.json'),
        defaultDocuments: DEFAULT_KNOWLEDGE_BASE.map((x, idx) => ({ id: `seed-${idx + 1}`, title: x.title, sourceUrl: x.url, text: x.text, tags: x.tags })),
      })
    : new LocalKeywordRetriever();
  const rateLimiter = new FixedWindowRateLimiter(config.runRateLimitPerMinute, 60_000);
  const runtime = new RunRuntime({ recordsRoot: RECORDS_ROOT, maxConcurrency: config.maxRunConcurrency, maxQueueSize: config.runQueueSize, maxRetries: config.runMaxRetries });
  const studio = createStudioApi({ root: env.STUDIO_ROOT_OVERRIDE?.trim() || join(RECORDS_ROOT, 'studio'), runtime, timeoutMs: resolveRunTimeoutMs(config, 'studio'), browserChecks: { enabled: env.ENABLE_STUDIO_BROWSER_CHECKS === 'true', executablePath: env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined } });
  const runtimeReady = runtime.init().then(async () => {
    const recovered = await runtime.recoverInterruptedJobs();
    if (recovered > 0) logInfo('runtime.recovered_jobs', { recovered });
  });
  const store = createSessionStore(RECORDS_ROOT, logError);
  const modes = createModeRunner({ retriever, store, usdPer1kTokens: Number(env.USD_PER_1K_TOKENS || 0.002) });

  const routes: Route[] = [
    studioRoutes({ studio, runtimeReady, rateLimiter }),
    healthRoutes({ store, runtime, logError }),
    runtimeRoutes({ runtime, runtimeReady }),
    runRoutes({ config, runtime, runtimeReady, modes, rateLimiter, logError }),
    sessionRoutes({ store, logError }),
  ];

  async function handleRequest(req: IncomingMessage, res: ApiResponse): Promise<void> {
    const startedAt = Date.now();
    const requestId = getRequestId(req);
    const method = req.method || 'UNKNOWN';
    const log: RequestLog = { statusCode: 500 };
    const finishLog = () => {
      const stats = runtime.getSnapshot();
      logInfo('request.completed', {
        requestId, method, path: req.url || '', statusCode: log.statusCode, durationMs: Date.now() - startedAt,
        mode: log.mode || null, taskId: log.taskId || null, sessionId: log.sessionId || null,
        activeRunCount: stats.running, queuedRunCount: stats.queued,
      });
    };

    try {
      if (!req.url || !req.method) {
        log.statusCode = 400;
        sendError(res, 400, 'BAD_REQUEST', 'Invalid request', requestId);
        return;
      }
      const origin = corsOrigin(config, req);
      if (origin) res._corsOrigin = origin;
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key,X-Request-Id,Idempotency-Key',
          Vary: 'Origin',
        });
        res.end();
        log.statusCode = 204;
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const ctx = createRouteContext(req, res, url, requestId, log);
      if (url.pathname.startsWith('/api/') && !isAuthorized(config, req)) {
        ctx.error(401, 'UNAUTHORIZED', 'Valid API key required');
        return;
      }
      for (const route of routes) if (await route(ctx)) return;
      ctx.error(404, 'NOT_FOUND', 'Not found');
    } catch (err) {
      logError('request.unhandled_error', { requestId, method, path: req.url || '', error: String(err) });
      if (!res.headersSent) {
        log.statusCode = 500;
        sendError(res, 500, 'INTERNAL_ERROR', 'Internal Server Error', requestId);
      }
    } finally {
      finishLog();
    }
  }

  return {
    handleRequest,
    config,
    port: config.port,
    recordsRoot: RECORDS_ROOT,
    runtime,
    runtimeReady,
    logServerStarted: () => {
      logInfo('server.started', {
        port: config.port,
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
