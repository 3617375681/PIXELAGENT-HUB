import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { browserRepairErrors, contentHash, executeBrowserRun, listBrowserRuns, saveBrowserRun, type BrowserRun } from './browserRuns.js';
import type { TestPlanRecord } from './testPlans.js';
import { buildStaticProject } from './workspace.js';
import { testPlanSchema } from './testPlans.js';

const html = '<html><body><input aria-label="Name" id="name"><button id="add">Add</button><output>0</output><script>document.querySelector("#add").addEventListener("click",()=>document.querySelector("output").textContent++);document.querySelector("#name").addEventListener("keydown",e=>{if(e.key==="Enter")document.querySelector("output").textContent=e.target.value})</script></body></html>';
const plan = { checks: [
  { name: 'Increment', actions: [{ type: 'click', selector: '#add' }], selector: 'output', expected: '1' },
  { name: 'Enter name', actions: [{ type: 'input', selector: '#name', value: 'Pixel' }, { type: 'key', selector: '#name', key: 'Enter' }], selector: 'output', expected: 'Pixel' },
], limitations: ['Controlled browser fixture; not model quality evidence'] };
const makeRun = (content = html, checks: unknown = plan): BrowserRun => ({ id: randomUUID(), projectId: randomUUID(), testPlanId: randomUUID(), previewFile: 'v1/dist/index.html', previewHash: contentHash(content), planHash: contentHash(JSON.stringify(testPlanSchema.parse(checks))), jobId: randomUUID(), source: 'server-browser', status: 'queued', startedAt: new Date().toISOString(), viewport: { width: 1280, height: 720 }, checks: [], errors: [], blockedRequests: [], screenshots: [] });

test('disabled assertions require booleans as text while legacy plans retain their hash', () => {
  assert.equal(contentHash(JSON.stringify(testPlanSchema.parse(plan))), contentHash(JSON.stringify(plan)));
  const check = { name: 'Locked', actions: [], selector: '#answer', assertion: 'disabled', expected: 'true' };
  assert.equal(testPlanSchema.safeParse({ checks: [check], limitations: [] }).success, true);
  for (const change of [{ expected: '4' }, { expected: '' }, { assertion: 'eval' }, { assertion: 'attribute', code: 'alert(1)' }]) {
    assert.equal(testPlanSchema.safeParse({ checks: [{ ...check, ...change }], limitations: [] }).success, false);
  }
});

