import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const reservation = createServer();
await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const root = await mkdtemp(join(tmpdir(), 'studio-start-smoke-'));
const apiKey = 'controlled-startup-smoke-key';
const child = spawn(process.execPath, [resolve('dist/src/web/server.js'), '--dashboard'], {
  env: {
    ...process.env, DOTENV_CONFIG_PATH: join(root, '.env'), NODE_ENV: 'test', LLM_PROVIDER: 'mock',
    ALLOW_UNAUTH_IN_DEV: 'false', RECORDS_API_PORT: String(port), RECORDS_API_KEY: apiKey,
    RECORDS_ROOT_OVERRIDE: join(root, 'records'), STUDIO_ROOT_OVERRIDE: join(root, 'studio'),
    ENABLE_EMBEDDING_RETRIEVER: 'false', ENABLE_STUDIO_BROWSER_CHECKS: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = ''; let errors = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
const exited = new Promise((done) => child.once('close', done));
try {
  await new Promise((done, reject) => {
    const timeout = setTimeout(() => { clearInterval(poll); reject(new Error(`Server did not start: ${errors}`)); }, 15000);
    const poll = setInterval(() => {
      if (output.includes('Dashboard: http://127.0.0.1:')) { clearTimeout(timeout); clearInterval(poll); done(); }
      else if (child.exitCode !== null || child.signalCode !== null) {
        clearTimeout(timeout); clearInterval(poll); reject(new Error(`Server exited before startup: ${errors}`));
      }
    }, 25);
    child.once('error', (error) => { clearTimeout(timeout); clearInterval(poll); reject(error); });
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (path, authenticated = false) => fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(10000), headers: authenticated ? { 'X-API-Key': apiKey } : {},
  });
  const html = await get('/studio');
  assert.equal(html.status, 200); assert.match(html.headers.get('content-type'), /text\/html/);
  const body = await html.text();
  const script = body.match(/<script[^>]*src="([^"]+)"/);
  assert.ok(script && script[1].startsWith('/assets/'), 'Built dashboard module script must be present');
  const asset = await get(script[1]);
  assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /text\/javascript/);
  assert.ok((await asset.text()).length > 0);
  const deepLink = await get('/studio/12345678-1234-1234-1234-123456789abc');
  assert.equal(deepLink.status, 200); assert.equal(await deepLink.text(), body);
  assert.equal((await get('/health/readiness')).status, 200);
  assert.equal((await get('/api/sessions')).status, 401);
  const rejected = await fetch(`${base}/api/sessions`, { headers: { 'X-API-Key': 'wrong-fixture-key' }, signal: AbortSignal.timeout(10000) });
  assert.equal(rejected.status, 401);
  const sessions = await get('/api/sessions', true);
  assert.equal(sessions.status, 200); assert.deepEqual((await sessions.json()).sessions, []);
  const projects = await get('/api/studio/projects', true);
  assert.equal(projects.status, 200); assert.deepEqual((await projects.json()).projects, []);
  const missingApi = await get('/api/nonexistent', true);
  assert.equal(missingApi.status, 404); assert.match(missingApi.headers.get('content-type'), /application\/json/);
  assert.equal((await get('/assets/missing.js')).status, 404);
  console.log('Compiled single-service startup, dashboard assets, SPA refresh, readiness and Studio API passed. No model requests.');
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await exited;
  await rm(root, { recursive: true, force: true });
}
