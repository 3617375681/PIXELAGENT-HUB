import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { saveStudioRecord } from '../studio/softwareStudio.js';
import { RunRuntime } from './runRuntime.js';
import { createStudioApi } from './studioApi.js';

class StudioFixture extends MockProvider {
  async askWithUsage(system: string, user: string, temperature?: number, signal?: AbortSignal) {
    if (system.includes('project manager')) return super.askWithUsage(system, user, temperature);
    return { content: JSON.stringify({ language: 'javascript', files: [
      { path: 'index.html', content: '<html><body><button id="increment">Add</button><output>0</output><script src="app.js"></script></body></html>', description: 'Counter UI' },
      { path: 'app.js', content: 'document.querySelector("#increment").addEventListener("click",()=>document.querySelector("output").textContent++);', description: 'Counter behavior' },
    ], explanation: 'Fixture', dependencies: [] }), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'fixture', provider: 'mock' as const };
  }
}

async function withApi(work: (base: string, runtime: RunRuntime, root: string) => Promise<void>, provider = new StudioFixture(), timeoutMs = 5000) {
  const root = await mkdtemp(join(tmpdir(), 'studio-api-'));
  const runtime = new RunRuntime({ recordsRoot: join(root, 'runtime'), maxConcurrency: 1, maxQueueSize: 4, maxRetries: 2 });
  await runtime.init();
  const api = createStudioApi({ root: join(root, 'projects'), runtime, timeoutMs, createOrchestrator: () => createOrchestrator('studio-fixture', provider) });
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    await api.handle(req, res, new URL(req.url!, 'http://localhost').pathname, raw ? JSON.parse(raw) : undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try { await work(base, runtime, join(root, 'projects')); }
  finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForJob(runtime: RunRuntime, jobId: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const job = runtime.getJob(jobId)!;
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    await delay(10);
  }
  throw new Error('Studio test job did not finish');
}

test('studio HTTP creates, persists, lists, previews and exports a real build', async () => withApi(async (base, runtime, root) => {
  const response = await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Counter' }) });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  const job = await waitForJob(runtime, accepted.jobId);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.maxRetries, 0);
  const project = (await (await fetch(`${base}${accepted.projectUrl}`)).json()).project;
  assert.equal(project.status, 'ready_for_review');
  assert.equal(project.phase, 'ready_for_review');
  assert.equal(project.rounds[0].build.browserVerified, false);
  assert.equal(JSON.parse(await readFile(join(root, accepted.projectId, 'project.json'), 'utf-8')).jobId, job.jobId);
  const preview = await fetch(`${base}${accepted.projectUrl}/preview`);
  assert.match(preview.headers.get('content-type')!, /application\/json/);
  assert.match((await preview.json()).html, /Content-Security-Policy/);
  const archive = await fetch(`${base}${accepted.projectUrl}/archive`);
  assert.equal(archive.headers.get('content-type'), 'application/zip');
  assert.ok(unzipSync(new Uint8Array(await archive.arrayBuffer()))['source/app.js']);
  const list = await (await fetch(`${base}/api/studio/projects`)).json();
  assert.equal(list.projects[0].projectId, project.projectId);
  assert.equal(list.projects[0].rounds, undefined);
}));

test('studio validates input and never reads arbitrary filesystem paths', async () => withApi(async (base) => {
  for (const description of ['', 5, 'x'.repeat(4001)]) {
    assert.equal((await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description }) })).status, 400);
  }
  assert.equal((await fetch(`${base}/api/studio/projects/not-a-uuid`)).status, 400);
  assert.equal((await fetch(`${base}/api/studio/projects/${randomUUID()}`)).status, 404);
}));

test('orphaned project is restored as failed and cannot advertise a preview', async () => withApi(async (base, _runtime, root) => {
  const projectId = randomUUID();
  await saveStudioRecord(root, { projectId, jobId: 'missing-restarted-job', description: 'Interrupted work', status: 'running', phase: 'coding', startedAt: new Date().toISOString(), rounds: [] });
  const project = (await (await fetch(`${base}/api/studio/projects/${projectId}`)).json()).project;
  assert.equal(project.status, 'failed');
  assert.match(project.error, /interrupted/);
  assert.equal((await fetch(`${base}/api/studio/projects/${projectId}/preview`)).status, 409);
  assert.equal(JSON.parse(await readFile(join(root, projectId, 'project.json'), 'utf-8')).status, 'failed');
}));

class WaitingFixture extends StudioFixture {
  started = false;
  aborted = false;
  async askWithUsage(_system: string, _user: string, _temperature?: number, signal?: AbortSignal): Promise<never> {
    this.started = true;
    return new Promise((_resolve, reject) => {
      const abort = () => { this.aborted = true; reject(signal?.reason); };
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

for (const scenario of ['cancel', 'timeout'] as const) {
  test(`studio ${scenario} stops model requests and does not publish a package`, async () => {
    const provider = new WaitingFixture();
    await withApi(async (base, runtime) => {
      const response = await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Waiting project' }) });
      const accepted = await response.json();
      const deadline = Date.now() + 2000;
      while (!provider.started && Date.now() < deadline) await delay(5);
      assert.ok(provider.started);
      if (scenario === 'cancel') assert.equal((await fetch(`${base}${accepted.projectUrl}/cancel`, { method: 'POST' })).status, 200);
      const job = await waitForJob(runtime, accepted.jobId);
      assert.equal(job.status, scenario === 'cancel' ? 'cancelled' : 'failed');
      assert.equal(provider.aborted, true);
      const project = (await (await fetch(`${base}${accepted.projectUrl}`)).json()).project;
      assert.equal(project.status, scenario === 'cancel' ? 'cancelled' : 'failed');
      assert.equal(project.rounds.length, 0);
      assert.equal((await fetch(`${base}${accepted.projectUrl}/archive`)).status, 409);
    }, provider, scenario === 'timeout' ? 100 : 5000);
  });
}
