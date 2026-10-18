import { strToU8, zipSync } from 'fflate';
import { coderPrompt, managerPrompt, testerPrompt, STUDIO_CONSTRAINTS, STUDIO_DELIVERABLE, type Prompt } from '@studio-shared/prompts';
import { parseCodeOutput, parseModelObject, parsePlanOutput, parseTestPlanOutput } from '@studio-shared/parse';
import type { StudioDiagnostic, StudioEvent, StudioEventType, StudioProject, StudioSummary, StudioTestPlan } from '../../types/studio';
import { streamChat, type LlmUsage } from './llm';
import { buildInBrowser } from './build';
import { runInPageChecks } from './checks';
import { liveCredentials } from './key';

/**
 * PLAY LIVE: the Studio loop of src/studio/softwareStudio.ts, run in the visitor's browser with
 * their own DeepSeek key. It emits the same events as the server, so the squad, sounds and result
 * panels work unchanged. Projects are stored per visitor in IndexedDB (best effort).
 */
export const LIVE_PREFIX = 'live-';
export const isLiveProject = (projectId?: string) => !!projectId?.startsWith(LIVE_PREFIX);
export const LIVE_CODER_TIMEOUT_MS = 300_000;
const AGENT_TIMEOUT_MS = 180_000;
const TERMINAL = new Set<StudioEventType>(['ready_for_review', 'failed', 'cancelled']);

type Files = { path: string; content: string; description?: string }[];
type Entry = { project: StudioProject; events: StudioEvent[]; html?: string; files?: Files; plan?: StudioTestPlan; diagnostics: StudioDiagnostic[] };
const entries = new Map<string, Entry>();
const controllers = new Map<string, AbortController>();
const listeners = new Map<string, Set<(event: StudioEvent) => void>>();

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();

// ---- persistence (IndexedDB; the page still works for this tab when it is unavailable) ----
const DB = 'pixelagent-live';
let database: Promise<IDBDatabase | null> | undefined;
const openDatabase = () => (database ??= new Promise((resolve) => {
  try {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  } catch { resolve(null); }
}));
const persist = async (entry: Entry) => {
  try {
    const db = await openDatabase();
    db?.transaction('projects', 'readwrite').objectStore('projects').put(structuredClone(entry), entry.project.projectId);
  } catch { /* per-visitor convenience only */ }
};
let loaded: Promise<void> | undefined;
const ready = () => (loaded ??= (async () => {
  try {
    const db = await openDatabase();
    if (!db) return;
    const all = await new Promise<Entry[]>((resolve) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result as Entry[]);
      request.onerror = () => resolve([]);
    });
    for (const entry of all) {
      if (entries.has(entry.project.projectId)) continue;
      entries.set(entry.project.projectId, entry);
      // A run cannot survive a page reload: its requests died with the page.
      if (['queued', 'running'].includes(entry.project.status)) finishFailed(entry, 'The page was closed or reloaded during this run', 'failed');
      if (entry.plan && ['queued', 'running'].includes(entry.plan.status)) { entry.plan.status = 'failed'; entry.plan.error = 'The page was closed or reloaded during test planning'; }
    }
  } catch { /* start empty */ }
})());

// ---- events ----
function emit(entry: Entry, type: StudioEventType, data?: Record<string, unknown>, round?: number) {
  const event: StudioEvent = { seq: entry.events.length + 1, at: now(), type, ...(round !== undefined ? { round } : {}), ...(data ? { data } : {}) };
  entry.events.push(event);
  void persist(entry);
  for (const listener of listeners.get(entry.project.projectId) || []) listener(event);
}
const summarizeErrors = (errors: string[]) => errors.slice(0, 3).map((error) => error.slice(0, 300));

function finishFailed(entry: Entry, error: string, status: 'failed' | 'cancelled') {
  const { project } = entry;
  project.stoppedPhase = project.phase;
  project.status = status;
  project.phase = status;
  project.error = error;
  project.finishedAt = now();
  emit(entry, status, { stoppedPhase: project.stoppedPhase, error: error.slice(0, 300) });
}

