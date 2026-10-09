import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { listTestPlans } from './testPlans.js';
import { readBenchmarkCases, runStudioBenchmark, summarizeGeneration, benchmarkCasesSchema, collectBenchmarkReport } from './benchmark.js';
import { saveDiagnostic } from './diagnostics.js';
import { saveReview } from './reviews.js';
import { contentHash, executeBrowserRun, saveBrowserRun, type BrowserRun } from './browserRuns.js';

class BenchmarkFixture extends MockProvider {
  managerCalls = 0;
  async askWithUsage(system: string, user: string, temperature?: number) {
    if (system.includes('project manager')) { this.managerCalls++; return super.askWithUsage(system, user, temperature); }
    return { content: JSON.stringify({ language: 'javascript', files: [{ path: 'index.html', content: '<output id="count">0</output>', description: 'fixture' }], dependencies: [], explanation: 'test only' }), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, provider: 'mock', model: 'fixture' };
  }
}

test('benchmark compares identical builds, skips Manager only in baseline and persists fixed plans without QA claims', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-benchmark-'));
  try {
    const cases = await readBenchmarkCases(resolve('config/studio-benchmark.json'));
    assert.equal(cases.length, 5);
    const provider = new BenchmarkFixture();
    const run = await runStudioBenchmark({ cases: cases.slice(0, 1), strategies: ['manager-coder', 'coder-only'], root, projectRoot: join(root, 'projects'), sourceRevision: 'fixture', sourceDirty: false, timeoutMs: 3000, createOrchestrator: () => createOrchestrator('benchmark-fixture', provider) });
    assert.equal(run.status, 'completed'); assert.equal(run.entries.length, 2); assert.equal(provider.managerCalls, 1);
    const records = await Promise.all(run.entries.map(async (entry) => JSON.parse(await readFile(join(root, 'projects', entry.projectId, 'project.json'), 'utf8'))));
    assert.equal(records[0].description, records[1].description);
    assert.equal(records[0].strategy, 'manager-coder'); assert.equal(records[1].strategy, 'coder-only');
    assert.equal(records[1].plan, undefined);
    assert.equal(run.entries[0].agentTasks, 2); assert.equal(run.entries[1].agentTasks, 1);
    for (const entry of run.entries) {
      assert.equal(entry.status, 'ready_for_review'); assert.equal(entry.buildAttempts, 1);
      assert.equal(entry.interactionStatus, 'not_run'); assert.equal(entry.costUsd, null);
      assert.equal(entry.reportedUsageTasks, entry.agentTasks);
      const [plan] = await listTestPlans(join(root, 'projects'), entry.projectId);
      assert.equal(plan.id, entry.testPlanId); assert.deepEqual(plan.result?.output.checks, cases[0].checks);
      assert.equal(plan.result?.output.llmProvider, 'benchmark');
    }
    assert.deepEqual(JSON.parse(await readFile(join(root, run.id, 'run.json'), 'utf8')), run);
    const [first, second] = run.entries;
    const clean = await saveDiagnostic(join(root, 'projects'), first.projectId, { previewFile: 'v1/dist/index.html', loaded: true, errors: [], testPlanId: first.testPlanId, checks: cases[0].checks.map((check) => ({ name: check.name, status: 'passed', actual: check.expected })) });
    await saveReview(join(root, 'projects'), first.projectId, { previewFile: clean.previewFile, diagnosticId: clean.id, decision: 'approved', operator: 'fixture', note: 'Test only', manuallyReviewed: true });
    let report = await collectBenchmarkReport(run, join(root, 'projects'));
    assert.equal(report.entries[0].interactionStatus, 'client_checks_passed'); assert.equal(report.entries[0].manualDecision, 'approved');
    assert.equal(report.entries[1].interactionStatus, 'not_run'); assert.equal(report.entries[1].manualDecision, null);
    assert.equal(report.entries[0].browserStatus, 'not_run'); assert.equal(report.strategies[0].browserNotRun, 1);
    await saveDiagnostic(join(root, 'projects'), first.projectId, { previewFile: 'v1/dist/index.html', loaded: true, errors: ['runtime-regression'], testPlanId: first.testPlanId, checks: cases[0].checks.map((check) => ({ name: check.name, status: 'failed', actual: '', error: 'runtime-regression' })) });
    // A report for a different plan must not satisfy the fixed benchmark checks.
    await saveDiagnostic(join(root, 'projects'), second.projectId, { previewFile: 'v1/dist/index.html', loaded: true, errors: [], testPlanId: clean.id, checks: [{ name: 'Other plan', status: 'passed', actual: '' }] });
    report = await collectBenchmarkReport(run, join(root, 'projects'));
    assert.equal(report.entries[0].interactionStatus, 'client_checks_failed'); assert.equal(report.entries[0].manualDecision, null);
    assert.equal(report.entries[1].interactionStatus, 'not_run');
    assert.equal(report.strategies[0].clientChecksFailed, 1); assert.equal(report.strategies[1].interactionsNotRun, 1);
    assert.equal(run.casesSha256.length, 64);
    const cancelled = await runStudioBenchmark({ cases: cases.slice(0, 1), strategies: ['coder-only'], root, projectRoot: join(root, 'projects'), sourceRevision: 'fixture', sourceDirty: false, timeoutMs: 3000, signal: AbortSignal.abort() });
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.entries.length, 0);
    assert.equal(benchmarkCasesSchema.safeParse([cases[0], cases[0]]).success, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('benchmark counts only current complete independent evidence and never hides a newer failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-benchmark-browser-'));
  try {
    const projectRoot = join(root, 'projects');
    const cases = [{ id: 'fixture', title: 'Fixture', description: 'Initial output zero', checks: [{ name: 'Initial', actions: [], selector: '#count', expected: '0' }], limitations: ['Controlled fixture'] }];
    const run = await runStudioBenchmark({ cases, strategies: ['coder-only'], root, projectRoot, sourceRevision: 'fixture', sourceDirty: false, timeoutMs: 3000, createOrchestrator: () => createOrchestrator('fixture', new BenchmarkFixture()) });
    const entry = run.entries[0];
    const previewFile = 'v1/dist/index.html';
    const path = join(projectRoot, entry.projectId, previewFile);
    const html = await readFile(path, 'utf8');
    const valid: BrowserRun = { id: randomUUID(), projectId: entry.projectId, testPlanId: entry.testPlanId!, previewFile, previewHash: contentHash(html), planHash: contentHash(JSON.stringify({ checks: cases[0].checks, limitations: cases[0].limitations })), jobId: 'fixture', source: 'server-browser', status: 'passed', startedAt: '2026-10-09T00:00:00Z', finishedAt: '2026-10-09T00:00:01Z', browserVersion: 'fixture', viewport: { width: 1280, height: 720 }, checks: [{ name: 'Initial', status: 'passed', actual: '0' }], errors: [], blockedRequests: [], screenshots: ['initial.png', 'final.png'] };
    await saveBrowserRun(projectRoot, valid);
    let report = await collectBenchmarkReport(run, projectRoot);
    assert.equal(report.entries[0].browserStatus, 'passed'); assert.equal(report.strategies[0].browserPassed, 1);
    assert.equal(report.entries[0].interactionStatus, 'not_run'); assert.equal(report.entries[0].manualDecision, null);
    for (const change of [
      { previewHash: 'stale' }, { planHash: 'stale' }, { projectId: randomUUID() }, { checks: [] },
      { checks: [{ name: 'Initial', status: 'passed' as const, actual: '2' }] },
      { errors: ['runtime failure'] }, { blockedRequests: ['https://example.test'] }, { screenshots: [] }, { finishedAt: undefined },
      { status: 'failed' as const, finishedAt: undefined },
    ]) {
      // Keep the report in this project directory when testing its embedded identity.
      await writeFile(join(projectRoot, entry.projectId, 'browser-runs', `${valid.id}.json`), JSON.stringify({ ...valid, ...change }));
      report = await collectBenchmarkReport(run, projectRoot);
      assert.equal(report.entries[0].browserStatus, 'invalid', JSON.stringify(change)); assert.equal(report.strategies[0].browserPassed, 0);
    }
    await saveBrowserRun(projectRoot, valid);
    await writeFile(path, `${html}\n<!-- changed -->`);
    assert.equal((await collectBenchmarkReport(run, projectRoot)).entries[0].browserStatus, 'invalid');
    await rm(path);
    assert.equal((await collectBenchmarkReport(run, projectRoot)).entries[0].browserStatus, 'invalid');
    await writeFile(path, html);
    const newest = { ...valid, id: randomUUID(), startedAt: '2026-10-09T00:01:00Z', status: 'failed' as const, error: 'Browser launch failed', browserVersion: undefined, checks: [], screenshots: [] };
    await saveBrowserRun(projectRoot, newest);
    report = await collectBenchmarkReport(run, projectRoot);
    assert.equal(report.entries[0].browserStatus, 'failed'); assert.equal(report.entries[0].browserError, 'Browser launch failed');
    assert.equal(report.entries[0].browserRunId, newest.id); assert.equal(report.strategies[0].browserPassed, 0); assert.equal(report.strategies[0].browserFailed, 1);
    for (const [status, expected] of [['running', 'pending'], ['cancelled', 'cancelled']] as const) {
      await saveBrowserRun(projectRoot, { ...newest, status });
      assert.equal((await collectBenchmarkReport(run, projectRoot)).entries[0].browserStatus, expected);
    }
    await saveBrowserRun(projectRoot, { ...valid, id: randomUUID(), testPlanId: randomUUID(), startedAt: '2026-10-09T00:02:00Z' });
    assert.equal((await collectBenchmarkReport(run, projectRoot)).entries[0].browserRunId, newest.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('benchmark report reads an actual browser run for its fixed plan', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-benchmark-real-browser-'));
  try {
    const projectRoot = join(root, 'projects');
    const checks = [{ name: 'Initial', actions: [], selector: '#count', expected: '0' }];
    const limitations = ['Controlled source fixture; real browser execution'];
    const run = await runStudioBenchmark({ cases: [{ id: 'fixture', title: 'Fixture', description: 'Initial output zero', checks, limitations }], strategies: ['coder-only'], root, projectRoot, sourceRevision: 'fixture', sourceDirty: false, timeoutMs: 3000, createOrchestrator: () => createOrchestrator('fixture', new BenchmarkFixture()) });
    const entry = run.entries[0];
    const html = await readFile(join(projectRoot, entry.projectId, 'v1/dist/index.html'), 'utf8');
    const browserRun: BrowserRun = { id: randomUUID(), projectId: entry.projectId, testPlanId: entry.testPlanId!, previewFile: 'v1/dist/index.html', previewHash: contentHash(html), planHash: contentHash(JSON.stringify({ checks, limitations })), jobId: 'fixture', source: 'server-browser', status: 'queued', startedAt: new Date().toISOString(), viewport: { width: 1280, height: 720 }, checks: [], errors: [], blockedRequests: [], screenshots: [] };
    await executeBrowserRun({ root: projectRoot, run: browserRun, html, plan: { checks, limitations }, signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    const report = await collectBenchmarkReport(run, projectRoot);
    assert.equal(report.entries[0].browserStatus, 'passed', JSON.stringify(browserRun)); assert.equal(report.entries[0].browserChecksPassed, 1);
    assert.equal(report.entries[0].browserRunId, browserRun.id); assert.equal(report.strategies[0].browserPassed, 1);
    assert.equal(report.entries[0].interactionStatus, 'not_run'); assert.equal(report.entries[0].manualDecision, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('benchmark counts failed build attempts and missing usage without inventing cost or model calls', () => {
  const result = summarizeGeneration({ projectId: 'fixture', status: 'failed', description: 'fixture', startedAt: '2026-10-08T00:00:00Z', finishedAt: '2026-10-08T00:00:01Z', rounds: [{ round: 1, code: { taskId: 'fixture', agentId: 'coder', status: 'failed', output: null }, build: { status: 'failed', errors: ['syntax'], checkedFiles: [], browserVerified: false } as any }], error: 'Fixture error' });
  assert.equal(result.elapsedMs, 1000); assert.equal(result.failedBuilds, 1);
  assert.equal(result.agentTasks, 1); assert.equal(result.reportedUsageTasks, 0); assert.equal(result.reportedTokens, 0);
  assert.deepEqual(result.models, []); assert.equal(result.error, 'Fixture error');
});
