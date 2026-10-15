/**
 * Combines several benchmark runs (repetitions of the same cases) into one comparison of strategies.
 * Reads saved records only — no model calls, no browser.
 *
 *   npx tsx scripts/report-benchmark-series.ts <out.json> <run-id> [...more run ids]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectBenchmarkReport, type BenchmarkRun } from '../src/studio/benchmark.js';
import { validateProjectId } from '../src/studio/softwareStudio.js';

const [out, ...runIds] = process.argv.slice(2);
if (!out || !runIds.length) throw new Error('Usage: report-benchmark-series.ts <out.json> <run-id> [...]');
const reports = [];
for (const id of runIds) {
  validateProjectId(id);
  const run: BenchmarkRun = JSON.parse(await readFile(resolve('records/studio-benchmarks', id, 'run.json'), 'utf8'));
  reports.push(await collectBenchmarkReport(run, resolve('records/software-studio')));
}
const entries = reports.flatMap((report) => report.entries.map((entry) => ({ ...entry, runId: report.runId })));
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : null; };
const summarize = (rows: typeof entries) => {
  const built = rows.filter((entry) => entry.status === 'ready_for_review');
  const checked = rows.filter((entry) => entry.browserChecksTotal > 0);
  return {
    attempted: rows.length,
    built: built.length,
    builtFirstAttempt: built.filter((entry) => entry.buildAttempts === 1).length,
    browserPassed: rows.filter((entry) => entry.browserStatus === 'passed').length,
    browserFailed: rows.filter((entry) => entry.browserStatus === 'failed').length,
    browserNotRunOrInvalid: rows.filter((entry) => !['passed', 'failed'].includes(entry.browserStatus)).length,
    checksPassed: checked.reduce((sum, entry) => sum + entry.browserChecksPassed, 0),
    checksTotal: checked.reduce((sum, entry) => sum + entry.browserChecksTotal, 0),
    meanBuildAttempts: mean(built.map((entry) => entry.buildAttempts)),
    medianElapsedSeconds: median(rows.flatMap((entry) => entry.elapsedMs == null ? [] : [entry.elapsedMs / 1000])),
    meanReportedTokens: mean(rows.map((entry) => entry.reportedTokens)),
  };
};
const strategies = [...new Set(entries.map((entry) => entry.strategy))];
const cases = [...new Set(entries.map((entry) => entry.caseId))];
const series = {
  generatedAt: new Date().toISOString(),
  runs: reports.map((report) => ({ runId: report.runId, sourceRevision: report.sourceRevision, sourceDirty: report.sourceDirty, casesSha256: report.casesSha256, runStatus: report.runStatus })),
  models: [...new Set(entries.flatMap((entry) => entry.models))],
  byStrategy: Object.fromEntries(strategies.map((strategy) => [strategy, summarize(entries.filter((entry) => entry.strategy === strategy))])),
  byCase: Object.fromEntries(cases.map((caseId) => [caseId, Object.fromEntries(strategies.map((strategy) => [strategy, summarize(entries.filter((entry) => entry.caseId === caseId && entry.strategy === strategy))]))])),
  entries: entries.map(({ runId, caseId, strategy, projectId, status, buildAttempts, elapsedMs, reportedTokens, browserStatus, browserChecksPassed, browserChecksTotal, browserError, error }) =>
    ({ runId, caseId, strategy, projectId, status, buildAttempts, elapsedMs, reportedTokens, browserStatus, browserChecksPassed, browserChecksTotal, browserError, error })),
  limitations: [...new Set(reports.flatMap((report) => report.limitations))].filter((item) => !item.startsWith('Single run per case/strategy')),
};
await writeFile(resolve(out), JSON.stringify(series, null, 2));
console.log(JSON.stringify({ out: resolve(out), byStrategy: series.byStrategy }, null, 2));
