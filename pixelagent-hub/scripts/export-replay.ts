/**
 * Records a read-only Studio replay for the static demo (GitHub Pages).
 *
 * Runs the real Studio API in-process, generates one fresh project with the offline mock model
 * (real esbuild compile, real failure → repair loop, real event timing), stages the saved
 * real-model repair evidence, then saves every GET response the dashboard needs as static files.
 *
 *   npx tsx scripts/export-replay.ts [--out dashboard/public/replay] [--browser]
 *
 * --browser also runs the Tester's checks in a sandboxed Chromium (needs Playwright's browser or
 * STUDIO_BROWSER_EXECUTABLE), so the replay includes live browser-check events and screenshots.
 */
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createOrchestrator } from '../src/factory.js';
import { MockProvider } from '../src/core/llm/mock.js';
import { RunRuntime } from '../src/web/runRuntime.js';
import { createStudioApi } from '../src/web/studioApi.js';
// @ts-expect-error -- plain ESM helper shared with portfolio-demo.mjs
import { stageRepairEvidence } from './lib/evidence.mjs';

const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const out = resolve(argument('--out') || 'dashboard/public/replay');
const browser = process.argv.includes('--browser');
const MOCK_DESCRIPTION = '制作一个像素风计数器：+1、-1 和重置按钮，显示当前数值。';

const temp = await mkdtemp(join(tmpdir(), 'pixelagent-replay-'));
const studioRoot = join(temp, 'studio');
// Slow the mock so the recorded timeline has visible, real gaps between stages.
process.env.MOCK_LLM_DELAY_MS ||= '1200';
const runtime = new RunRuntime({ recordsRoot: join(temp, 'runtime'), maxConcurrency: 1, maxQueueSize: 10, maxRetries: 0 });
await runtime.init();
const api = createStudioApi({
  root: studioRoot, runtime, timeoutMs: 120_000,
  browserChecks: { enabled: browser, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined },
  createOrchestrator: () => createOrchestrator('replay-recorder', new MockProvider(), { includeTester: true }),
});
const server = createServer((req, res) => { void (async () => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  await api.handle(req, res, new URL(req.url!, 'http://localhost').pathname, raw ? JSON.parse(raw) : undefined);
})(); });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const call = async (path: string, init?: RequestInit) => {
  const response = await fetch(base + path, init);
  if (!response.ok) throw new Error(`${init?.method || 'GET'} ${path} → ${response.status} ${await response.text()}`);
  return response;
};
const post = async (path: string, body: unknown) => (await call(path, { method: 'POST', body: JSON.stringify(body) })).json();
const waitFor = async (jobId: string) => {
  const deadline = Date.now() + 120_000;
  while (['queued', 'running'].includes(runtime.getJob(jobId)?.status || 'queued') || runtime.isJobActive(jobId)) {
    if (Date.now() > deadline) throw new Error(`Job ${jobId} did not finish`);
    await new Promise((done) => setTimeout(done, 50));
  }
};
const save = async (path: string, data: string | Uint8Array) => {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
};

try {
  const mock = await post('/api/studio/projects', { description: MOCK_DESCRIPTION });
  await waitFor(mock.jobId);
  const plan = await post(`/api/studio/projects/${mock.projectId}/test-plans`, {});
  await waitFor(plan.jobId);
  if (browser) {
    const run = await post(`/api/studio/projects/${mock.projectId}/browser-runs`, { testPlanId: plan.planId });
    await waitFor(run.jobId);
  }
  const evidence: { stage: string; projectId: string }[] = await stageRepairEvidence(studioRoot);

  await rm(out, { recursive: true, force: true });
  const list = await (await call('/api/studio/projects')).json();
  await save('api/studio/projects.json', JSON.stringify(list));
  for (const { projectId, status } of list.projects as { projectId: string; status: string }[]) {
    const prefix = `/api/studio/projects/${projectId}`;
    await save(`${prefix.slice(1)}.json`, await (await call(prefix)).text());
    for (const action of ['events', 'versions', 'test-plans', 'browser-runs', 'diagnostics', 'reviews', ...(status === 'ready_for_review' ? ['preview'] : [])]) {
      await save(`${prefix.slice(1)}/${action}.json`, await (await call(`${prefix}/${action}`)).text());
    }
    const changes = await fetch(`${base}${prefix}/changes`);
    if (changes.ok) await save(`${prefix.slice(1)}/changes.json`, await changes.text());
    if (status === 'ready_for_review') await save(`${prefix.slice(1)}/archive.zip`, new Uint8Array(await (await call(`${prefix}/archive`)).arrayBuffer()));
    const { runs } = await (await call(`${prefix}/browser-runs`)).json() as { runs: { id: string; screenshots: string[] }[] };
    for (const run of runs) for (const name of run.screenshots) {
      await save(`${prefix.slice(1)}/browser-runs/${run.id}/${name}`, new Uint8Array(await (await call(`${prefix}/browser-runs/${run.id}/${name}`)).arrayBuffer()));
    }
  }
  const manifest = {
    recordedAt: new Date().toISOString(),
    hero: mock.projectId,
    cases: [
      { projectId: mock.projectId, kind: 'mock', title: '离线 mock 模型 · 真实编译与返修流程', note: 'Manager/Coder/Tester 使用离线 mock 模型；第 1 轮故意含语法错误，esbuild 报错真实回灌，第 2 轮修复。事件时间为录制时的真实间隔。' },
      ...evidence.map(({ stage, projectId }) => ({ projectId, kind: 'real-model', title: { baseline: '真实模型 · 初始计数器', fault: '真实模型 · 注入故障（+2）', repaired: '真实模型 · 依据浏览器证据返修' }[stage], note: '2026-10-09 真实模型（DeepSeek）实验记录；时间线由保存的记录推算，只有起止时间真实。' })),
    ],
  };
  await save('manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`Replay written to ${out}: ${list.projects.length} projects, hero ${mock.projectId}${browser ? ', with browser checks' : ''}.`);
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temp, { recursive: true, force: true });
}
