import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Orchestrator } from '../core/Orchestrator.js';
import { runSoftwareStudio, saveStudioRecord, validateProjectId, type StudioRecord } from '../studio/softwareStudio.js';
import type { RunRuntime } from './runRuntime.js';
import { diagnosticInput, listDiagnostics, saveDiagnostic } from '../studio/diagnostics.js';

export function createStudioApi(options: {
  root: string; runtime: RunRuntime; timeoutMs: number;
  createOrchestrator?: () => Orchestrator;
}) {
  const read = async (projectId: string): Promise<StudioRecord> => {
    validateProjectId(projectId);
    const record: StudioRecord = JSON.parse(await readFile(join(options.root, projectId, 'project.json'), 'utf-8'));
    if (record.projectId !== projectId) throw new Error('Project record ID mismatch');
    if (record.status === 'queued' || record.status === 'running') {
      const job = record.jobId ? options.runtime.getJob(record.jobId) : undefined;
      if (!job || ['failed', 'cancelled'].includes(job.status)) {
        record.status = job?.status === 'cancelled' ? 'cancelled' : 'failed';
        record.phase = record.status;
        record.error = job?.error || 'Generation was interrupted; create a new project to retry';
        record.finishedAt = job?.finishedAt || new Date().toISOString();
        await saveStudioRecord(options.root, record);
      }
    }
    return record;
  };
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return {
    async handle(req: IncomingMessage, res: ServerResponse, pathname: string, input?: unknown): Promise<void> {
      try {
        if (pathname === '/api/studio/projects' && req.method === 'GET') {
          await mkdir(options.root, { recursive: true });
          const directories = await readdir(options.root, { withFileTypes: true });
          const projects: StudioRecord[] = [];
          for (const entry of directories) {
            if (!entry.isDirectory()) continue;
            try { validateProjectId(entry.name); } catch { continue; }
            projects.push(await read(entry.name));
          }
          projects.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          json(res, 200, { projects: projects.map(({ projectId, description, status, startedAt, phase, jobId }) => ({ projectId, description, status, startedAt, phase, jobId })) });
          return;
        }
        if (pathname === '/api/studio/projects' && req.method === 'POST') {
          const description = (input as { description?: unknown })?.description;
          if (typeof description !== 'string' || !description.trim() || description.length > 4000) {
            json(res, 400, { error: { message: 'Provide a project description of 1–4000 characters' } }); return;
          }
          const projectId = randomUUID();
          const jobId = `studio-${projectId}`;
          const record: StudioRecord = { projectId, jobId, description: description.trim(), status: 'queued', phase: 'queued', startedAt: new Date().toISOString(), rounds: [] };
          await saveStudioRecord(options.root, record);
          options.runtime.submitBackground({
            jobId, taskId: projectId, mode: 'studio', maxRetries: 0,
            run: async ({ signal }) => {
              const controller = new AbortController();
              const abort = () => controller.abort(signal.reason);
              if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
              const timer = setTimeout(() => controller.abort(new DOMException(`Software generation exceeded ${options.timeoutMs}ms`, 'TimeoutError')), options.timeoutMs);
              try {
                const result = await runSoftwareStudio({ root: options.root, projectId, jobId, description: record.description, signal: controller.signal, orchestrator: options.createOrchestrator?.() });
                if (result.status !== 'ready_for_review') throw new Error(result.error || result.status);
                return { mode: 'studio', task: { id: projectId, type: 'software_creation', description: record.description }, status: 'success', final: { projectId, status: result.status }, raw: result, trace: { mode: 'studio', startedAt: result.startedAt, finishedAt: result.finishedAt, actions: [] } };
              } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
            },
          });
          json(res, 202, { projectId, jobId, projectUrl: `/api/studio/projects/${projectId}` }); return;
        }
        const match = pathname.match(/^\/api\/studio\/projects\/([^/]+)(?:\/(preview|archive|cancel|diagnostics))?$/);
        if (!match) { json(res, 404, { error: { message: 'Studio route not found' } }); return; }
        const [, projectId, action] = match;
        const record = await read(projectId);
        if (action === 'diagnostics') {
          if (req.method === 'GET') { json(res, 200, { reports: await listDiagnostics(options.root, projectId) }); return; }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          const parsed = diagnosticInput.safeParse(input);
          if (!parsed.success) { json(res, 400, { error: { message: 'Provide a preview reference, loaded boolean and up to 20 error messages (1–2000 characters each)' } }); return; }
          if (record.status !== 'ready_for_review' || record.previewFile !== parsed.data.previewFile) {
            json(res, 409, { error: { message: 'Diagnostics must reference the current successful preview' } }); return;
          }
          json(res, 201, { report: await saveDiagnostic(options.root, projectId, parsed.data) }); return;
        }
        if (action === 'cancel' && req.method === 'POST') {
          if (!['queued', 'running'].includes(record.status) || !record.jobId || !options.runtime.cancelJob(record.jobId)) { json(res, 409, { error: { message: 'Project is no longer running' } }); return; }
          record.status = 'cancelled';
          record.phase = 'cancelled';
          record.error = 'User cancelled generation';
          record.finishedAt = new Date().toISOString();
          await saveStudioRecord(options.root, record);
          json(res, 200, { project: record }); return;
        }
        if (req.method !== 'GET') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
        if (!action) { json(res, 200, { project: record }); return; }
        if (record.status !== 'ready_for_review') { json(res, 409, { error: { message: 'Project has no successful build' } }); return; }
        if (action === 'preview') {
          if (!record.previewFile || !/^v[1-3]\/dist\/index.html$/.test(record.previewFile)) throw new Error('Invalid preview reference');
          json(res, 200, { html: await readFile(join(options.root, projectId, record.previewFile), 'utf-8') }); return;
        }
        if (action === 'archive') {
          const archive = await readFile(join(options.root, projectId, 'source.zip'));
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${projectId}.zip"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(archive); return;
        }
        json(res, 404, { error: { message: 'Studio route not found' } });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        const status = code === 'ENOENT' ? 404 : error instanceof Error && error.message === 'Invalid project ID' ? 400 : 500;
        json(res, status, { error: { message: status === 404 ? 'Project not found' : error instanceof Error ? error.message : String(error) } });
      }
    },
  };
}
