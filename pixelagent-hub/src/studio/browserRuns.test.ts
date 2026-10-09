import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { browserRepairErrors, contentHash, executeBrowserRun, listBrowserRuns, saveBrowserRun, type BrowserRun } from './browserRuns.js';
import type { TestPlanRecord } from './testPlans.js';

const html = '<html><body><input aria-label="Name" id="name"><button id="add">Add</button><output>0</output><script>document.querySelector("#add").addEventListener("click",()=>document.querySelector("output").textContent++);document.querySelector("#name").addEventListener("keydown",e=>{if(e.key==="Enter")document.querySelector("output").textContent=e.target.value})</script></body></html>';
const plan = { checks: [
  { name: 'Increment', actions: [{ type: 'click', selector: '#add' }], selector: 'output', expected: '1' },
  { name: 'Enter name', actions: [{ type: 'input', selector: '#name', value: 'Pixel' }, { type: 'key', selector: '#name', key: 'Enter' }], selector: 'output', expected: 'Pixel' },
], limitations: ['Controlled browser fixture; not model quality evidence'] };
const makeRun = (content = html, checks: unknown = plan): BrowserRun => ({ id: randomUUID(), projectId: randomUUID(), testPlanId: randomUUID(), previewFile: 'v1/dist/index.html', previewHash: contentHash(content), planHash: contentHash(JSON.stringify(checks)), jobId: randomUUID(), source: 'server-browser', status: 'queued', startedAt: new Date().toISOString(), viewport: { width: 1280, height: 720 }, checks: [], errors: [], blockedRequests: [], screenshots: [] });

test('browser repair binds completed application failures to the exact preview and saved plan', () => {
  const run = makeRun();
  Object.assign(run, { status: 'failed', finishedAt: new Date().toISOString(), browserVersion: 'fixture', screenshots: ['initial.png', 'final.png'], checks: [{ name: 'Increment', status: 'failed', actual: '2', error: 'Expected 1' }, { name: 'Enter name', status: 'passed', actual: 'Pixel' }] });
  const saved: TestPlanRecord = { id: run.testPlanId, projectId: run.projectId, previewFile: run.previewFile, jobId: 'fixture-plan', status: 'ready', startedAt: run.startedAt, result: { taskId: 'fixture', agentId: 'tester', status: 'success', output: plan } };
  const errors = browserRepairErrors(run, saved, html);
  assert.equal(errors.length, 1); assert.match(errors[0], /expected="1", actual="2"/); assert.match(errors[0], /#add/);
  for (const change of [
    { status: 'passed' }, { status: 'running' }, { status: 'cancelled' }, { error: 'Browser executable missing' },
    { previewHash: 'changed' }, { planHash: 'changed' }, { finishedAt: undefined }, { screenshots: ['initial.png'] }, { checks: [] },
  ]) assert.deepEqual(browserRepairErrors({ ...run, ...change } as BrowserRun, saved, html), [], JSON.stringify(change));
  for (const change of [{ status: 'failed' }, { projectId: randomUUID() }, { previewFile: 'v2/dist/index.html' }, { id: randomUUID() }]) {
    assert.deepEqual(browserRepairErrors(run, { ...saved, ...change } as TestPlanRecord, html), []);
  }
  assert.deepEqual(browserRepairErrors(run, saved, html + 'changed'), []);
  assert.deepEqual(browserRepairErrors(run, undefined, html), []);
  const runtime = { ...run, checks: run.checks.map((check) => ({ ...check, status: 'passed' as const })), errors: ['Uncaught fixture error'] };
  assert.match(browserRepairErrors(runtime, saved, html)[0], /Uncaught fixture error/);
});

test('browser evidence is separately persisted with hashes and rejects changed preview', async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-record-'));
  try {
    const run = makeRun(); await saveBrowserRun(root, run);
    assert.deepEqual(await listBrowserRuns(root, run.projectId), [run]);
    const result = await executeBrowserRun({ root, run, html: html + 'changed', plan, signal: new AbortController().signal });
    assert.equal(result.status, 'failed'); assert.match(result.error!, /hash mismatch|Node 20/);
    assert.deepEqual(result.screenshots, []);
    assert.equal((await listBrowserRuns(root, run.projectId))[0].status, 'failed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real browser uses click, fill and key actions, captures screenshots and detects runtime errors', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-integration-'));
  const execute = (run: BrowserRun, content: string, checks: unknown = plan, signal = new AbortController().signal, timeoutMs?: number) => executeBrowserRun({ root, run, html: content, plan: checks, signal, timeoutMs, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
  try {
    const run = await execute(makeRun(), html);
    assert.equal(run.status, 'passed', JSON.stringify(run));
    assert.deepEqual(run.checks.map((check) => check.actual), ['1', 'Pixel']);
    assert.ok(run.browserVersion); assert.deepEqual(run.screenshots, ['initial.png', 'final.png']);
    const png = await readFile(join(root, run.projectId, 'browser-runs', run.id, 'final.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual(await listBrowserRuns(root, run.projectId), [run]);
    const broken = html.replace('</script>', ';throw new Error("fixture runtime error")</script>');
    const failed = await execute(makeRun(broken), broken);
    assert.equal(failed.status, 'failed'); assert.ok(failed.errors.some((error) => error.includes('fixture runtime error')));
    const mismatch = { checks: [{ name: 'Mismatch', actions: [], selector: 'output', expected: '99' }], limitations: [] };
    const negative = await execute(makeRun(html, mismatch), html, mismatch);
    assert.equal(negative.status, 'failed'); assert.equal(negative.checks[0].actual, '0');
    const network = '<html><body><button>Fetch</button><output>idle</output><script>document.querySelector("button").addEventListener("click",()=>fetch("https://example.invalid/secret").catch(()=>document.querySelector("output").textContent="blocked"))</script></body></html>';
    const networkPlan = { checks: [{ name: 'Network blocked', actions: [{ type: 'click', selector: 'button' }], selector: 'output', expected: 'blocked' }], limitations: [] };
    const blocked = await execute(makeRun(network, networkPlan), network, networkPlan);
    assert.equal(blocked.status, 'failed', JSON.stringify(blocked)); assert.equal(blocked.blockedRequests.length, 1);
    const timeout = await execute(makeRun(html, mismatch), html, mismatch, undefined, 1000);
    assert.equal(timeout.status, 'failed'); assert.match(timeout.error!, /time limit/);
    const controller = new AbortController(); controller.abort();
    const cancelled = await execute(makeRun(), html, plan, controller.signal);
    assert.equal(cancelled.status, 'cancelled');
    const activeController = new AbortController();
    const cancelTimer = setTimeout(() => activeController.abort(new Error('User cancelled browser fixture')), 800);
    try {
      const activeCancelled = await execute(makeRun(html, mismatch), html, mismatch, activeController.signal);
      assert.equal(activeCancelled.status, 'cancelled'); assert.match(activeCancelled.error!, /cancelled browser fixture/);
    } finally { clearTimeout(cancelTimer); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
