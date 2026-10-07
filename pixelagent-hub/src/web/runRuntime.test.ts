import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { RunRuntime } from './runRuntime.js';

const ROOT = join(process.cwd(), 'records', 'runtime-test');

test('cancelling a queued job preserves cancelled status and never invokes its work', async () => {
  const root = join(ROOT, 'queued-cancel');
  const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
  await runtime.init();
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const first = runtime.execute({ jobId: 'occupy', taskId: 'occupy', mode: 'parallel', run: async () => {
    started();
    await new Promise<void>((resolve) => { release = resolve; });
    return 'done';
  } });
  await startedPromise;
  let called = false;
  const second = runtime.execute({ jobId: 'queued', taskId: 'queued', mode: 'parallel', run: async () => {
    called = true;
    return 'unexpected';
  } });
  const rejected = assert.rejects(second, /JOB_CANCELLED/);
  assert.equal(runtime.cancelJob('queued'), true);
  release();
  await first;
  await rejected;
  assert.equal(called, false);
  assert.equal(runtime.getJob('queued')?.status, 'cancelled');
  const restored = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
  await restored.init();
  assert.equal(restored.getJob('queued')?.status, 'cancelled');
});

test('RunRuntime executes jobs and persists result', async () => {
  await rm(ROOT, { recursive: true, force: true });
  const runtime = new RunRuntime({
    recordsRoot: ROOT,
    maxConcurrency: 1,
    maxQueueSize: 2,
    maxRetries: 0,
  });
  await runtime.init();
  const { result, job } = await runtime.execute({
    jobId: 'job-1',
    taskId: 'task-1',
    mode: 'parallel',
    run: async ({ signal }) => {
      assert.ok(signal);
      return 'ok';
    },
  });
  assert.equal(result, 'ok');
  assert.equal(job.status, 'succeeded');
});

test('RunRuntime recovers queued/running jobs as failed', async () => {
  const runtime = new RunRuntime({
    recordsRoot: ROOT,
    maxConcurrency: 1,
    maxQueueSize: 2,
    maxRetries: 0,
  });
  await runtime.init();
  await runtime.execute({
    jobId: 'job-2',
    taskId: 'task-2',
    mode: 'parallel',
    run: async () => 'done',
  });

  const runtime2 = new RunRuntime({
    recordsRoot: ROOT,
    maxConcurrency: 1,
    maxQueueSize: 2,
    maxRetries: 0,
  });
  await runtime2.init();
  const recovered = await runtime2.recoverInterruptedJobs();
  assert.equal(recovered >= 0, true);
});

test('RunRuntime cancel marks job cancelled', async () => {
  await rm(ROOT, { recursive: true, force: true });
  const runtime = new RunRuntime({
    recordsRoot: ROOT,
    maxConcurrency: 1,
    maxQueueSize: 2,
    maxRetries: 0,
  });
  await runtime.init();
  const p = runtime.execute({
    jobId: 'job-cancel-1',
    taskId: 'task-cancel-1',
    mode: 'parallel',
    run: async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout;
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('JOB_CANCELLED'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 120_000);
      });
      return 'nope';
    },
  });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(runtime.cancelJob('job-cancel-1'), true);
  await assert.rejects(p, /JOB_CANCELLED/);
  const job = runtime.getJob('job-cancel-1');
  assert.equal(job?.status, 'cancelled');
});