test('real browser observes native disabled state without clicking locked controls', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-disabled-'));
  try {
    const content = '<html><body><button id="answer">4</button><button id="reset">Reset</button><script>document.querySelector("#answer").addEventListener("click",e=>e.target.disabled=true);document.querySelector("#reset").addEventListener("click",()=>document.querySelector("#answer").disabled=false)</script></body></html>';
    const checks = { checks: [
      { name: 'Initially enabled', actions: [], selector: '#answer', assertion: 'disabled', expected: 'false' },
      { name: 'Answer locks', actions: [{ type: 'click', selector: '#answer' }], selector: '#answer', assertion: 'disabled', expected: 'true' },
      { name: 'Text differs from state', actions: [], selector: '#answer', expected: '4' },
      { name: 'Incorrect state', actions: [], selector: '#answer', assertion: 'disabled', expected: 'false' },
      { name: 'Reset unlocks', actions: [{ type: 'click', selector: '#reset' }], selector: '#answer', assertion: 'disabled', expected: 'false' },
    ], limitations: [] };
    const run = await executeBrowserRun({ root, run: makeRun(content, checks), html: content, plan: checks, signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    assert.deepEqual(run.checks.map((check) => check.status), ['passed', 'passed', 'passed', 'failed', 'passed'], JSON.stringify(run));
    assert.deepEqual(run.checks.map((check) => check.actual), ['false', 'true', '4', 'true', 'false']);
    assert.equal(run.status, 'failed'); assert.equal(run.error, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('build preserves deferred and module ordering before DOMContentLoaded in a real browser', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-script-order-'));
  try {
    const report = await buildStaticProject([
      { path: 'index.html', content: '<html><head><script src="first.js" defer></script><script src="module.js" type="module"></script><script src="second.js" defer></script></head><body><output id="order"></output><output id="count">0</output><button id="add">Add</button><script>window.order = ["inline"];</script></body></html>' },
      { path: 'first.js', content: 'window.order.push("defer-one"); document.addEventListener("DOMContentLoaded", () => { window.order.push("loaded"); document.querySelector("#order").textContent = window.order.join(","); });' },
      { path: 'module.js', content: 'window.order.push("module");' },
      { path: 'second.js', content: 'window.order.push("defer-two"); document.querySelector("#add").addEventListener("click", () => document.querySelector("#count").textContent = "1");' },
    ], join(root, 'build'));
    assert.equal(report.status, 'passed');
    const preview = await readFile(join(root, 'build/dist/index.html'), 'utf8');
    const checks = { checks: [
      { name: 'Parser scheduling', actions: [], selector: '#order', expected: 'inline,defer-one,module,defer-two,loaded' },
      { name: 'Handler sees parsed button', actions: [{ type: 'click', selector: '#add' }], selector: '#count', expected: '1' },
    ], limitations: ['Controlled scheduling regression'] };
    const run = await executeBrowserRun({ root, run: makeRun(preview, checks), html: preview, plan: checks, signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    assert.equal(run.status, 'passed', JSON.stringify(run));
    assert.deepEqual(run.blockedRequests, []); assert.deepEqual(run.errors, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

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
    assert.equal(blocked.status, 'failed', JSON.stringify(blocked)); assert.equal(blocked.blockedRequests.length, 1, JSON.stringify(blocked));
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

test('fresh isolation reloads the app before every check; shared plans keep their state', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-isolation-'));
  try {
    const content = '<html><body><button id="mode">Focus</button><script>document.querySelector("#mode").addEventListener("click",e=>e.target.textContent=e.target.textContent==="Focus"?"Break":"Focus")</script></body></html>';
    const toggle = { name: 'Toggle to break', actions: [{ type: 'click', selector: '#mode' }], selector: '#mode', expected: 'Break' };
    const checks = (isolation?: 'fresh') => ({ checks: [toggle, { ...toggle, name: 'Toggle again from a fresh page' }], limitations: [], ...(isolation ? { isolation } : {}) });
    const fresh = await executeBrowserRun({ root, run: makeRun(content, checks('fresh')), html: content, plan: checks('fresh'), signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    assert.deepEqual(fresh.checks.map((check) => check.status), ['passed', 'passed'], JSON.stringify(fresh));
    const shared = await executeBrowserRun({ root, run: makeRun(content, checks()), html: content, plan: checks(), signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    assert.deepEqual(shared.checks.map((check) => check.actual), ['Break', 'Focus']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('visible assertions and rendered text match what a person sees', { skip: process.env.RUN_STUDIO_BROWSER_TESTS !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'browser-visible-'));
  try {
    const content = '<html><body><div id="intro"><p>Use the arrow keys.</p><p>Eat the dot.</p></div><div id="win" style="display:none">You won!</div><button id="toggle" style="text-transform:uppercase">Pause</button><button id="show">Show</button><script>document.querySelector("#show").addEventListener("click",()=>document.querySelector("#win").style.display="block")</script></body></html>';
    const checks = { checks: [
      { name: 'Paragraphs read as separate sentences', actions: [], selector: '#intro', expected: 'Use the arrow keys. Eat the dot.' },
      { name: 'Win message hidden', actions: [], selector: '#win', assertion: 'visible', expected: 'false' },
      { name: 'Win message shown after click', actions: [{ type: 'click', selector: '#show' }], selector: '#win', assertion: 'visible', expected: 'true' },
      { name: 'CSS casing does not change the label', actions: [], selector: '#toggle', expected: 'Pause' },
    ], limitations: [], isolation: 'fresh' };
    const run = await executeBrowserRun({ root, run: makeRun(content, checks), html: content, plan: checks, signal: new AbortController().signal, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE });
    assert.deepEqual(run.checks.map((check) => check.status), ['passed', 'passed', 'passed', 'passed'], JSON.stringify(run.checks));
    assert.equal(run.checks[3].actual, 'PAUSE');
  } finally { await rm(root, { recursive: true, force: true }); }
});
