import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioRequest, StudioRequestConflict } from './studioRequests.js';

test('durable reservations survive new callers and never redo interrupted paid work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-requests-'));
  let calls = 0;
  try {
    const accepted = await createStudioRequest(root, 'durable-request', 'Counter', async (projectId) => {
      calls++;
      await mkdir(join(root, projectId));
      await writeFile(join(root, projectId, 'project.json'), '{}');
      return { projectId, jobId: `studio-${projectId}`, projectUrl: `/api/studio/projects/${projectId}` };
    });
    assert.deepEqual(await createStudioRequest(root, 'durable-request', 'Counter', async () => { throw new Error('Must not rerun'); }), accepted);
    assert.equal(calls, 1);
    await assert.rejects(createStudioRequest(root, 'interrupted-request', 'Counter', async () => { throw new Error('Simulated interruption'); }), /Simulated interruption/);
    await assert.rejects(createStudioRequest(root, 'interrupted-request', 'Counter', async () => { calls++; }), StudioRequestConflict);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
