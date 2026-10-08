import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRecordsWebStack } from './recordsWebStack.js';

for (const scenario of ['reject_then_approve', 'always_reject', 'director_reject', 'invalid_json', 'unauthorized'] as const) {
  test(`company review flow: ${scenario}`, async (t) => {
    const keys = ['LLM_API_KEY', 'LLM_BASE_URL', 'AGENT_SENIOR_EDITOR_LLM_PROVIDER', 'AGENT_DIRECTOR_LLM_PROVIDER'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.LLM_API_KEY = 'fixture-key';
    process.env.LLM_BASE_URL = 'http://model.fixture/v1';
    process.env.AGENT_SENIOR_EDITOR_LLM_PROVIDER = 'openai';
    process.env.AGENT_DIRECTOR_LLM_PROVIDER = 'openai';
    let reviews = 0;
    let finalReviews = 0;
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith('http://model.fixture/')) return realFetch(input, init);
      if (scenario === 'unauthorized') return new Response('Unauthorized', { status: 401 });
      const body = JSON.parse(String(init?.body));
      const isEditor = body.messages.some((message: { content: string }) => message.content.includes('Review the following draft'));
      let content: string;
      if (isEditor) {
        reviews++;
        content = scenario === 'invalid_json' ? 'broken JSON' : JSON.stringify({
          verdict: scenario === 'always_reject' || (scenario === 'reject_then_approve' && reviews === 1) ? 'rejected' : 'approved',
          score: 80, issues: [], requiredChanges: ['Improve evidence'], suggestions: [],
        });
      } else {
        finalReviews++;
        content = JSON.stringify({ verdict: scenario === 'director_reject' ? 'rejected' : 'approved_for_delivery', qualityScore: 90, finalAssessment: 'Final review', mustFixBeforeDelivery: [] });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    try {
      await withTempStack(async ({ baseUrl }) => {
        const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'integration-test-api-key' };
        const response = await fetch(`${baseUrl}/api/run/company`, { method: 'POST', headers, body: JSON.stringify({ id: `company-${scenario}`, description: 'Review fixture' }) });
        if (scenario === 'invalid_json' || scenario === 'unauthorized') {
          assert.equal(response.status, 500);
          assert.equal(finalReviews, 0);
          const { sessions } = await (await fetch(`${baseUrl}/api/sessions`, { headers })).json();
          assert.equal(sessions[0].status, 'failed');
          const saved = await (await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessions[0].sessionId)}`, { headers })).json();
          assert.equal(saved.session.reviews.length, 1);
          assert.equal(saved.session.reviews[0].status, 'failed');
          assert.ok(saved.session.reviews[0].reasoning);
          return;
        }
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.status, scenario === 'reject_then_approve' ? 'success' : 'failed');
        assert.equal(reviews, scenario === 'always_reject' ? 5 : scenario === 'reject_then_approve' ? 2 : 1);
        assert.equal(finalReviews, scenario === 'always_reject' ? 0 : 1);
        if (scenario === 'reject_then_approve') assert.deepEqual(payload.raw.drafts[1].output.appliedRevisionNotes, ['Improve evidence']);
        if (scenario === 'always_reject') assert.match(payload.raw.finalReview.reasoning, /round limit/);
        const saved = await (await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(payload.artifacts.sessionId)}`, { headers })).json();
        assert.equal(saved.session.reviews.length, reviews);
        assert.equal(saved.session.status, payload.status);
      });
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}

for (const scenario of ['cancel', 'timeout'] as const) {
  test(`company HTTP ${scenario} aborts model fetch and stops subsequent stages`, async (t) => {
    const keys = ['LLM_API_KEY', 'LLM_BASE_URL', 'AGENT_MANAGER_LLM_PROVIDER'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.LLM_API_KEY = 'fixture-key';
    process.env.LLM_BASE_URL = 'http://model.fixture/v1';
    process.env.AGENT_MANAGER_LLM_PROVIDER = 'openai';
    let requestSignal: AbortSignal | undefined;
    let calls = 0;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!String(input).startsWith('http://model.fixture/')) return realFetch(input, init);
      calls++;
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true });
        started();
      });
    });
    try {
      await withTempStack(async ({ baseUrl }) => {
        const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'integration-test-api-key' };
        const response = await fetch(`${baseUrl}/api/run/company?async=1`, {
          method: 'POST', headers, body: JSON.stringify({ id: `http-${scenario}`, description: 'Cancellation fixture' }),
        });
        assert.equal(response.status, 202);
        const accepted = await response.json();
        assert.equal(typeof accepted.sessionId, 'string');
        await startedPromise;
        if (scenario === 'cancel') {
          const cancellation = await fetch(`${baseUrl}/api/runtime/jobs/${accepted.jobId}/cancel`, { method: 'POST', headers });
          assert.equal(cancellation.status, 200);
        }
        let job: any;
        const deadline = Date.now() + 3000;
        do {
          job = (await (await fetch(`${baseUrl}${accepted.jobUrl}`, { headers })).json()).job;
          if (job.status === 'failed' || job.status === 'cancelled') break;
          await delay(10);
        } while (Date.now() < deadline);
        assert.equal(job.status, scenario === 'cancel' ? 'cancelled' : 'failed');
        assert.equal(job.sessionId, accepted.sessionId);
        if (scenario === 'timeout') assert.match(job.error, /COMPANY_RUN_TIMEOUT/);
        assert.equal(requestSignal?.aborted, true);
        assert.equal(calls, 1);
        const { sessions } = await (await fetch(`${baseUrl}/api/sessions`, { headers })).json();
        const saved = await (await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessions[0].sessionId)}`, { headers })).json();
        assert.equal(saved.session.status, scenario === 'cancel' ? 'cancelled' : 'failed');
        assert.equal(saved.session.sessionId, job.sessionId);
        assert.equal(saved.session.drafts.length, 0);
        assert.equal(saved.session.reviews.length, 0);
        assert.equal(saved.session.research, undefined);
        assert.equal(saved.session.finalReview, undefined);
      }, scenario === 'timeout' ? { RUN_TIMEOUT_MS_COMPANY: '100' } : {});
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}

for (const mode of ['parallel', 'debate', 'vote', 'roundtable'] as const) {
  test(`${mode} never reports success when its agents have no model provider`, async () => {
    await withTempStack(async ({ baseUrl }) => {
      process.env.LLM_PROVIDER = 'kimi';
      const response = await fetch(`${baseUrl}/api/run/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'integration-test-api-key' },
        body: JSON.stringify({ id: `failed-${mode}`, description: 'Missing provider fixture', agentIds: ['writer'], rounds: 2 }),
      });
      const payload = await response.json();
      if (mode === 'parallel') {
        assert.equal(response.status, 200);
        assert.equal(payload.status, 'failed');
        assert.equal(payload.final[0].status, 'failed');
        assert.equal(payload.trace.converged, false);
      } else {
        assert.equal(response.status, 500);
        assert.equal(payload.status, undefined);
      }
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('explicit demo works without a real model and is marked synthetic', async () => {
  await withTempStack(async ({ baseUrl }) => {
    process.env.LLM_PROVIDER = 'kimi';
    const response = await fetch(`${baseUrl}/api/run/company`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'integration-test-api-key' },
      body: JSON.stringify({ id: 'explicit-demo', description: 'Demo only', demo: true }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'success');
    assert.equal(payload.raw.research.output.generatedBy, 'mock');
    assert.deepEqual(payload.raw.research.output.sources, []);
    assert.deepEqual(payload.artifacts.citations, []);
  });
});

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

