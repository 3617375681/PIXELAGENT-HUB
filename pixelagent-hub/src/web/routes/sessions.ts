import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readBody, sendBinary } from '../http/respond.js';
import { readSessionUploadFile, saveSessionAttachments } from '../sessionUploads.js';
import type { SessionStore } from '../sessionStore.js';
import type { Route } from './context.js';

export function sessionRoutes(deps: { store: SessionStore; logError: (event: string, payload: Record<string, unknown>) => void }): Route {
  const { store } = deps;
  return async (ctx) => {
    const { req, pathname, url } = ctx;

    if (req.method === 'GET' && pathname === '/api/sessions') { ctx.json(200, { sessions: await store.listSummaries() }); return true; }

    const file = pathname.match(/^\/api\/sessions\/([^/]+)\/files\/([^/]+)$/);
    if (file && req.method === 'GET') {
      const sessionDir = store.sessionDir(decodeURIComponent(file[1]));
      try {
        await stat(sessionDir);
        const found = await readSessionUploadFile(sessionDir, decodeURIComponent(file[2]));
        if (!found) ctx.error(404, 'NOT_FOUND', 'File not found');
        else { ctx.log.statusCode = 200; sendBinary(ctx.res, 200, found.buf, found.mime, found.name); }
      } catch {
        ctx.error(404, 'NOT_FOUND', 'Session or file not found');
      }
      return true;
    }

    const attach = pathname.match(/^\/api\/sessions\/([^/]+)\/attachments$/);
    if (attach && req.method === 'POST') {
      const sid = decodeURIComponent(attach[1]);
      try {
        await stat(store.sessionDir(sid));
        const input = await readBody(req);
        const saved = await saveSessionAttachments(store.sessionDir(sid), Array.isArray(input?.files) ? input.files : []);
        ctx.json(200, { ok: true, attachments: saved.map((x) => ({ ...x, path: x.path.replace('__SID__', encodeURIComponent(sid)) })) });
      } catch (err) {
        const msg = String((err as Error)?.message || err);
        if (msg.includes('ENOENT')) ctx.error(404, 'NOT_FOUND', msg);
        else ctx.error(400, 'BAD_REQUEST', msg);
      }
      return true;
    }

    const session = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (session && req.method === 'GET') {
      const sessionId = ctx.log.sessionId = decodeURIComponent(session[1]);
      try {
        await stat(store.sessionDir(sessionId));
        const record = await store.readJson(join(store.sessionDir(sessionId), 'session.json'));
        const markdown = await readFile(join(store.sessionDir(sessionId), 'output.md'), 'utf-8').catch(() => '');
        ctx.json(200, { session: record, markdown });
      } catch {
        ctx.error(404, 'NOT_FOUND', 'Session not found');
      }
      return true;
    }

    if (session && req.method === 'DELETE') {
      const sessionId = ctx.log.sessionId = decodeURIComponent(session[1]);
      try {
        await rm(store.sessionDir(sessionId), { recursive: true, force: true });
        ctx.json(200, { ok: true, sessionId });
      } catch (err) {
        deps.logError('session.delete.failed', { requestId: ctx.requestId, sessionId, error: String(err) });
        ctx.error(500, 'INTERNAL_ERROR', String(err));
      }
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/memory') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) { ctx.error(400, 'BAD_REQUEST', 'sessionId is required'); return true; }
      ctx.log.sessionId = sessionId;
      try {
        const record = await store.readJson(join(store.sessionDir(sessionId), 'session.json'));
        ctx.json(200, { sessionId, memory: record.memory || null });
      } catch {
        ctx.error(404, 'NOT_FOUND', 'Session not found');
      }
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/export') {
      await store.ensureRoot();
      const scopedId = url.searchParams.get('sessionId')?.trim();
      if (scopedId) {
        const summary = await store.readSummary(scopedId);
        if (!summary) { ctx.error(404, 'NOT_FOUND', 'Session not found'); return true; }
        const exportDir = join(store.root, 'exports');
        await mkdir(exportDir, { recursive: true });
        const exportPath = join(exportDir, `${scopedId}.json`);
        await writeFile(exportPath, JSON.stringify({ generatedAt: new Date().toISOString(), sessionId: scopedId, sessions: [summary] }, null, 2), 'utf-8');
        ctx.json(200, { ok: true, file: exportPath, scoped: true });
        return true;
      }
      const path = join(store.root, 'session-index.json');
      await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), sessions: await store.listSummaries() }, null, 2), 'utf-8');
      ctx.json(200, { ok: true, file: path });
      return true;
    }

    return false;
  };
}
