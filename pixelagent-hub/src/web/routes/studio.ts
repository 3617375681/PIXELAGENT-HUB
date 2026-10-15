import { readBody } from '../http/respond.js';
import type { FixedWindowRateLimiter } from '../rateLimiter.js';
import type { createStudioApi } from '../studioApi.js';
import type { Route } from './context.js';

// Requests that start paid model work share the creation rate limit; cancellations do not.
const STARTS_WORK = /^\/api\/studio\/projects(?:\/[^/]+\/(repair|revise|retry|test-plans|browser-runs))?$/;

export function studioRoutes(deps: { studio: ReturnType<typeof createStudioApi>; runtimeReady: Promise<void>; rateLimiter: FixedWindowRateLimiter }): Route {
  return async (ctx) => {
    const { req, res, pathname } = ctx;
    if (!pathname.startsWith('/api/studio/')) return false;
    await deps.runtimeReady;
    const input = req.method === 'POST' ? await readBody(req) : undefined;
    const isCancel = (pathname.endsWith('/test-plans') && input?.cancelPlanId !== undefined) || (pathname.endsWith('/browser-runs') && input?.cancelRunId !== undefined);
    if (req.method === 'POST' && STARTS_WORK.test(pathname) && !isCancel) {
      const key = String(req.headers['x-api-key'] || req.socket?.remoteAddress || 'unknown');
      if (!deps.rateLimiter.consume(`${key}|studio`).allowed) { ctx.error(429, 'RATE_LIMITED', 'Project creation rate limit exceeded'); return true; }
    }
    await deps.studio.handle(req, res, pathname, input);
    ctx.log.statusCode = res.statusCode;
    return true;
  };
}
