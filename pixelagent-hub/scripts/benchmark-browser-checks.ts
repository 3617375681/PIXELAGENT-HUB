/**
 * Runs each benchmark entry's saved fixed plan in the independent sandboxed browser, through the same
 * Studio API endpoint the dashboard uses (so reports carry the usual preview and plan hashes).
 * No model calls. Entries that already have a finished browser run for their plan are skipped.
 *
 *   npx tsx scripts/benchmark-browser-checks.ts <benchmark-run-id> [...more ids]
 *
 * Needs Playwright's Chromium (`npx playwright install chromium`) or STUDIO_BROWSER_EXECUTABLE.
 */
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RunRuntime } from '../src/web/runRuntime.js';
import { createStudioApi } from '../src/web/studioApi.js';
import { listBrowserRuns } from '../src/studio/browserRuns.js';
import { validateProjectId } from '../src/studio/softwareStudio.js';
import type { BenchmarkRun } from '../src/studio/benchmark.js';

const runIds = process.argv.slice(2);
if (!runIds.length) throw new Error('Usage: benchmark-browser-checks.ts <benchmark-run-id> [...]');
const projectRoot = resolve('records/software-studio');
const temp = await mkdtemp(join(tmpdir(), 'pixelagent-bench-browser-'));
const runtime = new RunRuntime({ recordsRoot: temp, maxConcurrency: 1, maxQueueSize: 100, maxRetries: 0 });
await runtime.init();
const api = createStudioApi({ root: projectRoot, runtime, timeoutMs: 480_000, browserChecks: { enabled: true, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined } });
const server = createServer((req, res) => { void (async () => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  await api.handle(req, res, new URL(req.url!, 'http://localhost').pathname, raw ? JSON.parse(raw) : undefined);
})(); });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

try {
  for (const runId of runIds) {
    validateProjectId(runId);
    const run: BenchmarkRun = JSON.parse(await readFile(resolve('records/studio-benchmarks', runId, 'run.json'), 'utf8'));
    for (const entry of run.entries) {
      if (entry.status !== 'ready_for_review' || !entry.testPlanId) { console.log(JSON.stringify({ runId, caseId: entry.caseId, strategy: entry.strategy, skipped: entry.status })); continue; }
      const existing = (await listBrowserRuns(projectRoot, entry.projectId)).find((item) => item.testPlanId === entry.testPlanId && ['passed', 'failed'].includes(item.status));
      if (existing) { console.log(JSON.stringify({ runId, caseId: entry.caseId, strategy: entry.strategy, existing: existing.status })); continue; }
      const response = await fetch(`${base}/api/studio/projects/${entry.projectId}/browser-runs`, { method: 'POST', body: JSON.stringify({ testPlanId: entry.testPlanId }) });
      if (response.status !== 202) throw new Error(`Browser run for ${entry.projectId} → ${response.status} ${await response.text()}`);
      const { runId: browserRunId, jobId } = await response.json();
      while (['queued', 'running'].includes(runtime.getJob(jobId)?.status || 'queued') || runtime.isJobActive(jobId)) await new Promise((done) => setTimeout(done, 100));
      const result = (await listBrowserRuns(projectRoot, entry.projectId)).find((item) => item.id === browserRunId)!;
      console.log(JSON.stringify({ runId, caseId: entry.caseId, strategy: entry.strategy, browser: result.status, passed: result.checks.filter((check) => check.status === 'passed').length, total: result.checks.length, error: result.error }));
    }
  }
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temp, { recursive: true, force: true });
}
