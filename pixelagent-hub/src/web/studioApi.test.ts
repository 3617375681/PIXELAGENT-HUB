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
import { saveTestPlan, testPlanSchema } from '../studio/testPlans.js';
import { listReviews } from '../studio/reviews.js';
import { hostname } from 'node:os';

class StudioFixture extends MockProvider {
  prompts: string[] = [];
  failCode = false;
  async askWithUsage(system: string, user: string, temperature?: number, signal?: AbortSignal) {
    this.prompts.push(user);
    if (system.includes('browser test planner')) return { content: JSON.stringify({ checks: [{ name: 'Initial counter', actions: [], selector: 'output', expected: '0' }], limitations: ['Synthetic DOM fixture only'] }), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'fixture', provider: 'mock' as const };
    if (system.includes('project manager')) return super.askWithUsage(system, user, temperature);
    if (this.failCode) throw new Error('Fixture repair generation failed');
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
  const api = createStudioApi({ root: join(root, 'projects'), runtime, timeoutMs, createOrchestrator: () => createOrchestrator('studio-fixture', provider, { includeTester: true }) });
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
    for (const job of runtime.listJobs()) {
      if (['queued', 'running'].includes(job.status)) runtime.cancelJob(job.jobId);
      await waitForJob(runtime, job.jobId);
    }
    await rm(root, { recursive: true, force: true });
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForJob(runtime: RunRuntime, jobId: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const job = runtime.getJob(jobId)!;
    if (['succeeded', 'failed', 'cancelled'].includes(job.status) && !runtime.isJobActive(jobId)) return job;
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
  assert.equal(project.generationMetrics.reportedTokens, 4);
  assert.equal(project.generationMetrics.agentTasks, 2);
  assert.equal(project.generationMetrics.missingUsageTasks, 0);
  assert.equal(project.generationMetrics.buildAttempts, 1);
  assert.equal(project.generationMetrics.costUsd, null);
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

test('browser diagnostics survive separate API reads without approving the build', async () => withApi(async (base, runtime, root) => {
  const accepted = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Counter' }) })).json();
  await waitForJob(runtime, accepted.jobId);
  const url = `${base}${accepted.projectUrl}/diagnostics`;
  assert.deepEqual((await (await fetch(url)).json()).reports, []);
  const payload = { previewFile: 'v1/dist/index.html', loaded: true, errors: ['Uncaught Error: example'] };
  const responses = await Promise.all([1, 2].map(() => fetch(url, { method: 'POST', body: JSON.stringify(payload) })));
  assert.ok(responses.every((response) => response.status === 201));
  const reports = (await (await fetch(url)).json()).reports;
  assert.equal(reports.length, 2);
  assert.notEqual(reports[0].id, reports[1].id);
  for (const report of reports) {
    assert.equal(report.source, 'browser-client');
    assert.ok(Number.isFinite(Date.parse(report.savedAt)));
    assert.deepEqual(report.errors, payload.errors);
    assert.deepEqual(JSON.parse(await readFile(join(root, accepted.projectId, 'diagnostics', `${report.id}.json`), 'utf-8')), report);
  }
  const project = (await (await fetch(`${base}${accepted.projectUrl}`)).json()).project;
  assert.equal(project.status, 'ready_for_review');
  assert.equal(project.rounds[0].build.browserVerified, false);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 405);
}));

test('diagnostics reject stale previews, invalid observations and fabricated approval', async () => withApi(async (base, _runtime, root) => {
  const projectId = randomUUID();
  await saveStudioRecord(root, { projectId, description: 'Counter', status: 'ready_for_review', startedAt: new Date().toISOString(), rounds: [], previewFile: 'v1/dist/index.html' });
  const url = `${base}/api/studio/projects/${projectId}/diagnostics`;
  const payload = { previewFile: 'v1/dist/index.html', loaded: true, errors: [] };
  for (const invalid of [null, { ...payload, loaded: 'yes' }, { ...payload, errors: ['x'.repeat(2001)] }, { ...payload, errors: Array(21).fill('error') }, { ...payload, errors: [7] }, { ...payload, approved: true }, { ...payload, previewFile: '../../secret' }]) {
    assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(invalid) })).status, 400);
  }
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ ...payload, previewFile: 'v2/dist/index.html' }) })).status, 409);
  await saveStudioRecord(root, { projectId, description: 'Cancelled', status: 'cancelled', startedAt: new Date().toISOString(), rounds: [] });
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(payload) })).status, 409);
  assert.deepEqual((await (await fetch(url)).json()).reports, []);
}));

