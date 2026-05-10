import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordsWebStack } from './recordsWebStack.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // Keep retrying.
    }
    await delay(150);
  }
  throw new Error('Server did not become ready in time');
}

async function withTempStack<T>(
  fn: (ctx: { baseUrl: string; stack: ReturnType<typeof createRecordsWebStack> }) => Promise<T>
): Promise<T> {
  const prevKimi = process.env.KIMI_API_KEY;
  process.env.KIMI_API_KEY = '';
  const dir = await mkdtemp(join(tmpdir(), 'maf-records-'));
  const port = 3217 + Math.floor(Math.random() * 200);
  const stack = createRecordsWebStack({
    ...process.env,
    NODE_ENV: 'development',
    RECORDS_API_PORT: String(port),
    RECORDS_ROOT_OVERRIDE: dir,
    ALLOW_UNAUTH_IN_DEV: 'false',
    RECORDS_API_KEY: 'integration-test-api-key',
    RUN_RATE_LIMIT_PER_MINUTE: '1',
    RUN_TIMEOUT_MS: '60000',
    MAX_RUN_CONCURRENCY: '2',
  });
  const server = createServer((req, res) => {
    void stack.handleRequest(req, res);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  try {
    await waitForServerReady(baseUrl, 10_000);
    return await fn({ baseUrl, stack });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await rm(dir, { recursive: true, force: true });
    if (prevKimi !== undefined) process.env.KIMI_API_KEY = prevKimi;
    else delete process.env.KIMI_API_KEY;
  }
}

test('server enforces auth and run rate limit', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const noAuthSessions = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(noAuthSessions.status, 401);

    const noAuth = await fetch(`${baseUrl}/api/export`);
    assert.equal(noAuth.status, 401);

    const withAuth = await fetch(`${baseUrl}/api/export`, {
      headers: { 'X-API-Key': 'integration-test-api-key' },
    });
    assert.equal(withAuth.status, 200);

    const firstRun = await fetch(`${baseUrl}/api/run/unknown-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({ id: 'rl-test-1', description: 'integration test' }),
    });
    assert.equal(firstRun.status, 400);

    const secondRun = await fetch(`${baseUrl}/api/run/unknown-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({ id: 'rl-test-2', description: 'integration test' }),
    });
    assert.equal(secondRun.status, 429);
  });
});

test('server exposes vote mode and runtime metrics', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const voteRes = await fetch(`${baseUrl}/api/run/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({
        id: 'vote-test-1',
        description: 'Should we prioritize reliability?',
        agentIds: ['researcher', 'writer', 'reviewer'],
      }),
    });
    assert.equal(voteRes.status, 200);
    const votePayload = await voteRes.json();
    assert.equal(votePayload.mode, 'vote');
    assert.ok(votePayload.final?.winner?.agentId);

    const metricsRes = await fetch(`${baseUrl}/api/runtime/metrics`, {
      headers: { 'X-API-Key': 'integration-test-api-key' },
    });
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.ok(typeof metrics.runtime?.totalTracked === 'number');
  });
});

test('readiness includes runtime snapshot', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/health/readiness`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(typeof body.runtime?.queued === 'number');
    assert.ok(typeof body.runtime?.running === 'number');
  });
});

test('POST run with stream=1 returns SSE done', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/run/pipeline?stream=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({ id: 'sse-1', description: 'stream test' }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('event: meta'));
    assert.ok(text.includes('event: done'));
    assert.ok(text.includes('"mode":"pipeline"'));
  });
});

test('GET /api/runtime/jobs/:jobId returns job record', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const runRes = await fetch(`${baseUrl}/api/run/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({ id: 'job-get-1', description: 'job get test' }),
    });
    assert.equal(runRes.status, 200);
    const body = await runRes.json();
    const jobId = body.artifacts?.runtime?.jobId as string | undefined;
    assert.ok(jobId);
    const getRes = await fetch(`${baseUrl}/api/runtime/jobs/${encodeURIComponent(jobId)}`, {
      headers: { 'X-API-Key': 'integration-test-api-key' },
    });
    assert.equal(getRes.status, 200);
    const j = await getRes.json();
    assert.equal(j.job.jobId, jobId);
    assert.equal(j.job.status, 'succeeded');
    assert.equal(j.job.createdAt, j.job.queuedAt);
  });
});

test('POST async=1 returns 202 and runResult appears on GET job', async () => {
  await withTempStack(async ({ baseUrl }) => {
    const accept = await fetch(`${baseUrl}/api/run/pipeline?async=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'integration-test-api-key',
      },
      body: JSON.stringify({ id: 'async-1', description: 'async job' }),
    });
    assert.equal(accept.status, 202);
    const acc = await accept.json();
    const jobId = acc.jobId as string;
    assert.ok(jobId);
    const deadline = Date.now() + 15_000;
    let job: { status?: string; runResult?: unknown };
    do {
      await delay(80);
      const g = await fetch(`${baseUrl}/api/runtime/jobs/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': 'integration-test-api-key' },
      });
      assert.equal(g.status, 200);
      const payload = await g.json();
      job = payload.job;
      if (job.status === 'succeeded' && job.runResult) break;
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(`job ended badly: ${job.status}`);
      }
    } while (Date.now() < deadline);
    assert.ok(job!.runResult);
    assert.equal((job!.runResult as { mode?: string }).mode, 'pipeline');
  });
});

test('GET /api/export?sessionId= writes scoped snapshot', async () => {
  await withTempStack(async ({ baseUrl, stack }) => {
    const sid = 'sess-export-1';
    const dir = join(stack.recordsRoot, sid);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'session.json'),
      JSON.stringify({
        startedAt: '2026-05-01T12:00:00.000Z',
        status: 'success',
        task: { description: 'scoped export test' },
        finalDraft: { wordCount: 7 },
      }),
      'utf-8'
    );
    const res = await fetch(`${baseUrl}/api/export?sessionId=${encodeURIComponent(sid)}`, {
      headers: { 'X-API-Key': 'integration-test-api-key' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.scoped, true);
    const raw = await readFile(body.file as string, 'utf-8');
    const parsed = JSON.parse(raw) as { sessions: Array<{ sessionId: string }> };
    assert.equal(parsed.sessions.length, 1);
    assert.equal(parsed.sessions[0].sessionId, sid);
  });
});
