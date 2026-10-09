import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import { createStudioApi } from './studioApi.js';
import { RunRuntime } from './runRuntime.js';
import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { saveStudioRecord } from '../studio/softwareStudio.js';
import { saveBrowserRun } from '../studio/browserRuns.js';
import { createRecordsWebStack } from './recordsWebStack.js';

const contract = load(await readFile(new URL('../../openapi/studio-api.yaml', import.meta.url), 'utf8')) as any;
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
function conforms(schema: any, value: unknown) {
  const validate = ajv.compile({ ...schema, components: contract.components });
  assert.ok(validate(value), JSON.stringify(validate.errors));
}
function responseSchema(operation: any, status: number) {
  const response = operation.responses[String(status)];
  const resolved = response?.$ref ? contract.components.responses[response.$ref.split('/').pop()] : response;
  return resolved?.content['application/json']?.schema;
}

class ContractFixture extends MockProvider {
  override async askWithUsage(system: string, user: string) {
    if (system.includes('project manager')) return super.askWithUsage(system, user);
    const output = system.includes('browser test planner')
      ? { checks: [{ name: 'Initial value', actions: [], selector: 'output', expected: '0' }], limitations: ['Controlled contract fixture'] }
      : { language: 'javascript', files: [{ path: 'index.html', content: '<html><body><output>0</output></body></html>', description: 'Controlled fixture' }], explanation: 'No real model calls', dependencies: [] };
    return { content: JSON.stringify(output), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, model: 'contract-fixture', provider: 'mock' as const };
  }
}