test('repair uses saved errors and original source, with independent success and failure records', async () => {
  const provider = new StudioFixture();
  await withApi(async (base, runtime, root) => {
    const parent = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Counter' }) })).json();
    await waitForJob(runtime, parent.jobId);
    const original = await readFile(join(root, parent.projectId, 'project.json'), 'utf-8');
    const archive = await readFile(join(root, parent.projectId, 'source.zip'));
    const saved = await (await fetch(`${base}${parent.projectUrl}/diagnostics`, { method: 'POST', body: JSON.stringify({ previewFile: 'v1/dist/index.html', loaded: true, errors: ['counter-click-failed'] }) })).json();
    const repairUrl = `${base}${parent.projectUrl}/repair`;
    for (const invalid of ['', '../../private', 5]) assert.equal((await fetch(repairUrl, { method: 'POST', body: JSON.stringify({ diagnosticId: invalid }) })).status, 400);
    assert.equal((await fetch(repairUrl, { method: 'POST', body: JSON.stringify({ diagnosticId: randomUUID() }) })).status, 404);
    const response = await fetch(repairUrl, { method: 'POST', body: JSON.stringify({ diagnosticId: saved.report.id }) });
    assert.equal(response.status, 202);
    const child = await response.json();
    assert.notEqual(child.projectId, parent.projectId);
    assert.equal((await waitForJob(runtime, child.jobId)).status, 'succeeded');
    const record = (await (await fetch(`${base}${child.projectUrl}`)).json()).project;
    assert.equal(record.repair.parentProjectId, parent.projectId);
    assert.equal(record.repair.diagnosticId, saved.report.id);
    assert.equal(record.status, 'ready_for_review');
    assert.equal(record.rounds[0].build.browserVerified, false);
    const changes = (await (await fetch(`${base}${child.projectUrl}/changes`)).json()).changes;
    assert.equal(changes.parentProjectId, parent.projectId);
    assert.equal(changes.projectId, child.projectId);
    assert.equal(changes.fromPreview, 'v1/dist/index.html');
    assert.deepEqual(changes.files, []);
    assert.equal(changes.unchanged, 2);
    assert.equal((await fetch(`${base}${parent.projectUrl}/changes`)).status, 409);
    const codePrompt = provider.prompts.at(-1)!;
    assert.match(codePrompt, /counter-click-failed/);
    assert.match(codePrompt, /previousFiles/);
    assert.match(codePrompt, /#increment/);
    provider.failCode = true;
    const failed = await (await fetch(repairUrl, { method: 'POST', body: JSON.stringify({ diagnosticId: saved.report.id }) })).json();
    assert.equal((await waitForJob(runtime, failed.jobId)).status, 'failed');
    const failedRecord = (await (await fetch(`${base}${failed.projectUrl}`)).json()).project;
    assert.equal(failedRecord.status, 'failed');
    assert.equal(failedRecord.repair.parentProjectId, parent.projectId);
    assert.equal((await fetch(`${base}${failed.projectUrl}/archive`)).status, 409);
    assert.equal((await fetch(`${base}${failed.projectUrl}/changes`)).status, 409);
    assert.equal(await readFile(join(root, parent.projectId, 'project.json'), 'utf-8'), original);
    assert.deepEqual(await readFile(join(root, parent.projectId, 'source.zip')), archive);
    const clean = await (await fetch(`${base}${parent.projectUrl}/diagnostics`, { method: 'POST', body: JSON.stringify({ previewFile: 'v1/dist/index.html', loaded: true, errors: [] }) })).json();
    assert.equal((await fetch(repairUrl, { method: 'POST', body: JSON.stringify({ diagnosticId: clean.report.id }) })).status, 409);
  }, provider);
});

test('revisions inherit source and requests; version selection survives reads and rejects invalid targets', async () => {
  const provider = new StudioFixture();
  await withApi(async (base, runtime, root) => {
    const post = async (url: string, body: unknown) => fetch(`${base}${url}`, { method: 'POST', body: JSON.stringify(body) });
    const initial = await (await post('/api/studio/projects', { description: 'Counter' })).json();
    await waitForJob(runtime, initial.jobId);
    const original = await readFile(join(root, initial.projectId, 'project.json'), 'utf-8');
    const first = await (await post(`${initial.projectUrl}/revise`, { changeRequest: 'Display sign of the counter' })).json();
    await waitForJob(runtime, first.jobId);
    assert.match(provider.prompts.at(-1)!, /Display sign of the counter/);
    assert.match(provider.prompts.at(-1)!, /#increment/);
    const second = await (await post(`${first.projectUrl}/revise`, { changeRequest: 'Add keyboard reset' })).json();
    await waitForJob(runtime, second.jobId);
    assert.match(provider.prompts.at(-1)!, /Display sign of the counter/);
    assert.match(provider.prompts.at(-1)!, /Add keyboard reset/);
    const family = await (await fetch(`${base}${second.projectUrl}/versions`)).json();
    assert.equal(family.rootProjectId, initial.projectId);
    assert.equal(family.selectedProjectId, initial.projectId);
    assert.equal(family.versions.length, 3);
    assert.equal(family.versions[2].revision.parentProjectId, first.projectId);
    assert.equal((await post(`${initial.projectUrl}/versions`, { projectId: second.projectId })).status, 200);
    assert.equal((await (await fetch(`${base}${first.projectUrl}/versions`)).json()).selectedProjectId, second.projectId);
    const changes = (await (await fetch(`${base}${second.projectUrl}/changes`)).json()).changes;
    assert.equal(changes.parentProjectId, first.projectId);
    assert.equal((await post(`${second.projectUrl}/versions`, { projectId: initial.projectId })).status, 200);
    assert.equal(JSON.parse(await readFile(join(root, initial.projectId, 'version-selection.json'), 'utf-8')).projectId, initial.projectId);
    const other = await (await post('/api/studio/projects', { description: 'Unrelated' })).json();
    await waitForJob(runtime, other.jobId);
    assert.equal((await post(`${initial.projectUrl}/versions`, { projectId: other.projectId })).status, 409);
    assert.equal((await post(`${initial.projectUrl}/versions`, { projectId: '../bad' })).status, 400);
    for (const changeRequest of ['', 5, 'x'.repeat(4001)]) assert.equal((await post(`${initial.projectUrl}/revise`, { changeRequest })).status, 400);
    provider.failCode = true;
    const failed = await (await post(`${initial.projectUrl}/revise`, { changeRequest: 'Failure fixture' })).json();
    assert.equal((await waitForJob(runtime, failed.jobId)).status, 'failed');
    assert.equal((await post(`${initial.projectUrl}/versions`, { projectId: failed.projectId })).status, 409);
    assert.equal((await post(`${failed.projectUrl}/revise`, { changeRequest: 'Retry' })).status, 409);
    assert.equal((await (await fetch(`${base}${failed.projectUrl}/versions`)).json()).selectedProjectId, initial.projectId);
    assert.equal(await readFile(join(root, initial.projectId, 'project.json'), 'utf-8'), original);
  }, provider);
});

test('tester creates a bounded plan and saved browser failures become repair evidence without approval', async () => withApi(async (base, runtime, root) => {
  const post = async (url: string, body: unknown) => fetch(`${base}${url}`, { method: 'POST', body: JSON.stringify(body) });
  const project = await (await post('/api/studio/projects', { description: 'Counter' })).json();
  await waitForJob(runtime, project.jobId);
  assert.equal((await post(`${project.projectUrl}/test-plans`, { code: 'unrequested' })).status, 400);
  const planned = await (await post(`${project.projectUrl}/test-plans`, {})).json();
  assert.equal((await waitForJob(runtime, planned.jobId)).status, 'succeeded');
  const plans = (await (await fetch(`${base}${project.projectUrl}/test-plans`)).json()).plans;
  assert.equal(plans[0].status, 'ready');
  assert.equal(plans[0].result.output.llmProvider, 'mock');
  const checks = [{ name: 'Initial counter', status: 'failed', actual: 'wrong', error: 'Expected 0, observed wrong' }];
  const payload = { previewFile: 'v1/dist/index.html', loaded: true, errors: [], checks, testPlanId: planned.planId };
  assert.equal((await post(`${project.projectUrl}/diagnostics`, { ...payload, testPlanId: randomUUID() })).status, 409);
  assert.equal((await post(`${project.projectUrl}/diagnostics`, { ...payload, checks: [{ ...checks[0], name: 'Another check' }] })).status, 409);
  assert.equal((await post(`${project.projectUrl}/diagnostics`, { ...payload, checks: undefined })).status, 400);
  assert.equal((await post(`${project.projectUrl}/diagnostics`, { ...payload, checks: [{ name: 'Initial counter', status: 'passed', actual: 'wrong' }] })).status, 409);
  const saved = await (await post(`${project.projectUrl}/diagnostics`, payload)).json();
  assert.match(saved.report.errors[0], /Initial counter.*Expected 0/);
  assert.equal(saved.report.testPlanId, planned.planId);
  const unchanged = (await (await fetch(`${base}${project.projectUrl}`)).json()).project;
  assert.equal(unchanged.status, 'ready_for_review');
  assert.equal(unchanged.rounds[0].build.browserVerified, false);
  await saveTestPlan(root, { id: randomUUID(), projectId: project.projectId, previewFile: 'v1/dist/index.html', jobId: 'missing-job', status: 'running', startedAt: new Date().toISOString() });
  assert.equal((await (await fetch(`${base}${project.projectUrl}/test-plans`)).json()).plans[0].status, 'failed');
}));

test('test plan schema rejects model code and oversized plans', () => {
  const check = { name: 'Counter', actions: [], selector: 'output', expected: '0' };
  assert.equal(testPlanSchema.safeParse({ checks: [{ ...check, actions: [{ type: 'eval', code: 'process.exit()' }] }], limitations: [] }).success, false);
  assert.equal(testPlanSchema.safeParse({ checks: Array(11).fill(check), limitations: [] }).success, false);
  assert.equal(testPlanSchema.safeParse({ checks: [], limitations: [] }).success, false);
  assert.equal(testPlanSchema.safeParse({ checks: [check, check], limitations: [] }).success, false);
});

class TestPlanningWaitFixture extends StudioFixture {
  started = false;
  aborted = false;
  async askWithUsage(system: string, user: string, temperature?: number, signal?: AbortSignal) {
    if (!system.includes('browser test planner')) return super.askWithUsage(system, user, temperature, signal);
    this.started = true;
    return await new Promise<never>((_resolve, reject) => {
      const abort = () => { this.aborted = true; reject(signal?.reason); };
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

test('test planning cancellation aborts the model and retains the built project', async () => {
  const provider = new TestPlanningWaitFixture();
  await withApi(async (base, runtime) => {
    const project = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Counter' }) })).json();
    await waitForJob(runtime, project.jobId);
    const url = `${base}${project.projectUrl}/test-plans`;
    const accepted = await (await fetch(url, { method: 'POST', body: '{}' })).json();
    const deadline = Date.now() + 3000;
    while (!provider.started && Date.now() < deadline) await delay(10);
    assert.equal(provider.started, true);
    const cancelled = await fetch(url, { method: 'POST', body: JSON.stringify({ cancelPlanId: accepted.planId }) });
    assert.equal(cancelled.status, 200, await cancelled.text());
    assert.equal((await waitForJob(runtime, accepted.jobId)).status, 'cancelled');
    assert.equal(provider.aborted, true);
    assert.equal((await (await fetch(url)).json()).plans[0].status, 'cancelled');
    assert.equal((await (await fetch(`${base}${project.projectUrl}`)).json()).project.status, 'ready_for_review');
  }, provider);
});

test('manual reviews persist independently, surface in versions, and never carry to revised projects', async () => withApi(async (base, runtime, root) => {
  const accepted = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Counter review fixture' }) })).json();
  await waitForJob(runtime, accepted.jobId);
  const url = `${base}${accepted.projectUrl}`;
  const original = await readFile(join(root, accepted.projectId, 'project.json'), 'utf8');
  const archive = await readFile(join(root, accepted.projectId, 'source.zip'));
  assert.deepEqual(await (await fetch(`${url}/reviews`)).json(), { reviews: [], current: null });
  const { report } = await (await fetch(`${url}/diagnostics`, { method: 'POST', body: JSON.stringify({ previewFile: 'v1/dist/index.html', loaded: true, errors: [] }) })).json();
  const payload = { previewFile: report.previewFile, diagnosticId: report.id, decision: 'approved', operator: ' Fixture reviewer ', note: ' Checked buttons manually ', manuallyReviewed: true };
  const response = await fetch(`${url}/reviews`, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  const { review } = await response.json();
  assert.equal(review.operator, 'Fixture reviewer'); assert.equal(review.note, 'Checked buttons manually');
  assert.equal(review.source, 'manual-review');
  assert.deepEqual((await listReviews(root, accepted.projectId))[0], review);
  // A fresh API instance has no in-memory acceptance state to recover.
  const restored = createStudioApi({ root, runtime, timeoutMs: 5000 });
  let restoredBody = '';
  await restored.handle({ method: 'GET' } as any, { writeHead() {}, end(body: string) { restoredBody = body; } } as any, `/api/studio/projects/${accepted.projectId}/reviews`);
  assert.deepEqual(JSON.parse(restoredBody).current, review);
  const project = (await (await fetch(url)).json()).project;
  assert.equal(project.review.id, review.id);
  assert.equal(project.status, 'ready_for_review'); assert.equal(project.rounds[0].build.browserVerified, false);
  assert.equal((await (await fetch(`${base}/api/studio/projects`)).json()).projects[0].review.id, review.id);
  assert.equal((await (await fetch(`${url}/versions`)).json()).versions[0].review.id, review.id);
  const child = await (await fetch(`${url}/revise`, { method: 'POST', body: JSON.stringify({ changeRequest: 'Keep the existing counter' }) })).json();
  await waitForJob(runtime, child.jobId);
  assert.equal((await (await fetch(`${base}${child.projectUrl}`)).json()).project.review, null);
  assert.equal(await readFile(join(root, accepted.projectId, 'project.json'), 'utf8'), original);
  assert.deepEqual(await readFile(join(root, accepted.projectId, 'source.zip')), archive);
  assert.equal((await fetch(`${url}/reviews`, { method: 'DELETE' })).status, 405);
}));

test('review gate rejects invalid confirmation, stale or foreign evidence and faulty approval; new diagnostics require re-review', async () => withApi(async (base, runtime, root) => {
  const accepted = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Review gate fixture' }) })).json();
  await waitForJob(runtime, accepted.jobId);
  const url = `${base}${accepted.projectUrl}`;
  const diagnostic = async (loaded: boolean, errors: string[]) => (await (await fetch(`${url}/diagnostics`, { method: 'POST', body: JSON.stringify({ previewFile: 'v1/dist/index.html', loaded, errors }) })).json()).report;
  const clean = await diagnostic(true, []);
  const payload = { previewFile: 'v1/dist/index.html', diagnosticId: clean.id, decision: 'approved', operator: 'review fixture', note: 'manual fixture validation', manuallyReviewed: true };
  const post = (body: unknown) => fetch(`${url}/reviews`, { method: 'POST', body: JSON.stringify(body) });
  for (const invalid of [null, { ...payload, manuallyReviewed: false }, { ...payload, operator: ' ' }, { ...payload, note: '' }, { ...payload, note: 'x'.repeat(2001) }, { ...payload, browserVerified: true }, { ...payload, decision: 'delivered' }]) assert.equal((await post(invalid)).status, 400);
  assert.equal((await post({ ...payload, previewFile: 'v2/dist/index.html' })).status, 409);
  assert.equal((await post({ ...payload, diagnosticId: randomUUID() })).status, 404);
  const other = await (await fetch(`${base}/api/studio/projects`, { method: 'POST', body: JSON.stringify({ description: 'Other project' }) })).json();
  await waitForJob(runtime, other.jobId);
  assert.equal((await fetch(`${base}${other.projectUrl}/reviews`, { method: 'POST', body: JSON.stringify(payload) })).status, 404);
  const unloaded = await diagnostic(false, []);
  assert.equal((await post({ ...payload, diagnosticId: unloaded.id })).status, 409);
  const faulty = await diagnostic(true, ['click-failed']);
  assert.equal((await post({ ...payload, diagnosticId: faulty.id })).status, 409);
  assert.equal((await post(payload)).status, 409); // Old clean evidence cannot hide newer faults.
  assert.equal((await post({ ...payload, diagnosticId: faulty.id, decision: 'changes_requested' })).status, 201);
  const latest = await diagnostic(true, []);
  assert.equal((await post({ ...payload, diagnosticId: latest.id })).status, 201);
  assert.equal((await (await fetch(url)).json()).project.review.decision, 'approved');
  await diagnostic(true, ['new-regression']);
  assert.equal((await (await fetch(url)).json()).project.review, null);
  const history = await (await fetch(`${url}/reviews`)).json();
  assert.equal(history.current, null); assert.equal(history.reviews.length, 2);
  assert.deepEqual(history.reviews.map((review: { decision: string }) => review.decision), ['approved', 'changes_requested']);
  const record = JSON.parse(await readFile(join(root, accepted.projectId, 'project.json'), 'utf8'));
  record.status = 'cancelled'; await saveStudioRecord(root, record);
  assert.equal((await post({ ...payload, decision: 'changes_requested' })).status, 409);
  assert.equal((await (await fetch(`${url}/reviews`)).json()).current, null);
}));

test('API reads preserve live CLI generation, leave unknown legacy ownership alone and fail an absent owner', async () => withApi(async (base, _runtime, root) => {
  const live = randomUUID();
  const legacy = randomUUID();
  const absent = randomUUID();
  for (const [projectId, owner] of [[live, { ownerPid: process.pid, ownerHost: hostname() }], [legacy, {}], [absent, { ownerPid: 2147483647, ownerHost: hostname() }]] as const) {
    await saveStudioRecord(root, { projectId, description: 'CLI owner fixture', status: 'running', startedAt: new Date().toISOString(), rounds: [], ...owner });
  }
  assert.equal((await (await fetch(`${base}/api/studio/projects/${live}`)).json()).project.status, 'running');
  assert.equal((await (await fetch(`${base}/api/studio/projects/${legacy}`)).json()).project.status, 'running');
  assert.equal((await (await fetch(`${base}/api/studio/projects/${absent}`)).json()).project.status, 'failed');
  assert.equal(JSON.parse(await readFile(join(root, live, 'project.json'), 'utf8')).status, 'running');
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
