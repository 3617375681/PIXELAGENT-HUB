import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGeneration } from './generationMetrics.js';
import type { StudioRecord } from './softwareStudio.js';

const record: StudioRecord = { projectId: 'fixture', description: 'fixture', status: 'ready_for_review', startedAt: '2026-10-08T00:00:00Z', finishedAt: '2026-10-08T00:00:02Z', plan: { taskId: 'plan', agentId: 'manager', status: 'success', output: { llmProvider: 'mock', llmModel: 'fixture', llmUsage: { total_tokens: 100 } } }, rounds: [
  { round: 1, code: { taskId: 'first', agentId: 'coder', status: 'failed', output: null }, build: { status: 'failed', errors: ['syntax'], checkedFiles: [], browserVerified: false } as any },
  { round: 2, code: { taskId: 'second', agentId: 'coder', status: 'success', output: { llmProvider: 'mock', llmModel: 'fixture', llmUsage: { total_tokens: 50 } } }, build: { status: 'passed', errors: [], checkedFiles: [], browserVerified: false } as any },
] };

test('generation metrics preserve partial usage, every build attempt and unknown cost', () => {
  const metrics = summarizeGeneration(record);
  assert.equal(metrics.elapsedMs, 2000);
  assert.equal(metrics.agentTasks, 3);
  assert.equal(metrics.reportedUsageTasks, 2);
  assert.equal(metrics.missingUsageTasks, 1);
  assert.equal(metrics.reportedTokens, 150);
  assert.equal(metrics.buildAttempts, 2);
  assert.equal(metrics.failedBuilds, 1);
  assert.equal(metrics.costUsd, null);
  assert.deepEqual(metrics.models, ['mock/fixture']);
});

test('missing completion, invalid dates and recovered interruption have no invented duration', () => {
  for (const changed of [{ finishedAt: undefined }, { startedAt: 'invalid' }, { finishedAt: '2026-10-07T00:00:00Z' }, { error: 'Recovered after process restart' }, { error: 'Generation was interrupted; create a new project to retry' }, { error: 'Benchmark process interrupted; end time unknown' }]) {
    assert.equal(summarizeGeneration({ ...record, ...changed }).elapsedMs, null);
  }
  const failed = summarizeGeneration({ ...record, plan: undefined, rounds: [{ round: 1, code: { taskId: 'failed', agentId: 'coder', status: 'failed', output: null } }], status: 'failed' });
  assert.equal(failed.reportedTokens, 0);
  assert.equal(failed.reportedUsageTasks, 0);
  assert.equal(failed.missingUsageTasks, 1);
});
