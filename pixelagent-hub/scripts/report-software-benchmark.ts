import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateProjectId } from '../src/studio/softwareStudio.js';
import { collectBenchmarkReport, type BenchmarkRun } from '../src/studio/benchmark.js';

async function main() {
  const id = process.argv[2] || '';
  validateProjectId(id);
  const directory = resolve('records/studio-benchmarks', id);
  const run: BenchmarkRun = JSON.parse(await readFile(resolve(directory, 'run.json'), 'utf8'));
  if (run.id !== id) throw new Error('Benchmark run ID mismatch');
  const report = await collectBenchmarkReport(run, resolve('records/software-studio'));
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: resolve(directory, 'report.json'), strategies: report.strategies, limitations: report.limitations }, null, 2));
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
