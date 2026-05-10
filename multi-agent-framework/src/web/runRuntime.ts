import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RunQueue } from '../core/RunQueue.js';
import { ModeRunResponse, RuntimeJobRecord } from '../core/types.js';

type RuntimeOptions = {
  recordsRoot: string;
  maxConcurrency: number;
  maxQueueSize: number;
  maxRetries: number;
};

export type RunExecutionContext = {
  signal: AbortSignal;
};

export type ExecuteParams<T> = {
  jobId: string;
  taskId: string;
  sessionId?: string;
  mode: string;
  run: (ctx: RunExecutionContext) => Promise<T>;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class RunRuntime {
  private readonly queue: RunQueue;
  private readonly jobsPath: string;
  private readonly maxRetries: number;
  private readonly jobs = new Map<string, RuntimeJobRecord>();
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(options: RuntimeOptions) {
    this.queue = new RunQueue(options.maxConcurrency, options.maxQueueSize);
    this.jobsPath = join(options.recordsRoot, 'runtime-jobs.json');
    this.maxRetries = Math.max(0, options.maxRetries);
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.jobsPath), { recursive: true });
    try {
      const raw = await readFile(this.jobsPath, 'utf-8');
      const items = JSON.parse(raw) as RuntimeJobRecord[];
      items.forEach((x) => this.jobs.set(x.jobId, x));
    } catch {
      await this.persist();
    }
  }

  async recoverInterruptedJobs(): Promise<number> {
    let recovered = 0;
    this.jobs.forEach((job) => {
      if (job.status === 'queued' || job.status === 'running') {
        recovered += 1;
        job.status = 'failed';
        job.finishedAt = new Date().toISOString();
        job.error = 'Recovered after process restart';
      }
    });
    if (recovered > 0) await this.persist();
    return recovered;
  }

  getSnapshot(): { queued: number; running: number; totalTracked: number } {
    return {
      queued: this.queue.getQueuedCount(),
      running: this.queue.getRunningCount(),
      totalTracked: this.jobs.size,
    };
  }

  listJobs(limit: number = 50): RuntimeJobRecord[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))
      .slice(0, limit);
  }

  getJob(jobId: string): RuntimeJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  /** Request cooperative cancellation for a queued or running job. */
  cancelJob(jobId: string): boolean {
    const ac = this.abortControllers.get(jobId);
    if (!ac) return false;
    ac.abort();
    return true;
  }

  isTaskActive(taskId: string): boolean {
    for (const job of this.jobs.values()) {
      if (job.taskId === taskId && (job.status === 'queued' || job.status === 'running')) return true;
    }
    return false;
  }

  isSessionActive(sessionId: string): boolean {
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId && (job.status === 'queued' || job.status === 'running')) return true;
    }
    return false;
  }

  private async runQueuedWork<T>(params: ExecuteParams<T>, ac: AbortController, queuedAtMs: number): Promise<T> {
    if (ac.signal.aborted) {
      throw new Error('JOB_CANCELLED');
    }
    const job = this.jobs.get(params.jobId)!;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.queueWaitMs = Date.now() - queuedAtMs;
    await this.persist();

    let attempt = 0;
    let lastError: unknown;
    const runStart = Date.now();
    while (attempt <= this.maxRetries) {
      attempt += 1;
      job.attempts = attempt;
      await this.persist();
      try {
        if (ac.signal.aborted) {
          throw new Error('JOB_CANCELLED');
        }
        const payload = await params.run({ signal: ac.signal });
        job.status = 'succeeded';
        job.finishedAt = new Date().toISOString();
        job.runDurationMs = Date.now() - runStart;
        await this.persist();
        return payload;
      } catch (err) {
        lastError = err;
        const msg = String(err);
        if (msg.includes('JOB_CANCELLED') || ac.signal.aborted) {
          job.status = 'cancelled';
          job.finishedAt = new Date().toISOString();
          job.runDurationMs = Date.now() - runStart;
          job.error = 'Cancelled';
          await this.persist();
          throw err;
        }
        if (attempt > this.maxRetries) break;
      }
    }

    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    job.runDurationMs = Date.now() - runStart;
    job.error = String(lastError);
    await this.persist();
    throw lastError;
  }

  async execute<T>(params: ExecuteParams<T>): Promise<{ result: T; job: RuntimeJobRecord }> {
    const queuedAtMs = Date.now();
    const ac = new AbortController();
    this.abortControllers.set(params.jobId, ac);

    const baseJob: RuntimeJobRecord = {
      jobId: params.jobId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      mode: params.mode,
      status: 'queued',
      queuedAt: new Date(queuedAtMs).toISOString(),
      attempts: 0,
      maxRetries: this.maxRetries,
    };
    this.jobs.set(baseJob.jobId, baseJob);
    await this.persist();

    try {
      const result = await this.queue.push(() => this.runQueuedWork(params, ac, queuedAtMs));
      return { result, job: this.jobs.get(baseJob.jobId)! };
    } finally {
      this.abortControllers.delete(params.jobId);
    }
  }

  /**
   * Enqueue a run and return immediately. When the job succeeds, `runResult` is written on the job record.
   * Errors are reflected on the job (`failed` / `cancelled`) the same as {@link execute}.
   */
  submitBackground(params: ExecuteParams<ModeRunResponse>): string {
    const queuedAtMs = Date.now();
    const ac = new AbortController();
    this.abortControllers.set(params.jobId, ac);

    const baseJob: RuntimeJobRecord = {
      jobId: params.jobId,
      taskId: params.taskId,
      sessionId: params.sessionId,
      mode: params.mode,
      status: 'queued',
      queuedAt: new Date(queuedAtMs).toISOString(),
      attempts: 0,
      maxRetries: this.maxRetries,
    };
    this.jobs.set(baseJob.jobId, baseJob);

    void (async () => {
      try {
        await this.persist();
      } catch (err) {
        console.error('[RunRuntime] persist failed on submitBackground:', err);
      }
      try {
        const result = await this.queue.push(() => this.runQueuedWork(params, ac, queuedAtMs));
        const job = this.jobs.get(params.jobId);
        if (job?.status === 'succeeded') {
          job.runResult = cloneJson(result);
          await this.persist();
        }
      } catch (err) {
        const j = this.jobs.get(params.jobId);
        if (j?.status === 'queued') {
          j.status = 'failed';
          j.finishedAt = new Date().toISOString();
          j.error = String(err);
          await this.persist();
        }
      } finally {
        this.abortControllers.delete(params.jobId);
      }
    })();

    return params.jobId;
  }

  private async persist(): Promise<void> {
    const items = Array.from(this.jobs.values()).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
    await writeFile(this.jobsPath, JSON.stringify(items, null, 2), 'utf-8');
  }
}
