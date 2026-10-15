import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunRuntime } from '../runRuntime.js';
import type { SessionStore } from '../sessionStore.js';
import type { Route } from './context.js';

/** Liveness is unconditional; readiness proves the records root is writable. */
export function healthRoutes(deps: { store: SessionStore; runtime: RunRuntime; logError: (event: string, payload: Record<string, unknown>) => void }): Route {
  return async (ctx) => {
    if (ctx.req.method !== 'GET') return false;
    if (ctx.pathname === '/health') { ctx.json(200, { ok: true }); return true; }
    if (ctx.pathname === '/health/liveness') { ctx.json(200, { ok: true, service: 'records-api' }); return true; }
    if (ctx.pathname !== '/health/readiness') return false;
    try {
      await deps.store.ensureRoot();
      await writeFile(join(deps.store.root, '.readiness-check'), new Date().toISOString(), 'utf-8');
      ctx.json(200, { ok: true, recordsRoot: deps.store.root, runtime: deps.runtime.getSnapshot() });
    } catch (err) {
      deps.logError('health.readiness.failed', { requestId: ctx.requestId, error: String(err), recordsRoot: deps.store.root });
      ctx.json(503, { ok: false, error: 'Records root is not writable' });
    }
    return true;
  };
}
