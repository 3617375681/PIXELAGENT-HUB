import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTestPlans, saveTestPlan, type TestPlanRecord } from './testPlans.js';
import { saveStudioRecord, type StudioRecord } from './softwareStudio.js';
import { readFile } from 'node:fs/promises';

test('overlapping plan writes preserve submission order and cancellation without Windows rename races', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-plan-writes-'));
  try {
    const plan: TestPlanRecord = { id: randomUUID(), projectId: randomUUID(), jobId: 'fixture', previewFile: 'v1/dist/index.html', startedAt: new Date().toISOString(), status: 'running' };
    const writes = Array.from({ length: 30 }, () => saveTestPlan(root, plan));
    plan.status = 'cancelled'; plan.error = 'Final cancellation';
    writes.push(saveTestPlan(root, plan));
    await Promise.all(writes);
    const [stored] = await listTestPlans(root, plan.projectId);
    assert.equal(stored.status, 'cancelled'); assert.equal(stored.error, 'Final cancellation');
    assert.deepEqual(await readdir(join(root, plan.projectId, 'test-plans')), [`${plan.id}.json`]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('overlapping project progress and cancellation writes preserve the final cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-project-writes-'));
  try {
    const record: StudioRecord = { projectId: randomUUID(), description: 'write fixture', startedAt: new Date().toISOString(), status: 'running', rounds: [] };
    const writes = Array.from({ length: 30 }, () => saveStudioRecord(root, record));
    record.status = 'cancelled'; record.error = 'Final cancellation';
    writes.push(saveStudioRecord(root, record));
    await Promise.all(writes);
    const stored = JSON.parse(await readFile(join(root, record.projectId, 'project.json'), 'utf8'));
    assert.equal(stored.status, 'cancelled'); assert.equal(stored.error, 'Final cancellation');
    assert.deepEqual(await readdir(join(root, record.projectId)), ['project.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
