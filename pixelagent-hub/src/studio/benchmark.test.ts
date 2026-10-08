import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { listTestPlans } from './testPlans.js';
import { readBenchmarkCases, runStudioBenchmark, summarizeGeneration, benchmarkCasesSchema, collectBenchmarkReport } from './benchmark.js';
import { saveDiagnostic } from './diagnostics.js';
import { saveReview } from './reviews.js';

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

test('benchmark counts failed build attempts and missing usage without inventing cost or model calls', () => {
  const result = summarizeGeneration({ projectId: 'fixture', status: 'failed', description: 'fixture', startedAt: '2026-10-08T00:00:00Z', finishedAt: '2026-10-08T00:00:01Z', rounds: [{ round: 1, code: { taskId: 'fixture', agentId: 'coder', status: 'failed', output: null }, build: { status: 'failed', errors: ['syntax'], checkedFiles: [], browserVerified: false } as any }], error: 'Fixture error' });
  assert.equal(result.elapsedMs, 1000); assert.equal(result.failedBuilds, 1);
  assert.equal(result.agentTasks, 1); assert.equal(result.reportedUsageTasks, 0); assert.equal(result.reportedTokens, 0);
  assert.deepEqual(result.models, []); assert.equal(result.error, 'Fixture error');
});
