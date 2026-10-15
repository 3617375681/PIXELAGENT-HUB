import type { RuntimeJobRecord } from '../../core/types.js';
import type { RunRuntime } from '../runRuntime.js';
import type { Route } from './context.js';

/** Aligns HTTP job payloads with the frontend `RuntimeJob` type (`createdAt` alias). */
export function serializeRuntimeJobForApi(job: RuntimeJobRecord): RuntimeJobRecord & { createdAt: string } {
  return { ...job, createdAt: job.queuedAt };
}

export function runtimeRoutes(deps: { runtime: RunRuntime; runtimeReady: Promise<void> }): Route {
  const { runtime } = deps;
  return async (ctx) => {
    const { req, pathname, url } = ctx;
    if (req.method === 'GET' && pathname === '/api/runtime/metrics') { ctx.json(200, { runtime: runtime.getSnapshot() }); return true; }
    if (req.method === 'GET' && pathname === '/api/runtime/jobs') {
      const limit = Number(url.searchParams.get('limit') || 50);
      ctx.json(200, { jobs: runtime.listJobs(Number.isFinite(limit) ? limit : 50).map(serializeRuntimeJobForApi) });
      return true;
    }
    const jobGet = pathname.match(/^\/api\/runtime\/jobs\/([^/]+)$/);
    if (jobGet && req.method === 'GET') {
      await deps.runtimeReady;
      const job = runtime.getJob(decodeURIComponent(jobGet[1]));
      if (!job) ctx.error(404, 'NOT_FOUND', 'Job not found');
      else ctx.json(200, { job: serializeRuntimeJobForApi(job) });
      return true;
    }
    const cancel = pathname.match(/^\/api\/runtime\/jobs\/([^/]+)\/cancel$/);
    if (cancel && req.method === 'POST') {
      await deps.runtimeReady;
      const jobId = decodeURIComponent(cancel[1]);
      const job = runtime.getJob(jobId);
      if (!job) ctx.error(404, 'NOT_FOUND', 'Job not found');
      else if (job.status !== 'queued' && job.status !== 'running') ctx.error(409, 'CONFLICT', `Job is not cancellable (status=${job.status})`);
      else if (!runtime.cancelJob(jobId)) ctx.error(409, 'CONFLICT', 'Unable to cancel job (no active controller)');
      else ctx.json(200, { ok: true, jobId });
      return true;
    }
    return false;
  };
}
