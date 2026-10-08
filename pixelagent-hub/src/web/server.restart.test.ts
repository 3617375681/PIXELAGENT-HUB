import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function waitUntil(check: () => Promise<boolean>) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Restart test condition did not become true');
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGKILL');
  await exited;
}

async function launch(root: string, modelUrl: string) {
  const stackUrl = pathToFileURL(join(process.cwd(), 'src/web/recordsWebStack.ts')).href;
  const env = { ...process.env, NODE_ENV: 'development', ALLOW_UNAUTH_IN_DEV: 'true', LLM_PROVIDER: 'openai', LLM_API_KEY: 'restart-fixture', LLM_BASE_URL: modelUrl, LLM_MODEL: 'restart-fixture', RECORDS_ROOT_OVERRIDE: root, STUDIO_ROOT_OVERRIDE: join(root, 'studio'), ENABLE_EMBEDDING_RETRIEVER: 'false', SEARCH_PROVIDER: 'mock', RUN_TIMEOUT_MS_STUDIO: '30000', RUN_MAX_RETRIES: '0' };
  for (const key of Object.keys(env)) if (/^AGENT_.*_LLM_(PROVIDER|MODEL)$/.test(key)) delete (env as Record<string, string | undefined>)[key];
  Object.assign(env, { DOTENV_CONFIG_PATH: join(root, '.env'), OFFLINE: 'false' });
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { createServer } from 'node:http';
    import { createRecordsWebStack } from ${JSON.stringify(stackUrl)};
    const stack = createRecordsWebStack(process.env);
    await stack.runtimeReady;
    const server = createServer((req, res) => void stack.handleRequest(req, res));
    server.listen(0, '127.0.0.1', () => console.log('RESTART_READY:' + server.address().port));
  `], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API child did not start')), 10000);
      let output = ''; let errors = '';
      child.stdout!.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/RESTART_READY:(\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.stderr!.on('data', (chunk) => { errors += chunk.toString(); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(`API child exited: ${errors}`)); });
    });
    return { child, base: `http://127.0.0.1:${port}` };
  } catch (error) { await stop(child); throw error; }
}

test('full Records HTTP service preserves completed artifacts and exposes interrupted generation after process restart', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'records-restart-'));
  let requests = 0; let held = false;
  const model: Server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests++;
    const body = JSON.parse(raw);
    const manager = body.messages[0].content.includes('project manager');
    if (!manager && raw.includes('hold-for-restart')) { held = true; return; }
    const content = manager
      ? { projectName: 'Restart fixture', goal: 'Build static fixture', phases: [{ id: 'p1', name: 'Build', tasks: ['Write files'], assignee: 'coder', priority: 'high' }], estimatedRounds: 1, risks: [] }
      : { language: 'javascript', files: [{ path: 'index.html', content: '<html><body><output id="count">0</output></body></html>', description: 'Static restart fixture' }, { path: 'README.md', content: '# Local restart fixture', description: 'Fixture instructions' }], explanation: 'Controlled fixture, not real model output', dependencies: [] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
  const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}/v1`;
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    running = await launch(root, modelUrl);
    const create = async (description: string) => {
      const response = await fetch(`${running!.base}/api/studio/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) });
      assert.equal(response.status, 202); return response.json();
    };
    const ready = await create('Completed local restart fixture');
    await waitUntil(async () => {
      const project = (await (await fetch(`${running!.base}${ready.projectUrl}`)).json()).project;
      assert.notEqual(project.status, 'failed', project.error);
      return project.status === 'ready_for_review';
    });
    const archiveBefore = Buffer.from(await (await fetch(`${running.base}${ready.projectUrl}/archive`)).arrayBuffer());
    assert.ok(archiveBefore.length > 100);
    const diagnosticResponse = await fetch(`${running.base}${ready.projectUrl}/diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewFile: 'v1/dist/index.html', loaded: true, errors: [] }) });
    assert.equal(diagnosticResponse.status, 201);
    const diagnostic = (await diagnosticResponse.json()).report;
    assert.equal((await fetch(`${running.base}${ready.projectUrl}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: ready.projectId }) })).status, 200);
    const interrupted = await create('hold-for-restart');
    await waitUntil(async () => held);
    await stop(running.child);
    const beforeRestartRequests = requests;
    running = await launch(root, modelUrl);
    const failed = (await (await fetch(`${running.base}${interrupted.projectUrl}`)).json()).project;
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /Recovered after process restart/);
    assert.equal(failed.generationMetrics.elapsedMs, null);
    assert.equal((await fetch(`${running.base}${interrupted.projectUrl}/archive`)).status, 409);
    const job = (await (await fetch(`${running.base}/api/runtime/jobs/${interrupted.jobId}`)).json()).job;
    assert.equal(job.status, 'failed');
    const projects = (await (await fetch(`${running.base}/api/studio/projects`)).json()).projects;
    assert.equal(projects.find((project: { projectId: string }) => project.projectId === interrupted.projectId).status, 'failed');
    const health = await (await fetch(`${running.base}/health/readiness`)).json();
    assert.equal(health.runtime.running, 0);
    assert.equal(health.runtime.queued, 0);
    const completed = (await (await fetch(`${running.base}${ready.projectUrl}`)).json()).project;
    assert.equal(completed.status, 'ready_for_review');
    assert.equal(completed.rounds[0].build.browserVerified, false);
    assert.equal((await fetch(`${running.base}${ready.projectUrl}/preview`)).status, 200);
    const reports = (await (await fetch(`${running.base}${ready.projectUrl}/diagnostics`)).json()).reports;
    assert.deepEqual(reports.find((report: { id: string }) => report.id === diagnostic.id), diagnostic);
    assert.equal((await (await fetch(`${running.base}${ready.projectUrl}/versions`)).json()).selectedProjectId, ready.projectId);
    const archiveAfter = Buffer.from(await (await fetch(`${running.base}${ready.projectUrl}/archive`)).arrayBuffer());
    assert.deepEqual(archiveAfter, archiveBefore);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(requests, beforeRestartRequests, 'restart must not repeat model requests');
  } finally {
    if (running) await stop(running.child);
    model.closeAllConnections();
    await new Promise<void>((resolve) => model.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
