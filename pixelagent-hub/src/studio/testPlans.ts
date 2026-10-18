import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TaskResult } from '../core/types.js';
import { writeJsonSnapshot } from './atomicJson.js';

export { browserCheckSchema, testPlanSchema } from './shared/schemas.js';
export type TestPlanRecord = { id: string; projectId: string; previewFile: string; jobId: string; status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'; startedAt: string; finishedAt?: string; result?: TaskResult; error?: string };

export async function saveTestPlan(root: string, plan: TestPlanRecord): Promise<void> {
  await writeJsonSnapshot(join(root, plan.projectId, 'test-plans', `${plan.id}.json`), plan);
}
export async function listTestPlans(root: string, projectId: string): Promise<TestPlanRecord[]> {
  const directory = join(root, projectId, 'test-plans');
  let entries: string[];
  try { entries = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const plans = await Promise.all(entries.filter((entry) => /^[a-f0-9-]{36}\.json$/.test(entry)).map(async (entry) => JSON.parse(await readFile(join(directory, entry), 'utf8')) as TestPlanRecord));
  return plans.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
