import { createOrchestrator } from '../factory.js';
import { listTestPlans, saveTestPlan, testPlanSchema, type TestPlanRecord } from '../studio/testPlans.js';
import { browserRepairErrors, contentHash, executeBrowserRun, listBrowserRuns, saveBrowserRun, type BrowserRun } from '../studio/browserRuns.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Orchestrator } from '../core/Orchestrator.js';
import { runSoftwareStudio, saveStudioRecord, validateProjectId, type StudioRecord } from '../studio/softwareStudio.js';
import type { RunRuntime } from './runRuntime.js';
import { diagnosticInput, listDiagnostics, saveDiagnostic } from '../studio/diagnostics.js';
import { validateFiles, type SourceFile } from '../studio/workspace.js';
import { compareSources } from '../studio/sourceChanges.js';
import { parentVersion, versionFamily } from '../studio/versions.js';
import { listReviews, reviewInput, saveReview } from '../studio/reviews.js';
import { summarizeGeneration } from '../studio/generationMetrics.js';
import { createStudioRequest, StudioRequestConflict } from './studioRequests.js';

export function createStudioApi(options: {
  root: string; runtime: RunRuntime; timeoutMs: number;
  createOrchestrator?: () => Orchestrator;
  browserChecks?: { enabled: boolean; executablePath?: string };
}) {
  const read = async (projectId: string): Promise<StudioRecord> => {
    validateProjectId(projectId);
    const record: StudioRecord = JSON.parse(await readFile(join(options.root, projectId, 'project.json'), 'utf-8'));
    if (record.projectId !== projectId) throw new Error('Project record ID mismatch');
    if (record.status === 'queued' || record.status === 'running') {
      const job = record.jobId ? options.runtime.getJob(record.jobId) : undefined;
      let cliAlive = false;
      if (!record.jobId && record.ownerHost === hostname() && Number.isInteger(record.ownerPid) && record.ownerPid! > 0) {
        try { process.kill(record.ownerPid!, 0); cliAlive = true; }
        catch (error) { cliAlive = (error as NodeJS.ErrnoException).code === 'EPERM'; }
      }
      const interrupted = record.jobId ? !job || ['failed', 'cancelled'].includes(job.status) : record.ownerPid !== undefined && !cliAlive;
      if (interrupted) {
        record.stoppedPhase = record.phase;
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
  const sourceForPreview = (record: StudioRecord, previewFile?: string): SourceFile[] => {
    if (!previewFile || !/^v[1-3]\/dist\/index.html$/.test(previewFile)) throw new Error('Invalid source preview reference');
    const round = record.rounds.find((attempt) => `v${attempt.round}/dist/index.html` === previewFile);
    if (round?.build?.status !== 'passed') throw new Error('Source has no successful build');
    return validateFiles(round.code.output.files);
  };
  const loadFamily = async (projectId: string) => {
    const entries = await readdir(options.root, { withFileTypes: true });
    const records: StudioRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try { validateProjectId(entry.name); } catch { continue; }
      records.push(await read(entry.name));
    }
    return versionFamily(records, projectId);
  };
  const changeHistory = async (record: StudioRecord): Promise<string[]> => {
    const requests: string[] = [];
    const seen = new Set<string>();
    while (true) {
      if (seen.has(record.projectId)) throw new Error('Version history contains a cycle');
      seen.add(record.projectId);
      if (record.revision && !record.retry) requests.unshift(record.revision.changeRequest);
      const parent = parentVersion(record);
      if (!parent) return requests;
      record = await read(parent);
    }
  };
  const currentReview = async (record: StudioRecord) => {
    if (record.status !== 'ready_for_review') return null;
    const review = (await listReviews(options.root, record.projectId)).find((review) => review.previewFile === record.previewFile);
    if (!review) return null;
    if (review.decision === 'approved') {
      const latest = (await listDiagnostics(options.root, record.projectId)).find((report) => report.previewFile === record.previewFile);
      if (latest?.id !== review.diagnosticId) return null;
    }
    return review;
  };
  const startProject = async (description: string, repair?: StudioRecord['repair'], initialFiles?: SourceFile[], revision?: StudioRecord['revision'], changeRequests?: string[], retry?: StudioRecord['retry'], strategy?: StudioRecord['strategy'], projectId: string = randomUUID()) => {
    const jobId = `studio-${projectId}`;
    const record: StudioRecord = { projectId, jobId, description: description.trim(), repair, revision, retry, strategy, status: 'queued', phase: 'queued', startedAt: new Date().toISOString(), rounds: [] };
    await saveStudioRecord(options.root, record);
    options.runtime.submitBackground({
      jobId, taskId: projectId, mode: 'studio', maxRetries: 0,
      run: async ({ signal }) => {
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException(`Software generation exceeded ${options.timeoutMs}ms`, 'TimeoutError')), options.timeoutMs);
        try {
          const result = await runSoftwareStudio({ root: options.root, projectId, jobId, description: record.description, repair, initialFiles, revision, retry, strategy, changeRequests, signal: controller.signal, orchestrator: options.createOrchestrator?.() });
          if (result.status !== 'ready_for_review') throw new Error(result.error || result.status);
          return { mode: 'studio', task: { id: projectId, type: 'software_creation', description: record.description }, status: 'success', final: { projectId, status: result.status }, raw: result, trace: { mode: 'studio', startedAt: result.startedAt, finishedAt: result.finishedAt, actions: [] } };
        } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
      },
    });
    return { projectId, jobId, projectUrl: `/api/studio/projects/${projectId}` };
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
          json(res, 200, { projects: await Promise.all(projects.map(async (record) => {
            const { projectId, description, status, startedAt, phase, jobId, repair, revision, retry } = record;
            return { projectId, description, status, startedAt, phase, jobId, repair, revision, retry, review: await currentReview(record) };
          })) });
          return;
        }
        if (pathname === '/api/studio/projects' && req.method === 'POST') {
          const description = (input as { description?: unknown })?.description;
          if (typeof description !== 'string' || !description.trim() || description.length > 4000) {
            json(res, 400, { error: { message: 'Provide a project description of 1–4000 characters' } }); return;
          }
          const key = req.headers['idempotency-key'];
          if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key))) {
            json(res, 400, { error: { message: 'Idempotency-Key must contain 1–128 letters, digits, underscores or hyphens' } }); return;
          }
          try {
            const accepted = key === undefined ? await startProject(description) : await createStudioRequest(options.root, key, description.trim(), (id) => startProject(description, undefined, undefined, undefined, undefined, undefined, undefined, id));
            json(res, 202, accepted);
          } catch (error) {
            if (!(error instanceof StudioRequestConflict)) throw error;
            json(res, 409, { error: { message: error.message } });
          }
          return;
        }
        const image = pathname.match(/^\/api\/studio\/projects\/([^/]+)\/browser-runs\/([^/]+)\/(initial\.png|final\.png)$/);
        if (image && req.method === 'GET') {
          const [, projectId, runId, name] = image;
          await read(projectId); validateProjectId(runId);
          const run = (await listBrowserRuns(options.root, projectId)).find((run) => run.id === runId);
          if (!run?.screenshots.includes(name as 'initial.png' | 'final.png')) { json(res, 404, { error: { message: 'Screenshot not found' } }); return; }
          const data = await readFile(join(options.root, projectId, 'browser-runs', runId, name));
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(data); return;
        }
        const match = pathname.match(/^\/api\/studio\/projects\/([^/]+)(?:\/(preview|archive|cancel|diagnostics|repair|changes|revise|retry|versions|test-plans|reviews|browser-runs))?$/);
        if (!match) { json(res, 404, { error: { message: 'Studio route not found' } }); return; }
        const [, projectId, action] = match;
        const record = await read(projectId);
        if (action === 'browser-runs') {
          const runs = await listBrowserRuns(options.root, projectId);
          for (const run of runs.filter((run) => ['queued', 'running'].includes(run.status))) {
            const job = options.runtime.getJob(run.jobId);
            if (!options.runtime.isJobActive(run.jobId) && (!job || ['failed', 'cancelled', 'succeeded'].includes(job.status))) {
              run.status = job?.status === 'cancelled' ? 'cancelled' : 'failed';
              run.error = job?.error || 'Browser check interrupted; run a new check';
              run.finishedAt = job?.finishedAt || new Date().toISOString();
              await saveBrowserRun(options.root, run);
            }
          }
          if (req.method === 'GET') {
            if (record.status === 'ready_for_review') sourceForPreview(record, record.previewFile);
            const html = record.status === 'ready_for_review' && record.previewFile ? await readFile(join(options.root, projectId, record.previewFile), 'utf8') : undefined;
            const plans = html !== undefined ? await listTestPlans(options.root, projectId) : [];
            json(res, 200, { enabled: !!options.browserChecks?.enabled, runs: runs.map((run) => ({ ...run, repairable: html !== undefined && run.projectId === projectId && run.previewFile === record.previewFile && browserRepairErrors(run, plans.find((plan) => plan.id === run.testPlanId), html).length > 0 })) }); return;
          }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1) { json(res, 400, { error: { message: 'Provide only testPlanId or cancelRunId' } }); return; }
          const { testPlanId, cancelRunId } = input as { testPlanId?: unknown; cancelRunId?: unknown };
          if (cancelRunId !== undefined) {
            const run = runs.find((run) => run.id === cancelRunId);
            if (!run || !['queued', 'running'].includes(run.status) || !options.runtime.cancelJob(run.jobId)) { json(res, 409, { error: { message: 'No active browser run with this ID' } }); return; }
            json(res, 202, { runId: run.id, jobId: run.jobId }); return;
          }
          if (typeof testPlanId !== 'string') { json(res, 400, { error: { message: 'Provide a saved testPlanId' } }); return; }
          if (!options.browserChecks?.enabled) { json(res, 409, { error: { message: 'Independent browser checks are disabled on this server' } }); return; }
          if (record.status !== 'ready_for_review' || !record.previewFile) { json(res, 409, { error: { message: 'Browser checks require a successful preview' } }); return; }
          sourceForPreview(record, record.previewFile);
          const plan = (await listTestPlans(options.root, projectId)).find((plan) => plan.id === testPlanId);
          const output = plan?.result?.output;
          const checks = testPlanSchema.safeParse(output && { checks: output.checks, limitations: output.limitations });
          if (!plan || plan.status !== 'ready' || plan.previewFile !== record.previewFile || !checks.success) { json(res, 409, { error: { message: 'Browser checks require a ready plan for this preview' } }); return; }
          const html = await readFile(join(options.root, projectId, record.previewFile), 'utf8');
          const id = randomUUID();
          const run: BrowserRun = { id, projectId, testPlanId, previewFile: record.previewFile, previewHash: contentHash(html), planHash: contentHash(JSON.stringify(checks.data)), jobId: `studio-browser-${id}`, source: 'server-browser', status: 'queued', startedAt: new Date().toISOString(), viewport: { width: 1280, height: 720 }, checks: [], errors: [], blockedRequests: [], screenshots: [] };
          await saveBrowserRun(options.root, run);
          options.runtime.submitBackground({ jobId: run.jobId, taskId: id, mode: 'studio-browser', maxRetries: 0, run: async ({ signal }) => {
            const result = await executeBrowserRun({ root: options.root, run, html, plan: checks.data, signal, executablePath: options.browserChecks?.executablePath });
            if (result.status !== 'passed') throw new Error(result.error || 'Independent browser checks failed; see saved report');
            return { mode: 'studio-browser', task: { id, type: 'browser_check', description: record.description }, status: 'success', final: { runId: id }, raw: result, trace: { mode: 'studio-browser', startedAt: result.startedAt, finishedAt: result.finishedAt, actions: [] } };
          } });
          json(res, 202, { runId: id, jobId: run.jobId }); return;
        }
        if (action === 'retry') {
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)) { json(res, 400, { error: { message: 'Retry accepts an empty object' } }); return; }
          if (!['failed', 'cancelled'].includes(record.status)) { json(res, 409, { error: { message: 'Retry requires a failed or cancelled generation' } }); return; }
          if (record.jobId && options.runtime.isJobActive(record.jobId)) { json(res, 409, { error: { message: 'Wait until the interrupted generation has stopped' } }); return; }
          const requests = await changeHistory(record);
          const sourceParent = record.repair?.parentProjectId || record.revision?.parentProjectId;
          const initialFiles = sourceParent ? sourceForPreview(await read(sourceParent), record.repair?.previewFile || record.revision?.previewFile) : undefined;
          json(res, 202, await startProject(record.description, record.repair, initialFiles, record.revision, requests, { parentProjectId: projectId }, record.strategy)); return;
        }
        if (action === 'reviews') {
          if (req.method === 'GET') {
            const reviews = await listReviews(options.root, projectId);
            json(res, 200, { reviews, current: await currentReview(record) }); return;
          }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          const parsed = reviewInput.safeParse(input);
          if (!parsed.success) { json(res, 400, { error: { message: 'Provide a decision, current preview, saved diagnostic, reviewer, note and explicit manual review confirmation' } }); return; }
          if (record.status !== 'ready_for_review' || parsed.data.previewFile !== record.previewFile) { json(res, 409, { error: { message: 'Review requires the current successful preview' } }); return; }
          sourceForPreview(record, record.previewFile);
          const reports = await listDiagnostics(options.root, projectId);
          const report = reports.find((report) => report.id === parsed.data.diagnosticId);
          if (!report) { json(res, 404, { error: { message: 'Diagnostic not found in this project' } }); return; }
          if (report.previewFile !== record.previewFile) { json(res, 409, { error: { message: 'Review evidence must reference the current preview' } }); return; }
          if (parsed.data.decision === 'approved' && (!report.loaded || report.errors.length || report.checks?.some((check) => check.status === 'failed'))) { json(res, 409, { error: { message: 'Approval requires a loaded observation without reported errors or failed checks' } }); return; }
          if (parsed.data.decision === 'approved' && reports.find((report) => report.previewFile === record.previewFile)?.id !== report.id) { json(res, 409, { error: { message: 'Approval must reference the latest diagnostic for this preview' } }); return; }
          json(res, 201, { review: await saveReview(options.root, projectId, parsed.data) }); return;
        }
        if (action === 'test-plans') {
          const plans = await listTestPlans(options.root, projectId);
          for (const plan of plans) {
            if (!['queued', 'running'].includes(plan.status)) continue;
            const job = options.runtime.getJob(plan.jobId);
            if (!job || ['failed', 'cancelled', 'succeeded'].includes(job.status)) {
              plan.status = job?.status === 'cancelled' ? 'cancelled' : 'failed';
              plan.error = job?.error || 'Test planning was interrupted';
              plan.finishedAt = job?.finishedAt || new Date().toISOString();
              await saveTestPlan(options.root, plan);
            }
          }
          if (req.method === 'GET') { json(res, 200, { plans }); return; }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => key !== 'cancelPlanId'))) { json(res, 400, { error: { message: 'Provide an empty object or cancelPlanId' } }); return; }
          const cancelPlanId = (input as { cancelPlanId?: unknown })?.cancelPlanId;
          if (cancelPlanId !== undefined) {
            const plan = plans.find((plan) => plan.id === cancelPlanId);
            if (!plan || !['queued', 'running'].includes(plan.status) || !options.runtime.cancelJob(plan.jobId)) { json(res, 409, { error: { message: 'No running test plan with this ID' } }); return; }
            plan.status = 'cancelled'; plan.error = 'User cancelled test planning'; plan.finishedAt = new Date().toISOString();
            await saveTestPlan(options.root, plan); json(res, 200, { plan }); return;
          }
          if (record.status !== 'ready_for_review' || !record.previewFile) { json(res, 409, { error: { message: 'Test planning requires a successful preview' } }); return; }
          const files = sourceForPreview(record, record.previewFile);
          const requests = await changeHistory(record);
          const id = randomUUID();
          const plan: TestPlanRecord = { id, projectId, previewFile: record.previewFile, jobId: `studio-tests-${id}`, status: 'queued', startedAt: new Date().toISOString() };
          await saveTestPlan(options.root, plan);
          options.runtime.submitBackground({ jobId: plan.jobId, taskId: id, mode: 'studio-tests', maxRetries: 0, run: async ({ signal }) => {
            plan.status = 'running'; await saveTestPlan(options.root, plan);
            try {
              const orchestrator = options.createOrchestrator?.() || createOrchestrator('StudioTester', undefined, { includeTester: true });
              plan.result = await orchestrator.runTask({ id, type: 'browser_test_plan', description: record.description, context: { files, changeRequests: requests, repair: record.repair } }, 'tester', { signal });
              if (plan.result.status !== 'success') throw new Error(plan.result.reasoning || 'Test planning failed');
              signal.throwIfAborted(); plan.status = 'ready';
              return { mode: 'studio-tests', task: { id, type: 'browser_test_plan', description: record.description }, status: 'success', final: { planId: id }, raw: plan, trace: { mode: 'studio-tests', startedAt: plan.startedAt, finishedAt: new Date().toISOString(), actions: [] } };
            } catch (error) {
              plan.status = signal.aborted ? 'cancelled' : 'failed'; plan.error = error instanceof Error ? error.message : String(error); throw error;
            } finally { plan.finishedAt = new Date().toISOString(); await saveTestPlan(options.root, plan); }
          } });
          json(res, 202, { planId: id, jobId: plan.jobId }); return;
        }
        if (action === 'versions') {
          const family = await loadFamily(projectId);
          const selectionFile = join(options.root, family.rootProjectId, 'version-selection.json');
          if (req.method === 'GET') {
            let selectedProjectId: string | null = family.versions.find((version) => version.projectId === family.rootProjectId)?.status === 'ready_for_review' ? family.rootProjectId : null;
            try { selectedProjectId = JSON.parse(await readFile(selectionFile, 'utf-8')).projectId; }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
            if (selectedProjectId !== null && !family.versions.some((version) => version.projectId === selectedProjectId)) throw new Error('Selected version is missing from this family');
            json(res, 200, { rootProjectId: family.rootProjectId, selectedProjectId, versions: await Promise.all(family.versions.map(async (record) => {
              const { projectId, description, status, startedAt, repair, revision, retry } = record;
              return { projectId, description, status, startedAt, repair, revision, retry, review: await currentReview(record) };
            })) }); return;
          }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          const target = (input as { projectId?: unknown })?.projectId;
          if (typeof target !== 'string') { json(res, 400, { error: { message: 'Provide a project UUID' } }); return; }
          validateProjectId(target);
          const version = family.versions.find((version) => version.projectId === target);
          if (!version || version.status !== 'ready_for_review') { json(res, 409, { error: { message: 'Select a successful version in this project family' } }); return; }
          sourceForPreview(version, version.previewFile);
          const temporary = `${selectionFile}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify({ projectId: target, selectedAt: new Date().toISOString() }));
          await rename(temporary, selectionFile);
          json(res, 200, { selectedProjectId: target }); return;
        }
        if (action === 'revise' && req.method === 'POST') {
          const changeRequest = (input as { changeRequest?: unknown })?.changeRequest;
          if (typeof changeRequest !== 'string' || !changeRequest.trim() || changeRequest.length > 4000) { json(res, 400, { error: { message: 'Provide a change request of 1–4000 characters' } }); return; }
          if (record.status !== 'ready_for_review' || !record.previewFile) { json(res, 409, { error: { message: 'Revision requires a successful source version' } }); return; }
          const files = sourceForPreview(record, record.previewFile);
          const requests = [...await changeHistory(record), changeRequest.trim()];
          json(res, 202, await startProject(record.description, undefined, files, { parentProjectId: projectId, previewFile: record.previewFile, changeRequest: changeRequest.trim() }, requests)); return;
        }
        if (action === 'repair' && req.method === 'POST') {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1) { json(res, 400, { error: { message: 'Provide only diagnosticId or browserRunId' } }); return; }
          const browserRunId = (input as { browserRunId?: unknown }).browserRunId;
          if (browserRunId !== undefined) {
            if (typeof browserRunId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(browserRunId)) { json(res, 400, { error: { message: 'Provide a saved browser run UUID' } }); return; }
            const run = (await listBrowserRuns(options.root, projectId)).find((run) => run.id === browserRunId);
            if (!run || run.projectId !== projectId) { json(res, 404, { error: { message: 'Browser run not found in this project' } }); return; }
            if (record.status !== 'ready_for_review' || !record.previewFile || run.previewFile !== record.previewFile) { json(res, 409, { error: { message: 'Browser repair requires the current successful preview' } }); return; }
            const files = sourceForPreview(record, record.previewFile);
            const plan = (await listTestPlans(options.root, projectId)).find((plan) => plan.id === run.testPlanId);
            const html = await readFile(join(options.root, projectId, record.previewFile), 'utf8');
            const errors = browserRepairErrors(run, plan, html);
            if (!errors.length) { json(res, 409, { error: { message: 'Repair requires completed application failures in the matching browser run; infrastructure errors require server recovery' } }); return; }
            json(res, 202, await startProject(record.description, { parentProjectId: projectId, browserRunId, testPlanId: run.testPlanId, previewFile: run.previewFile, errors }, files, undefined, await changeHistory(record), undefined, record.strategy)); return;
          }
          const diagnosticId = (input as { diagnosticId?: unknown })?.diagnosticId;
          if (typeof diagnosticId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(diagnosticId)) {
            json(res, 400, { error: { message: 'Provide a saved diagnostic UUID' } }); return;
          }
          const report = (await listDiagnostics(options.root, projectId)).find((report) => report.id === diagnosticId);
          if (!report) { json(res, 404, { error: { message: 'Diagnostic not found in this project' } }); return; }
          if (record.status !== 'ready_for_review' || report.previewFile !== record.previewFile || !report.errors.length) {
            json(res, 409, { error: { message: 'Repair requires errors from the current successful preview' } }); return;
          }
          const files = sourceForPreview(record, record.previewFile);
          json(res, 202, await startProject(record.description, { parentProjectId: projectId, diagnosticId, previewFile: report.previewFile, errors: report.errors }, files, undefined, await changeHistory(record))); return;
        }
        if (action === 'diagnostics') {
          if (req.method === 'GET') { json(res, 200, { reports: await listDiagnostics(options.root, projectId) }); return; }
          if (req.method !== 'POST') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
          const parsed = diagnosticInput.safeParse(input);
          if (!parsed.success) { json(res, 400, { error: { message: 'Provide a preview reference, loaded boolean and up to 20 error messages (1–2000 characters each)' } }); return; }
          if (record.status !== 'ready_for_review' || record.previewFile !== parsed.data.previewFile) {
            json(res, 409, { error: { message: 'Diagnostics must reference the current successful preview' } }); return;
          }
          if (parsed.data.checks) {
            const plan = (await listTestPlans(options.root, projectId)).find((plan) => plan.id === parsed.data.testPlanId);
            if (!plan || plan.status !== 'ready' || plan.previewFile !== record.previewFile
              || plan.result?.output.checks.length !== parsed.data.checks.length
              || parsed.data.checks.some((check, index) => check.name !== plan.result?.output.checks[index].name
                || (check.status === 'passed' && (check.actual !== plan.result?.output.checks[index].expected || check.error !== undefined)))) {
              json(res, 409, { error: { message: 'Check results must match a ready plan for this preview' } }); return;
            }
            parsed.data.errors = [...parsed.data.errors, ...parsed.data.checks.filter((check) => check.status === 'failed').map((check) => `Check ${check.name}: ${check.error || 'failed'}`.slice(0, 2000))].slice(0, 20);
          }
          json(res, 201, { report: await saveDiagnostic(options.root, projectId, parsed.data) }); return;
        }
        if (action === 'cancel' && req.method === 'POST') {
          if (!['queued', 'running'].includes(record.status) || !record.jobId || !options.runtime.cancelJob(record.jobId)) { json(res, 409, { error: { message: 'Project is no longer running' } }); return; }
          record.stoppedPhase = record.phase;
          record.status = 'cancelled';
          record.phase = 'cancelled';
          record.error = 'User cancelled generation';
          record.finishedAt = new Date().toISOString();
          await saveStudioRecord(options.root, record);
          json(res, 200, { project: record }); return;
        }
        if (req.method !== 'GET') { json(res, 405, { error: { message: 'Method not allowed' } }); return; }
        if (!action) { json(res, 200, { project: { ...record, generationMetrics: summarizeGeneration(record), review: await currentReview(record) } }); return; }
        if (action === 'changes') {
          if (!(record.repair || record.revision) || record.status !== 'ready_for_review') { json(res, 409, { error: { message: 'Source comparison requires a successful repair project' } }); return; }
          const origin = (record.repair || record.revision)!;
          const parent = await read(origin.parentProjectId);
          const changes = compareSources(sourceForPreview(parent, origin.previewFile), sourceForPreview(record, record.previewFile));
          json(res, 200, { changes: { projectId, parentProjectId: parent.projectId, fromPreview: origin.previewFile, toPreview: record.previewFile, ...changes } }); return;
        }
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