test('studio endpoints use Records API authentication and creation rate limits', async () => {
  await withTempStack(async ({ baseUrl, stack }) => {
    assert.equal((await fetch(`${baseUrl}/api/studio/projects`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/studio/projects`, { method: 'POST', body: '{}' })).status, 401);
    const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'integration-test-api-key' };
    assert.equal((await fetch(`${baseUrl}/api/studio/projects`, { headers })).status, 200);
    const accepted = await fetch(`${baseUrl}/api/studio/projects`, { method: 'POST', headers, body: JSON.stringify({ description: 'API fixture' }) });
    assert.equal(accepted.status, 202);
    const { jobId } = await accepted.json();
    assert.equal((await fetch(`${baseUrl}/api/studio/projects`, { method: 'POST', headers, body: JSON.stringify({ description: 'Rate-limited fixture' }) })).status, 429);
    assert.equal((await fetch(`${baseUrl}/api/studio/projects/00000000-0000-0000-0000-000000000000/repair`, { method: 'POST', headers, body: '{}' })).status, 429);
    assert.equal((await fetch(`${baseUrl}/api/studio/projects/00000000-0000-0000-0000-000000000000/revise`, { method: 'POST', headers, body: '{}' })).status, 429);
    assert.equal((await fetch(`${baseUrl}/api/studio/projects/00000000-0000-0000-0000-000000000000/test-plans`, { method: 'POST', headers, body: '{}' })).status, 429);
    const deadline = Date.now() + 3000;
    while (stack.runtime.getJob(jobId)?.status === 'queued' || stack.runtime.getJob(jobId)?.status === 'running') {
      if (Date.now() > deadline) throw new Error('Studio fixture did not finish');
      await delay(10);
    }
  });
});

async function withTempStack<T>(
  fn: (ctx: { baseUrl: string; stack: ReturnType<typeof createRecordsWebStack> }) => Promise<T>,
  overrides: Record<string, string> = {}
): Promise<T> {
  const prevKimi = process.env.KIMI_API_KEY;
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'mock';
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
    ...overrides,
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
    if (prevProvider !== undefined) process.env.LLM_PROVIDER = prevProvider;
    else delete process.env.LLM_PROVIDER;
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
      if (job.status === 'succeeded') {
        assert.ok(job.runResult, 'succeeded must include the result immediately');
        break;
      }
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