// ---- agents ----
type AgentReply<T> = { output: T & { llmUsage?: LlmUsage; llmModel: string; llmProvider: 'deepseek' } };
async function ask<T>(agent: string, prompt: Prompt, parse: (object: unknown) => T, signal: AbortSignal, timeoutMs: number): Promise<AgentReply<T>> {
  const credentials = liveCredentials();
  if (!credentials) throw new Error('Add your DeepSeek key to build live.');
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`${agent} exceeded its ${timeoutMs / 1000} s limit`)), timeoutMs);
  try {
    const reply = await streamChat({ apiKey: credentials.key, model: credentials.model, ...prompt, signal: controller.signal });
    return { output: { ...parse(parseModelObject(reply.content)), llmUsage: reply.usage, llmModel: reply.model, llmProvider: 'deepseek' } };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

function metrics(entry: Entry): StudioProject['generationMetrics'] {
  const { project } = entry;
  const tasks = [project.plan, ...project.rounds.map((round) => round.code)].filter(Boolean) as { output?: { llmUsage?: LlmUsage; llmModel?: string } }[];
  const usage = tasks.map((task) => task.output?.llmUsage).filter(Boolean) as LlmUsage[];
  return {
    elapsedMs: project.finishedAt ? Date.parse(project.finishedAt) - Date.parse(project.startedAt) : null,
    buildAttempts: project.rounds.filter((round) => round.build).length,
    failedBuilds: project.rounds.filter((round) => round.build?.status === 'failed').length,
    agentTasks: tasks.length, reportedUsageTasks: usage.length, missingUsageTasks: tasks.length - usage.length,
    reportedTokens: usage.reduce((sum, item) => sum + (item.total_tokens || 0), 0),
    models: [...new Set(tasks.map((task) => task.output?.llmModel).filter(Boolean) as string[])].map((model) => `deepseek/${model}`),
    costUsd: null,
  };
}

// ---- the loop ----
async function generate(entry: Entry, signal: AbortSignal) {
  const { project } = entry;
  const description = project.description;
  const phase = (name: string, round?: number) => {
    project.phase = name; project.status = 'running';
    emit(entry, 'phase', { phase: name }, round);
  };
  try {
    phase('planning');
    const plan = await ask('Manager', managerPrompt(description, { constraints: STUDIO_CONSTRAINTS, deliverable: STUDIO_DELIVERABLE }), parsePlanOutput, signal, AGENT_TIMEOUT_MS);
    project.plan = { status: 'success', output: plan.output };
    emit(entry, 'plan_ready', { projectName: plan.output.projectName });
    let previousFiles: Files = [];
    let revisionNotes: string[] = [];
    for (let round = 1; round <= 3; round++) {
      phase('coding', round);
      const code = await ask('Coder', coderPrompt(description, 'javascript', { language: 'javascript', constraints: STUDIO_CONSTRAINTS, plan: project.plan.output, previousFiles, revisionNotes }), parseCodeOutput, signal, LIVE_CODER_TIMEOUT_MS);
      const attempt: StudioProject['rounds'][number] = { round, code: { status: 'success', output: code.output } };
      project.rounds.push(attempt);
      if (code.output.dependencies.length) throw new Error('Generated project requires unsupported dependencies');
      emit(entry, 'code_ready', { files: code.output.files.length }, round);
      phase('building', round);
      const build = await buildInBrowser(code.output.files, signal);
      attempt.build = { status: build.status, errors: build.errors, checkedFiles: build.checkedFiles, browserVerified: false };
      emit(entry, build.status === 'passed' ? 'build_passed' : 'build_failed', build.status === 'passed' ? undefined : { errors: summarizeErrors(build.errors) }, round);
      if (build.status === 'passed') {
        entry.html = build.html; entry.files = code.output.files;
        project.previewFile = `v${round}/dist/index.html`; project.archiveFile = 'source.zip';
        project.status = 'ready_for_review'; project.phase = 'ready_for_review'; project.finishedAt = now();
        project.generationMetrics = metrics(entry);
        emit(entry, 'ready_for_review', { previewFile: project.previewFile }, round);
        break;
      }
      previousFiles = code.output.files;
      revisionNotes = [...build.errors];
    }
    if (project.status === 'running') throw new Error('Build failed after three attempts');
  } catch (error) {
    const cancelled = signal.aborted;
    finishFailed(entry, cancelled ? 'Cancelled by you' : error instanceof Error ? error.message : String(error), cancelled ? 'cancelled' : 'failed');
    project.generationMetrics = metrics(entry);
    return;
  }
  await test(entry, signal);
}

async function test(entry: Entry, signal: AbortSignal) {
  const { project } = entry;
  const plan: StudioTestPlan = { id: crypto.randomUUID(), projectId: project.projectId, previewFile: project.previewFile!, jobId: `live-tests-${project.projectId}`, status: 'running' };
  entry.plan = plan;
  emit(entry, 'test_plan_started', { planId: plan.id });
  try {
    const result = await ask('Tester', testerPrompt(project.description, { files: entry.files, changeRequests: [] }), parseTestPlanOutput, signal, AGENT_TIMEOUT_MS);
    plan.status = 'ready';
    plan.result = { status: 'success', output: result.output };
    emit(entry, 'test_plan_ready', { planId: plan.id, checks: result.output.checks.length });
  } catch (error) {
    plan.status = signal.aborted ? 'cancelled' : 'failed';
    plan.error = signal.aborted ? 'Cancelled by you' : error instanceof Error ? error.message : String(error);
    emit(entry, 'test_plan_failed', { planId: plan.id, status: plan.status, error: plan.error.slice(0, 300) });
    return;
  }
  const checks = plan.result.output.checks;
  const runId = crypto.randomUUID();
  emit(entry, 'browser_run_started', { runId, testPlanId: plan.id, checks: checks.length, source: 'in-page' });
  try {
    const { results, errors } = await runInPageChecks(entry.html!, checks, signal);
    for (const result of results) emit(entry, 'browser_check', { runId, name: result.name, passed: result.status === 'passed', actual: result.actual });
    const passed = results.filter((result) => result.status === 'passed').length;
    entry.diagnostics.unshift({ id: runId, savedAt: now(), source: 'browser-client', previewFile: project.previewFile!, loaded: true, errors, testPlanId: plan.id, checks: results });
    emit(entry, 'browser_run_finished', { runId, status: passed === results.length && !errors.length ? 'passed' : 'failed', passed, failed: results.length - passed, source: 'in-page' });
  } catch (error) {
    emit(entry, 'browser_run_finished', { runId, status: signal.aborted ? 'cancelled' : 'failed', passed: 0, failed: 0, error: (error instanceof Error ? error.message : String(error)).slice(0, 300), source: 'in-page' });
  }
}

function start(description: string): { projectId: string; jobId: string } {
  if (!liveCredentials()) throw httpError('Add your DeepSeek key to build live.', 401);
  const text = description.trim();
  if (!text || text.length > 4000) throw httpError('Provide a project description of 1–4000 characters', 400);
  const projectId = `${LIVE_PREFIX}${crypto.randomUUID()}`;
  const entry: Entry = { project: { projectId, description: text, status: 'queued', startedAt: now(), strategy: 'manager-coder', rounds: [] }, events: [], diagnostics: [] };
  entries.set(projectId, entry);
  emit(entry, 'queued', { strategy: 'manager-coder', repair: false, revision: false, retry: false, source: 'browser' });
  const controller = new AbortController();
  controllers.set(projectId, controller);
  void generate(entry, controller.signal).finally(() => { controllers.delete(projectId); void persist(entry); });
  return { projectId, jobId: `live-${projectId}` };
}

const summary = ({ project }: Entry): StudioSummary => ({ projectId: project.projectId, description: project.description, status: project.status, startedAt: project.startedAt, phase: project.phase });

/** Live projects for the project list, newest first. */
export async function liveSummaries(): Promise<StudioSummary[]> {
  await ready();
  return [...entries.values()].map(summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Answers a dashboard API call for live projects; `undefined` means "not a live request". */
export async function liveRequest(method: string, path: string, body?: string): Promise<unknown> {
  if (method === 'POST' && path === '/api/studio/projects') return start(JSON.parse(body || '{}').description || '');
  const match = path.match(/^\/api\/studio\/projects\/([^/?]+)(?:\/([a-z-]+))?(?:\?(.*))?$/);
  if (!match || !isLiveProject(decodeURIComponent(match[1]))) return undefined;
  await ready();
  const projectId = decodeURIComponent(match[1]);
  const entry = entries.get(projectId);
  if (!entry) throw httpError('This live run is not stored in this browser.', 404);
  const action = match[2] || '';
  const route = `${method} ${action}`;
  switch (route) {
    case 'GET ': return { project: entry.project };
    case 'GET events': {
      const after = Number(new URLSearchParams(match[3] || '').get('after') || 0);
      return { events: entry.events.filter((event) => event.seq > after), derived: false };
    }
    case 'GET preview': if (!entry.html) throw httpError('No preview yet', 409); return { html: entry.html };
    case 'POST cancel': controllers.get(projectId)?.abort(new DOMException('Cancelled by you', 'AbortError')); return { project: entry.project };
    case 'POST retry': return start(entry.project.description);
    case 'GET versions': return { rootProjectId: projectId, selectedProjectId: projectId, versions: [summary(entry)] };
    case 'GET test-plans': return { plans: entry.plan ? [entry.plan] : [] };
    case 'GET browser-runs': return { enabled: false, runs: [] };
    case 'GET diagnostics': return { reports: entry.diagnostics };
    case 'GET reviews': return { reviews: [], current: null };
    default: throw httpError('That action is not available for live browser runs. Clone the repo to use the full Studio.', 405);
  }
}

/** Live counterpart of the SSE stream: replays events after `after`, then follows until the run ends. */
export async function liveEventStream(projectId: string, after: number, onEvent: (event: StudioEvent) => void, signal: AbortSignal): Promise<void> {
  await ready();
  const entry = entries.get(projectId);
  if (!entry) throw httpError('This live run is not stored in this browser.', 404);
  for (const event of entry.events.filter((item) => item.seq > after)) onEvent(event);
  if (entry.events.some((event) => TERMINAL.has(event.type))) return;
  await new Promise<void>((resolve) => {
    const set = listeners.get(projectId) || new Set();
    listeners.set(projectId, set);
    const done = () => { set.delete(listener); signal.removeEventListener('abort', done); resolve(); };
    const listener = (event: StudioEvent) => { onEvent(event); if (TERMINAL.has(event.type)) done(); };
    set.add(listener);
    signal.addEventListener('abort', done, { once: true });
  });
}

/** Same layout as the server's source.zip. */
export async function liveArchive(projectId: string): Promise<Blob> {
  await ready();
  const entry = entries.get(projectId);
  if (!entry?.html || !entry.files) throw httpError('No build to download yet', 409);
  const build = entry.project.rounds.at(-1)?.build;
  const zip: Record<string, Uint8Array> = {};
  for (const file of entry.files) zip[`source/${file.path}`] = strToU8(file.content);
  zip['preview/index.html'] = strToU8(entry.html);
  zip['build-report.json'] = strToU8(JSON.stringify(build, null, 2));
  zip['RUNNING.md'] = strToU8('# Run this project\n\nOpen preview/index.html in a modern browser. No installation is required.\n\nSource files are in source/. Built live in the browser by PixelAgent Hub PLAY LIVE. Build success is not browser interaction verification.\n');
  return new Blob([zipSync(zip)], { type: 'application/zip' });
}

/** Test hook: forget in-memory runs. */
export function resetLiveStudioForTests() { entries.clear(); controllers.clear(); listeners.clear(); loaded = Promise.resolve(); }