test('Studio OpenAPI validates with resolved references and unique operation IDs', async () => {
  await SwaggerParser.validate(structuredClone(contract));
  const ids: string[] = [];
  for (const [path, item] of Object.entries(contract.paths) as [string, any][]) {
    const names = (item.parameters || []).map((parameter: any) => parameter.name);
    for (const parameter of path.matchAll(/\{([^}]+)\}/g)) assert.ok(names.includes(parameter[1]));
    for (const method of ['get', 'post']) if (item[method]) {
      ids.push(item[method].operationId);
      for (const response of Object.values(item[method].responses) as any[]) {
        const resolved = response.$ref ? contract.components.responses[response.$ref.split('/').pop()] : response;
        const schema = resolved.content['application/json']?.schema;
        if (schema) ajv.compile({ ...schema, components: contract.components });
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(contract.security[0].ApiKey.length, 0);
});

test('actual Studio HTTP responses conform across generation, plans, diagnostics, review, versions, repair and binary delivery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-contract-'));
  const runtime = new RunRuntime({ recordsRoot: root, maxConcurrency: 1, maxQueueSize: 20, maxRetries: 0 });
  await runtime.init();
  const api = createStudioApi({ root, runtime, timeoutMs: 10000, createOrchestrator: () => {
    const provider = new ContractFixture();
    const orchestrator = createOrchestrator('Contract fixture', provider, { includeTester: true });
    return orchestrator;
  } });
  const server = createServer((req, res) => { void (async () => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    await api.handle(req, res, new URL(req.url!, 'http://localhost').pathname, raw ? JSON.parse(raw) : undefined);
  })(); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const template = '/api/studio/projects/{projectId}';
  const covered = new Set<string>();
  async function call(path: string, method = 'get', body?: unknown, id?: string, expected = 200) {
    const operation = contract.paths[path][method];
    if (body !== undefined && operation.requestBody) conforms(operation.requestBody.content['application/json'].schema, body);
    const url = path.replace('{projectId}', id || 'missing');
    const response = await fetch(base + url, { method: method.toUpperCase(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, expected, `${method} ${path}`);
    const schema = responseSchema(operation, expected);
    assert.ok(schema, 'Response must be documented');
    const value = await response.json(); conforms(schema, value);
    covered.add(`${method} ${path}`);
    return value;
  }
  async function wait(jobId: string) {
    const deadline = Date.now() + 10000;
    while (['queued', 'running'].includes(runtime.getJob(jobId)!.status) || runtime.isJobActive(jobId)) {
      assert.ok(Date.now() < deadline, 'Fixture job timeout');
      await new Promise((done) => setTimeout(done, 10));
    }
  }
  try {
    const created = await call('/api/studio/projects', 'post', { description: 'Controlled contract fixture' }, undefined, 202);
    await wait(created.jobId);
    const id = created.projectId;
    await call('/api/studio/projects');
    const detail = await call(template, 'get', undefined, id);
    assert.equal(detail.project.status, 'ready_for_review', detail.project.error);
    await call(`${template}/preview`, 'get', undefined, id);
    const zip = await fetch(`${base}${created.projectUrl}/archive`);
    assert.equal(zip.status, 200); assert.match(zip.headers.get('content-type')!, /application\/zip/);
    assert.equal(new Uint8Array(await zip.arrayBuffer())[0], 80);
    covered.add(`get ${template}/archive`);
    await call(`${template}/cancel`, 'post', undefined, id, 409);
    await call(`${template}/retry`, 'post', undefined, id, 409);
    const plan = await call(`${template}/test-plans`, 'post', {}, id, 202);
    await wait(plan.jobId);
    await call(`${template}/test-plans`, 'get', undefined, id);
    const diagnostic = await call(`${template}/diagnostics`, 'post', { previewFile: detail.project.previewFile, loaded: true, errors: [], testPlanId: plan.planId, checks: [{ name: 'Initial value', status: 'passed', actual: '0' }] }, id, 201);
    await call(`${template}/diagnostics`, 'get', undefined, id);
    await call(`${template}/reviews`, 'post', { previewFile: detail.project.previewFile, diagnosticId: diagnostic.report.id, decision: 'changes_requested', operator: 'Contract fixture', note: 'Controlled declaration, not actual human acceptance', manuallyReviewed: true }, id, 201);
    await call(`${template}/reviews`, 'get', undefined, id);
    await call(`${template}/versions`, 'get', undefined, id);
    await call(`${template}/versions`, 'post', { projectId: id }, id);
    const revision = await call(`${template}/revise`, 'post', { changeRequest: 'Controlled revision' }, id, 202);
    await wait(revision.jobId);
    await call(`${template}/changes`, 'get', undefined, revision.projectId);
    const fault = await call(`${template}/diagnostics`, 'post', { previewFile: detail.project.previewFile, loaded: true, errors: ['Controlled injected observation'] }, id, 201);
    const repaired = await call(`${template}/repair`, 'post', { diagnosticId: fault.report.id }, id, 202);
    await wait(repaired.jobId);
    await call(`${template}/browser-runs`, 'post', { testPlanId: plan.planId }, id, 409);
    const runId = randomUUID();
    await saveBrowserRun(root, { id: runId, projectId: id, testPlanId: plan.planId, previewFile: detail.project.previewFile, previewHash: 'fixture', planHash: 'fixture', jobId: 'fixture', source: 'server-browser', status: 'failed', startedAt: new Date().toISOString(), error: 'Controlled infrastructure failure', viewport: { width: 1280, height: 720 }, checks: [], errors: [], blockedRequests: [], screenshots: ['initial.png'] });
    // Persist fixed PNG bytes separately: no browser execution or verification claim.
    await mkdir(join(root, id, 'browser-runs', runId), { recursive: true });
    await writeFile(join(root, id, 'browser-runs', runId, 'initial.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6N8AAAAASUVORK5CYII=', 'base64'));
    await call(`${template}/browser-runs`, 'get', undefined, id);
    const screenshotPath = `${template}/browser-runs/{runId}/{name}`;
    const image = await fetch(base + screenshotPath.replace('{projectId}', id).replace('{runId}', runId).replace('{name}', 'initial.png'));
    assert.equal(image.status, 200); assert.match(image.headers.get('content-type')!, /image\/png/);
    assert.equal(new Uint8Array(await image.arrayBuffer())[0], 137);
    covered.add(`get ${screenshotPath}`);
    const failedId = randomUUID();
    await saveStudioRecord(root, { projectId: failedId, description: 'Controlled failed generation', status: 'failed', startedAt: new Date().toISOString(), rounds: [] });
    const retried = await call(`${template}/retry`, 'post', undefined, failedId, 202);
    await wait(retried.jobId);
    for (const [path, item] of Object.entries(contract.paths) as [string, any][]) for (const method of ['get', 'post']) if (item[method]) assert.ok(covered.has(`${method} ${path}`), `Missing actual HTTP contract coverage: ${method} ${path}`);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    for (const job of runtime.listJobs(100)) { if (['queued', 'running'].includes(job.status)) runtime.cancelJob(job.jobId); await wait(job.jobId); }
    await rm(root, { recursive: true, force: true });
  }
});

test('the full server enforces the documented header/Bearer authentication before Studio reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-auth-contract-'));
  const key = 'controlled-contract-key';
  const stack = createRecordsWebStack({ NODE_ENV: 'test', ALLOW_UNAUTH_IN_DEV: 'false', RECORDS_API_KEY: key, RECORDS_ROOT_OVERRIDE: root, LLM_PROVIDER: 'mock', ENABLE_EMBEDDING_RETRIEVER: 'false' });
  const server = createServer((req, res) => { void stack.handleRequest(req, res); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio/projects`;
  try {
    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 401);
    conforms(responseSchema(contract.paths['/api/studio/projects'].get, 401), await unauthorized.json());
    for (const headers of [{ 'X-API-Key': key }, { Authorization: `Bearer ${key}` }] as Record<string, string>[]) {
      const response = await fetch(url, { headers }); assert.equal(response.status, 200);
      conforms(contract.paths['/api/studio/projects'].get.responses['200'].content['application/json'].schema, await response.json());
    }
    const guide = await readFile(new URL('../../docs/software-studio/api-integration.md', import.meta.url), 'utf8');
    const example = guide.match(/```js\n([\s\S]*?)\n```/)?.[1];
    assert.ok(example, 'Guide must contain the executable read-only connection example');
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', example], {
      env: { ...process.env, RECORDS_API_URL: url.replace('/api/studio/projects', ''), RECORDS_API_KEY: key, CREATE_STUDIO_PROJECT: 'false' }, timeout: 15000,
    });
    assert.equal(stdout.trim(), '[]');
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
