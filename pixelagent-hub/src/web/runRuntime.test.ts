import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
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
  const root = await mkdtemp(join(tmpdir(), 'runtime-recovery-'));
  try {
    const records = ['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((status) => ({ jobId: status, taskId: status, mode: 'studio', status, queuedAt: '2026-10-08T00:00:00.000Z', attempts: 1, maxRetries: 0, ...(status === 'succeeded' ? { runResult: { final: { projectId: 'preserved' } } } : {}) }));
    await writeFile(join(root, 'runtime-jobs.json'), JSON.stringify(records));
    const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
    await runtime.init();
    assert.equal(await runtime.recoverInterruptedJobs(), 2);
    for (const id of ['queued', 'running']) {
      assert.equal(runtime.getJob(id)?.status, 'failed');
      assert.equal(runtime.getJob(id)?.error, 'Recovered after process restart');
    }
    for (const record of records.slice(2)) assert.deepEqual(runtime.getJob(record.jobId), record);
    const restarted = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
    await restarted.init();
    assert.equal(await restarted.recoverInterruptedJobs(), 0);
    assert.deepEqual(restarted.listJobs(), runtime.listJobs());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid runtime history fails initialization without overwriting evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-corrupt-'));
  try {
    for (const raw of ['{truncated', '{}', '[null]', '[{"jobId":"x","queuedAt":"invalid","status":"running"}]']) {
      const file = join(root, 'runtime-jobs.json');
      await writeFile(file, raw);
      const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
      await assert.rejects(runtime.init());
      assert.equal(await readFile(file, 'utf8'), raw);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('concurrent job completion persists every terminal result across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-concurrent-'));
  try {
    const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 8, maxQueueSize: 30, maxRetries: 0 });
    await runtime.init();
    await Promise.all(Array.from({ length: 24 }, (_, index) => runtime.execute({ jobId: `job-${index}`, taskId: `task-${index}`, mode: 'parallel', run: async () => index })));
    const restarted = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
    await restarted.init();
    assert.equal(restarted.listJobs().length, 24);
    assert.equal(restarted.listJobs().every((job) => job.status === 'succeeded'), true);
    assert.equal(await restarted.recoverInterruptedJobs(), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('queue rejection persists failure and releases task admission without invoking work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-capacity-'));
  const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 1, maxRetries: 0 });
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let pending: Promise<unknown>[] = [];
  try {
    await runtime.init();
    const first = runtime.execute({ jobId: 'occupy', taskId: 'occupy', mode: 'studio', run: async () => { started(); await held; return 'done'; } });
    pending.push(first);
    await began;
    const second = runtime.execute({ jobId: 'waiting', taskId: 'waiting', mode: 'studio', run: async () => 'done' });
    pending.push(second);
    const deadline = Date.now() + 3000;
    while (runtime.getSnapshot().queued !== 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(runtime.getSnapshot().queued, 1);
    let called = false;
    await assert.rejects(runtime.execute({ jobId: 'overflow', taskId: 'overflow', mode: 'studio', run: async () => { called = true; return 'unexpected'; } }), /QUEUE_FULL_limit_1/);
    assert.equal(called, false);
    assert.equal(runtime.getJob('overflow')?.status, 'failed');
    assert.equal(runtime.getJob('overflow')?.attempts, 0);
    assert.match(runtime.getJob('overflow')?.error || '', /QUEUE_FULL/);
    assert.equal(runtime.isTaskActive('overflow'), false);
    assert.equal(runtime.cancelJob('overflow'), false);
    release(); await Promise.all(pending);
    const restarted = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 1, maxRetries: 0 });
    await restarted.init();
    assert.equal(restarted.getJob('overflow')?.status, 'failed');
    assert.equal(await restarted.recoverInterruptedJobs(), 0);
    await runtime.execute({ jobId: 'retry', taskId: 'overflow', mode: 'studio', run: async () => 'accepted' });
    assert.equal(runtime.getJob('retry')?.status, 'succeeded');
  } finally { release(); await Promise.allSettled(pending); await rm(root, { recursive: true, force: true }); }
});

test('a killed worker leaves a recoverable running record without executing work again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-killed-'));
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/web/runRuntime.ts')).href;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { RunRuntime } from ${JSON.stringify(moduleUrl)};
    const runtime = new RunRuntime({ recordsRoot: ${JSON.stringify(root)}, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
    await runtime.init();
    await runtime.execute({ jobId: 'killed', taskId: 'killed', mode: 'studio', run: async () => {
      console.log('WORK_STARTED');
      await new Promise((resolve) => setTimeout(resolve, 60000));
      return 'unexpected completion';
    } });
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker did not start')), 10000);
      let output = '';
      let errors = '';
      child.stderr.on('data', (data) => { errors += data.toString(); });
      child.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('WORK_STARTED')) { clearTimeout(timer); resolve(); }
      });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`Worker exited before work started: ${errors}`)); });
    });
    child.kill('SIGKILL');
    await exited;
    const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 2, maxRetries: 0 });
    await runtime.init();
    assert.equal(runtime.getJob('killed')?.status, 'running');
    assert.equal(await runtime.recoverInterruptedJobs(), 1);
    assert.equal(runtime.getJob('killed')?.status, 'failed');
    assert.equal(runtime.getJob('killed')?.attempts, 1);
    assert.equal(runtime.getSnapshot().running, 0);
    assert.equal(runtime.getJob('killed')?.runResult, undefined);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(root, { recursive: true, force: true });
  }
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
