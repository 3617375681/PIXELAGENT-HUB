import type { StudioRecord } from './softwareStudio.js';

export function summarizeGeneration(record: StudioRecord) {
  const tasks = [...(record.plan ? [record.plan] : []), ...record.rounds.map((round) => round.code)];
  const withUsage = tasks.filter((task) => Number.isFinite(task.output?.llmUsage?.total_tokens) && task.output.llmUsage.total_tokens >= 0);
  const started = Date.parse(record.startedAt);
  const finished = Date.parse(record.finishedAt || '');
  const interrupted = /Benchmark process interrupted|Generation was interrupted|Recovered after process restart/.test(record.error || '');
  return {
    status: record.status,
    elapsedMs: interrupted || !Number.isFinite(started) || !Number.isFinite(finished) || finished < started ? null : finished - started,
    buildAttempts: record.rounds.filter((round) => round.build).length,
    failedBuilds: record.rounds.filter((round) => round.build?.status === 'failed').length,
    agentTasks: tasks.length, reportedUsageTasks: withUsage.length, missingUsageTasks: tasks.length - withUsage.length,
    reportedTokens: withUsage.reduce((sum, task) => sum + task.output.llmUsage.total_tokens, 0),
    models: [...new Set(tasks.filter((task) => task.output?.llmProvider && task.output?.llmModel).map((task) => `${task.output.llmProvider}/${task.output.llmModel}`))] as string[],
    costUsd: null,
    ...(record.error ? { error: record.error } : {}),
  };
}
