import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readBenchmarkCases, runStudioBenchmark } from '../src/studio/benchmark.js';

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--list', '--cases', '--strategy', '--timeout-ms']);
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new Error(`Unknown argument: ${args[index]}`);
    if (args[index] !== '--list' && (!args[++index] || args[index].startsWith('--'))) throw new Error('Option requires a value');
  }
  const value = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
  const all = await readBenchmarkCases(resolve('config/studio-benchmark.json'));
  if (args.includes('--list')) { console.log(JSON.stringify(all.map(({ id, title, checks }) => ({ id, title, checks: checks.length })), null, 2)); return; }
  const selected = value('--cases')?.split(',') || all.map((entry) => entry.id);
  if (selected.some((id) => !all.some((entry) => entry.id === id)) || new Set(selected).size !== selected.length) throw new Error('Select distinct case IDs from --list');
  const strategy = value('--strategy') || 'both';
  if (!['both', 'manager-coder', 'coder-only'].includes(strategy)) throw new Error('Strategy must be both, manager-coder or coder-only');
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('User cancelled benchmark'));
  process.once('SIGINT', cancel);
  try {
    const run = await runStudioBenchmark({ cases: all.filter((entry) => selected.includes(entry.id)), strategies: strategy === 'both' ? ['manager-coder', 'coder-only'] : [strategy as 'manager-coder' | 'coder-only'], root: resolve('records/studio-benchmarks'), projectRoot: resolve('records/software-studio'), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()), timeoutMs: Number(value('--timeout-ms') || 480000), signal: controller.signal, onEntry: (entry) => console.log(JSON.stringify(entry)) });
    console.log(JSON.stringify({ runId: run.id, status: run.status, report: resolve('records/studio-benchmarks', run.id, 'run.json') }, null, 2));
    if (run.status !== 'completed' || run.entries.some((entry) => entry.status !== 'ready_for_review')) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', cancel); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
