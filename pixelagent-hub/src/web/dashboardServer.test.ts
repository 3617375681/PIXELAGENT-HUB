import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDashboardHandler } from './dashboardServer.js';
import { createRecordsWebStack } from './recordsWebStack.js';

async function withDashboard(work: (get: (path: string, method?: string, headers?: Record<string, string>) => Promise<{ status: number; headers: Record<string, any>; body: string }>, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-server-'));
  const build = join(root, 'public');
  await mkdir(join(build, 'assets'), { recursive: true });
  await writeFile(join(build, 'index.html'), '<html><body>Dashboard fixture</body></html>');
  await writeFile(join(build, 'assets', 'app.js'), 'console.log("fixture");');
  await writeFile(join(build, 'assets', 'style.css'), 'body { color: black; }');
  await writeFile(join(build, '.env'), 'PRIVATE-ENV-MARKER');
  await writeFile(join(build, 'assets', 'app.js.map'), 'PRIVATE-SOURCE-MARKER');
  await writeFile(join(root, 'private.txt'), 'PRIVATE-OUTSIDE-MARKER');
  const dashboard = await createDashboardHandler(build);
  const stack = createRecordsWebStack({ NODE_ENV: 'test', ALLOW_UNAUTH_IN_DEV: 'false', RECORDS_API_KEY: 'dashboard-test-key', RECORDS_ROOT_OVERRIDE: join(root, 'records'), ENABLE_EMBEDDING_RETRIEVER: 'false' });
  await stack.runtimeReady;
  const server = createServer(async (req, res) => {
    if (!await dashboard(req, res)) await stack.handleRequest(req, res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  // Raw HTTP preserves encoded traversal that fetch's URL parser may normalize away.
  const get = (path: string, method = 'GET', headers: Record<string, string> = {}) => new Promise<{ status: number; headers: Record<string, any>; body: string }>((done, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
  try { await work(get, root); }
  finally { await new Promise<void>((done) => server.close(() => done())); await rm(root, { recursive: true, force: true }); }
}

test('same-origin server handles SPA refresh, correct asset MIME and bodyless HEAD', async () => withDashboard(async (get) => {
  for (const path of ['/', '/studio', '/studio/12345678-1234-1234-1234-123456789abc', '/studio?tab=code']) {
    const result = await get(path);
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'], /^text\/html/);
    assert.match(result.body, /Dashboard fixture/);
    assert.equal(result.headers['cache-control'], 'no-cache');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  }
  const script = await get('/assets/app.js?v=1');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /^text\/javascript/);
  assert.equal(script.body, 'console.log("fixture");');
  assert.match((await get('/assets/style.css')).headers['content-type'], /^text\/css/);
  const head = await get('/studio', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength('<html><body>Dashboard fixture</body></html>'));
}));

test('same-origin server retains API auth and JSON errors and never substitutes the SPA for reserved routes', async () => withDashboard(async (get) => {
  const unauthenticated = await get('/api/studio/projects');
  assert.equal(unauthenticated.status, 401);
  assert.equal(JSON.parse(unauthenticated.body).error.code, 'UNAUTHORIZED');
  const headers = { 'X-API-Key': 'dashboard-test-key' };
  assert.equal((await get('/api/studio/projects', 'GET', headers)).status, 200);
  for (const path of ['/api/missing', '/api', '/health/missing', '/%61pi/missing']) {
    const result = await get(path, 'GET', headers);
    assert.equal(result.status, 404); assert.match(result.headers['content-type'], /application\/json/);
    assert.ok(!result.body.includes('Dashboard fixture'));
  }
  assert.equal((await get('/health')).status, 200);
}));

test('static routes reject invalid paths, hidden files, source maps, methods and missing assets', async () => withDashboard(async (get) => {
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/assets/%2e%2e/%2e%2e/private.txt', '/assets%5c..%5cprivate.txt', '/%00', '/%ZZ']) {
    const result = await get(path);
    assert.equal(result.status, 400, path); assert.ok(!result.body.includes('PRIVATE-'));
  }
  for (const path of ['/.env', '/%2eenv', '/assets/app.js.map', '/assets/missing.js', '/assets/no-extension', '/assets', '/private.txt']) {
    const result = await get(path);
    assert.equal(result.status, 404, path); assert.ok(!result.body.includes('PRIVATE-'));
    assert.ok(!result.body.includes('Dashboard fixture'));
  }
  const posted = await get('/studio', 'POST');
  assert.equal(posted.status, 405); assert.equal(posted.headers.allow, 'GET, HEAD');
  assert.equal((await get('/assets/missing.js', 'HEAD')).body, '');
}));

test('static files cannot escape build root through directory symlinks', async () => withDashboard(async (get, root) => {
  const outside = join(root, 'outside');
  await mkdir(outside); await writeFile(join(outside, 'private.js'), 'PRIVATE-SYMLINK-MARKER');
  await symlink(outside, join(root, 'public', 'escape'), 'junction');
  const result = await get('/escape/private.js');
  assert.equal(result.status, 404); assert.ok(!result.body.includes('PRIVATE-'));
  const hidden = join(root, 'public', '.private');
  await mkdir(hidden); await writeFile(join(hidden, 'secret.js'), 'PRIVATE-HIDDEN-TARGET');
  await symlink(hidden, join(root, 'public', 'alias'), 'junction');
  const alias = await get('/alias/secret.js');
  assert.equal(alias.status, 404); assert.ok(!alias.body.includes('PRIVATE-'));
}));

test('dashboard startup fails clearly when a build is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-missing-'));
  try {
    await assert.rejects(createDashboardHandler(root), /Run npm run build:all before npm start/);
    await mkdir(join(root, 'index.html'));
    await assert.rejects(createDashboardHandler(root), /Dashboard build is unavailable/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
