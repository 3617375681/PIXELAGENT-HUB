import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { TaskResult } from '../core/types.js';
import { writeJsonSnapshot } from './atomicJson.js';

const selector = z.string().min(1).max(160);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector }).strict(),
  z.object({ type: z.literal('input'), selector, value: z.string().max(300) }).strict(),
  z.object({ type: z.literal('key'), selector, key: z.string().min(1).max(32) }).strict(),
]);
export const browserCheckSchema = z.object({ name: z.string().min(1).max(120), actions: z.array(action).max(8), selector, expected: z.string().max(300) }).strict();
export const testPlanSchema = z.object({ checks: z.array(browserCheckSchema).min(1).max(10), limitations: z.array(z.string().max(300)).max(10) }).strict().refine((plan) => new Set(plan.checks.map((check) => check.name)).size === plan.checks.length, 'Check names must be unique');
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
