// Run from the repository root against the CI-owned Compose stack only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const base = 'http://127.0.0.1:8080';
const key = process.env.RECORDS_API_KEY;
assert.ok(key, 'Provide the controlled CI API key');
const get = (path, authenticated = false, init = {}) => fetch(`${base}${path}`, {
  ...init, headers: { ...(authenticated ? { 'X-API-Key': key } : {}), ...init.headers },
  redirect: 'error', signal: AbortSignal.timeout(10000),
});
const pause = () => new Promise((done) => setTimeout(done, 1000));
async function ready() {
  for (let attempt = 0; attempt < 45; attempt++) {
    try { if ((await get('/health/readiness')).ok) return; } catch { /* Startup may precede nginx/backend readiness. */ }
    await pause();
  }
  throw new Error('Compose stack did not become ready');
}
await ready();
const page = await get('/studio');
assert.equal(page.status, 200);
const html = await page.text();
const assetPath = html.match(/<script[^>]*src="([^"]+)"/)?.[1];
assert.ok(assetPath?.startsWith('/assets/'));
const asset = await get(assetPath);
assert.equal(asset.status, 200);
assert.ok(!(await asset.text()).includes('DOCKER_BUILD_SECRET_CANARY'), 'Local Vite environment must not enter the build');
assert.equal((await get('/api/studio/projects')).status, 401);
assert.equal((await get('/api/sessions', false, { headers: { 'X-API-Key': 'wrong-fixture-key' } })).status, 401);
assert.equal((await get('/api/studio/projects', false, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
// Fixed source exercises the shipped builder, esbuild binary and archive without a paid model.
// This is controlled fixture preparation, not evidence of model generation quality.
const fixtureCode = `
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStaticProject, createSourceArchive } from './dist/src/studio/workspace.js';
import { saveStudioRecord } from './dist/src/studio/softwareStudio.js';
const projectId = randomUUID();
const root = process.env.STUDIO_ROOT_OVERRIDE;
const files = [
  { path: 'index.html', content: '<html><body><h1>Controlled Docker fixture</h1><button id="add">Add</button><output>0</output><script src="app.js"></script></body></html>' },
  { path: 'app.js', content: 'document.querySelector("#add").addEventListener("click",()=>document.querySelector("output").textContent++);' },
  { path: 'README.md', content: 'Controlled packaging fixture; no model calls or acceptance claim.' },
];
const build = await buildStaticProject(files, join(root, projectId, 'v1'));
if (build.status !== 'passed') throw new Error('Container fixture build failed');
const html = await readFile(join(root, projectId, 'v1/dist/index.html'), 'utf8');
await writeFile(join(root, projectId, 'source.zip'), createSourceArchive(files, html, build));
await saveStudioRecord(root, { projectId, description: 'Controlled Docker fixture, no model calls', status: 'ready_for_review', phase: 'ready_for_review', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), previewFile: 'v1/dist/index.html', archiveFile: 'source.zip', rounds: [{ round: 1, build, code: { taskId: projectId, agentId: 'controlled-fixture', status: 'success', output: { files }, reasoning: 'Fixed source; no model calls' } }] });
console.log(JSON.stringify({ projectId }));
`;
const { projectId } = JSON.parse(execFileSync('docker', ['compose', 'exec', '-T', 'backend', 'node', '--input-type=module', '-e', fixtureCode], { encoding: 'utf8' }));
const project = await get(`/api/studio/projects/${projectId}`, true);
assert.equal(project.status, 200);
assert.equal((await project.json()).project.status, 'ready_for_review');
const preview = await get(`/api/studio/projects/${projectId}/preview`, true);
assert.equal(preview.status, 200);
const before = await preview.json();
assert.ok(before.html.length > 0);
const archive = await get(`/api/studio/projects/${projectId}/archive`, true);
assert.equal(archive.status, 200);
const bytes = new Uint8Array(await archive.arrayBuffer());
assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
assert.equal((await get(`/studio/${projectId}`)).status, 200);
execFileSync('docker', ['compose', 'restart', 'backend'], { stdio: 'inherit' });
await ready();
const restored = await get(`/api/studio/projects/${projectId}`, true);
assert.equal(restored.status, 200);
assert.equal((await restored.json()).project.status, 'ready_for_review');
const after = await get(`/api/studio/projects/${projectId}/preview`, true);
assert.deepEqual(await after.json(), before);
const restoredArchive = await get(`/api/studio/projects/${projectId}/archive`, true);
assert.equal(restoredArchive.status, 200);
const hash = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(hash(new Uint8Array(await restoredArchive.arrayBuffer())), hash(bytes));
console.log('Docker dashboard, proxy authentication, controlled source build, preview, ZIP and restart persistence passed. No model calls.');
