import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type Verdict = { name: string; status: 'passed' | 'failed'; actual: string; error?: string };
type Event = { type: string; data?: Record<string, unknown> };

export async function discoverCheckRecords(directories: string[], only = '', limit = Infinity): Promise<string[]> {
  const paths = new Set<string>();
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /-run\d+\.json$/.test(entry.name) && path.includes(only)) paths.add(path);
    }
  }
  for (const directory of directories) await walk(resolve(directory));
  return [...paths].sort().slice(0, limit);
}

/** Do not fall back to an earlier run when the final plan/run has no results. */
export function lastCheckVerdicts(events: Event[]): Verdict[] {
  const types = events.map((event) => event.type);
  const start = types.lastIndexOf('browser_run_started');
  const plan = types.lastIndexOf('test_plan_ready');
  if (start < 0 || plan > start) return [];
  const runId = events[start].data?.runId;
  if (typeof runId !== 'string') return [];
  return events.slice(start + 1).filter((event) => event.type === 'browser_check' && event.data?.runId === runId)
    .flatMap(({ data }) => typeof data?.name === 'string' && typeof data.passed === 'boolean'
      ? [{ name: data.name, status: data.passed ? 'passed' as const : 'failed' as const, actual: String(data.actual ?? '') }] : []);
}

export function compareVerdicts(recorded: Verdict[], replayed: Verdict[]) {
  const before = new Map(recorded.map((result) => [result.name, result]));
  const after = new Map(replayed.map((result) => [result.name, result]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((name) => {
    const recorded = before.get(name);
    const replayed = after.get(name);
    return recorded?.status === replayed?.status ? [] : [{ name, recorded: recorded ?? null, replayed: replayed ?? null }];
  });
}

export const verdictScore = (results: Verdict[]) => `${results.filter((result) => result.status === 'passed').length}/${results.length}`;
