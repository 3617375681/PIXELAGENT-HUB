import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Orchestrator } from '../core/Orchestrator.js';
import { runSoftwareStudio, validateProjectId, type StudioRecord } from './softwareStudio.js';
import { listTestPlans, saveTestPlan, testPlanSchema } from './testPlans.js';
import { contentHash, listBrowserRuns } from './browserRuns.js';
import { listDiagnostics } from './diagnostics.js';
import { listReviews } from './reviews.js';
import { summarizeGeneration } from './generationMetrics.js';
export { summarizeGeneration } from './generationMetrics.js';

const caseSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), title: z.string().min(1), description: z.string().min(1).max(4000), checks: testPlanSchema.shape.checks, limitations: testPlanSchema.shape.limitations }).strict();
export const benchmarkCasesSchema = z.array(caseSchema).min(1).max(20).refine((cases) => new Set(cases.map((entry) => entry.id)).size === cases.length, 'Case IDs must be unique');
export type BenchmarkCase = z.infer<typeof caseSchema>;
export type BenchmarkEntry = {
  caseId: string; strategy: NonNullable<StudioRecord['strategy']>; projectId: string;
  status: 'running' | StudioRecord['status']; elapsedMs?: number | null; buildAttempts?: number; failedBuilds?: number;
  agentTasks?: number; reportedUsageTasks?: number; reportedTokens?: number; models?: string[]; error?: string;
  testPlanId?: string; interactionStatus: 'not_run'; costUsd: null;
};
export type BenchmarkRun = { id: string; startedAt: string; finishedAt?: string; sourceRevision: string; sourceDirty: boolean; casesSha256: string; status: 'running' | 'completed' | 'cancelled' | 'interrupted'; entries: BenchmarkEntry[] };

export async function runStudioBenchmark(options: {
  cases: BenchmarkCase[]; strategies: NonNullable<StudioRecord['strategy']>[];
  root: string; projectRoot: string; sourceRevision: string; sourceDirty: boolean; timeoutMs: number; signal?: AbortSignal;
  createOrchestrator?: () => Orchestrator; onEntry?: (entry: BenchmarkEntry) => void;
}): Promise<BenchmarkRun> {
  const cases = benchmarkCasesSchema.parse(options.cases);
  for (const entry of cases) testPlanSchema.parse({ checks: entry.checks, limitations: entry.limitations });
  if (!options.strategies.length || new Set(options.strategies).size !== options.strategies.length || options.strategies.some((strategy) => !['manager-coder', 'coder-only'].includes(strategy))) throw new Error('Choose distinct supported benchmark strategies');
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error('Benchmark timeout must be a positive integer');
  const run: BenchmarkRun = { id: randomUUID(), sourceRevision: options.sourceRevision, sourceDirty: options.sourceDirty, casesSha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), status: 'running', startedAt: new Date().toISOString(), entries: [] };
  const directory = join(options.root, run.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'cases.json'), JSON.stringify(cases, null, 2));
  const save = async () => {
    const temporary = join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(run, null, 2));
    await rename(temporary, join(directory, 'run.json'));
  };
  await save();
  outer: for (const entry of cases) for (const strategy of options.strategies) {
    if (options.signal?.aborted) { run.status = 'cancelled'; break outer; }
    const row: BenchmarkEntry = { caseId: entry.id, strategy, projectId: randomUUID(), status: 'running', interactionStatus: 'not_run', costUsd: null };
    run.entries.push(row); await save(); options.onEntry?.(row);
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException('Benchmark generation timeout', 'TimeoutError')), options.timeoutMs);
    let result: StudioRecord;
    try { result = await runSoftwareStudio({ projectId: row.projectId, strategy, description: entry.description, root: options.projectRoot, signal: controller.signal, orchestrator: options.createOrchestrator?.() }); }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
    Object.assign(row, summarizeGeneration(result));
    if (result.status === 'ready_for_review') {
      const planId = randomUUID();
      await saveTestPlan(options.projectRoot, { id: planId, projectId: row.projectId, previewFile: result.previewFile!, jobId: `benchmark-fixed-${planId}`, status: 'ready', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), result: { taskId: planId, agentId: 'benchmark', status: 'success', output: { checks: entry.checks, limitations: entry.limitations, llmProvider: 'benchmark', llmModel: 'fixed-checks' }, reasoning: 'Fixed benchmark checks; no Tester model call' } });
      row.testPlanId = planId;
    }
    await save(); options.onEntry?.(row);
  }
  if (run.status === 'running') run.status = options.signal?.aborted ? 'cancelled' : 'completed';
  run.finishedAt = new Date().toISOString(); await save();
  return run;
}

export async function readBenchmarkCases(path: string): Promise<BenchmarkCase[]> {
  return benchmarkCasesSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

/** Independent browser evidence, client observations and human decisions remain separate. */
export async function collectBenchmarkReport(run: BenchmarkRun, projectRoot: string) {
  const entries = await Promise.all(run.entries.map(async (entry) => {
    validateProjectId(entry.projectId);
    const record: StudioRecord = JSON.parse(await readFile(join(projectRoot, entry.projectId, 'project.json'), 'utf8'));
    if (record.projectId !== entry.projectId || record.strategy !== entry.strategy) throw new Error('Benchmark project identity or strategy mismatch');
    const diagnostics = await listDiagnostics(projectRoot, entry.projectId);
    const observation = record.status === 'ready_for_review' ? diagnostics.find((report) => report.previewFile === record.previewFile && report.testPlanId === entry.testPlanId && report.checks) : undefined;
    const review = (await listReviews(projectRoot, entry.projectId)).find((review) => review.previewFile === record.previewFile);
    const browserRun = record.status === 'ready_for_review' && entry.testPlanId
      ? (await listBrowserRuns(projectRoot, entry.projectId)).find((item) => item.testPlanId === entry.testPlanId && item.previewFile === record.previewFile) : undefined;
    let browserStatus: 'not_run' | 'pending' | 'passed' | 'failed' | 'cancelled' | 'invalid' = 'not_run';
    if (browserRun) {
      const plan = (await listTestPlans(projectRoot, entry.projectId)).find((item) => item.id === entry.testPlanId);
      const parsed = testPlanSchema.safeParse(plan?.result?.output && { checks: plan.result.output.checks, limitations: plan.result.output.limitations });
      // Only read a generated preview path; record contents are not arbitrary file paths.
      const html = record.previewFile && /^v[1-3]\/dist\/index\.html$/.test(record.previewFile)
        ? await readFile(join(projectRoot, entry.projectId, record.previewFile), 'utf8').catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        }) : undefined;
      const matches = browserRun.projectId === entry.projectId && browserRun.source === 'server-browser'
        && plan?.status === 'ready' && plan.projectId === entry.projectId && plan.previewFile === record.previewFile
        && parsed.success && html !== undefined && browserRun.previewHash === contentHash(html)
        && browserRun.planHash === contentHash(JSON.stringify(parsed.data));
      browserStatus = !matches ? 'invalid' : ['queued', 'running'].includes(browserRun.status) ? 'pending'
        : browserRun.status === 'cancelled' ? 'cancelled' : browserRun.status === 'failed' && browserRun.finishedAt ? 'failed' : 'invalid';
      if (matches && parsed.success && browserRun.status === 'passed' && browserRun.finishedAt && browserRun.browserVersion
        && !browserRun.error && !browserRun.errors.length && !browserRun.blockedRequests.length && browserRun.screenshots.includes('final.png')
        && browserRun.checks.length === parsed.data.checks.length && browserRun.checks.every((check, index) =>
          check.name === parsed.data.checks[index].name && check.status === 'passed' && !check.error && check.actual === parsed.data.checks[index].expected)) browserStatus = 'passed';
    }
    return { ...entry, ...summarizeGeneration(record), interactionStatus: observation
      ? observation.loaded && !observation.errors.length && observation.checks!.every((check) => check.status === 'passed') ? 'client_checks_passed' : 'client_checks_failed'
      : 'not_run', diagnosticId: observation?.id || null, checksPassed: observation?.checks?.filter((check) => check.status === 'passed').length || 0, checksTotal: observation?.checks?.length || 0,
      browserStatus, browserRunId: browserRun?.id || null, browserChecksPassed: browserRun?.checks.filter((check) => check.status === 'passed').length || 0,
      browserChecksTotal: browserRun?.checks.length || 0, browserError: browserRun?.error || null,
      manualDecision: record.status !== 'ready_for_review' || (review?.decision === 'approved' && diagnostics.find((report) => report.previewFile === record.previewFile)?.id !== review.diagnosticId) ? null : review?.decision || null };
  }));
  const strategies = [...new Set(entries.map((entry) => entry.strategy))].map((strategy) => {
    const rows = entries.filter((entry) => entry.strategy === strategy);
    return { strategy, attempted: rows.length, buildPassed: rows.filter((entry) => entry.status === 'ready_for_review').length,
      clientChecksPassed: rows.filter((entry) => entry.interactionStatus === 'client_checks_passed').length,
      clientChecksFailed: rows.filter((entry) => entry.interactionStatus === 'client_checks_failed').length,
      interactionsNotRun: rows.filter((entry) => entry.interactionStatus === 'not_run').length,
      browserPassed: rows.filter((entry) => entry.browserStatus === 'passed').length,
      browserFailed: rows.filter((entry) => entry.browserStatus === 'failed').length,
      browserPending: rows.filter((entry) => entry.browserStatus === 'pending').length,
      browserCancelled: rows.filter((entry) => entry.browserStatus === 'cancelled').length,
      browserInvalid: rows.filter((entry) => entry.browserStatus === 'invalid').length,
      browserNotRun: rows.filter((entry) => entry.browserStatus === 'not_run').length,
      totalElapsedMs: rows.reduce((sum, entry) => sum + (entry.elapsedMs || 0), 0), reportedTokens: rows.reduce((sum, entry) => sum + entry.reportedTokens, 0),
      reportedUsageTasks: rows.reduce((sum, entry) => sum + entry.reportedUsageTasks, 0), agentTasks: rows.reduce((sum, entry) => sum + entry.agentTasks, 0), costUsd: null };
  });
  return { runId: run.id, generatedAt: new Date().toISOString(), sourceRevision: run.sourceRevision, sourceDirty: run.sourceDirty, casesSha256: run.casesSha256, runStatus: run.status, entries, strategies,
    limitations: ['Single run per case/strategy; no statistical superiority claim.', 'Client DOM checks are synthetic observations. Independent browser results are reported separately for the latest matching fixed plan and preview, with content hashes checked; neither proves complete requirements coverage or visual acceptance.', 'Browser failures include infrastructure errors; browserError retains their cause. Invalid evidence is never counted as passed. Repair versions are not substituted for original benchmark entries.', 'Reported token totals may omit failed calls without returned usage; cost is unknown. Null elapsed time means interrupted duration is unknown and omitted from totals.', 'Task ordering, model randomness and cache effects are not controlled.'] };
}
