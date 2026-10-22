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
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createOrchestrator } from '../src/factory.js';
import { MockProvider } from '../src/core/llm/mock.js';
import { RunRuntime } from '../src/web/runRuntime.js';
import { createStudioApi } from '../src/web/studioApi.js';
import { stageLiveReplay } from './lib/replay-live.js';
// @ts-expect-error -- plain ESM helper shared with portfolio-demo.mjs
import { seriesDirectory, showcaseDirectory, stageBenchmarkProject, stageRepairEvidence } from './lib/evidence.mjs';

const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const out = resolve(argument('--out') || 'dashboard/public/replay');
const browser = process.argv.includes('--browser');
const MOCK_DESCRIPTION = 'Make a pixel-style counter with +1, -1 and Reset buttons that shows the current value.';

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

type SeriesEntry = { caseId: string; strategy: 'manager-coder' | 'coder-only'; projectId: string; status: string; elapsedMs?: number };
/** Stages all 30 generations of the 2026-10-15 strategy comparison, with their recorded events. */
const stageSeries = async () => {
  const titles = new Map((JSON.parse(await readFile(resolve('config/studio-benchmark.json'), 'utf8')) as { id: string; title: string }[]).map((item) => [item.id, item.title]));
  const cases = [];
  for (const run of [1, 2, 3]) {
    const { entries } = JSON.parse(await readFile(join(seriesDirectory, `run${run}`, 'run.json'), 'utf8')) as { entries: SeriesEntry[] };
    for (const entry of entries) {
      const record = await stageBenchmarkProject(studioRoot, join(seriesDirectory, `run${run}`, `${entry.caseId}-${entry.strategy}`));
      if (record.projectId !== entry.projectId) throw new Error(`Benchmark entry ${entry.caseId}/${entry.strategy} does not match its record`);
      const browserRun = (await (await call(`/api/studio/projects/${entry.projectId}/browser-runs`)).json() as { runs: { status: string; checks: { status: string }[] }[] }).runs[0];
      const checks = browserRun ? `${browserRun.checks.filter((check) => check.status === 'passed').length}/${browserRun.checks.length}` : undefined;
      const outcome = record.status !== 'ready_for_review' ? 'not-built' : browserRun?.status === 'passed' ? 'passed' : 'checks-failed';
      cases.push({
        projectId: entry.projectId, kind: 'real-model', group: 'series', caseId: entry.caseId, strategy: entry.strategy, run, outcome, checks,
        title: `${titles.get(entry.caseId) || entry.caseId} · ${entry.strategy === 'manager-coder' ? 'plan + code' : 'code only'} · run ${run}`,
        note: outcome === 'not-built' ? `Generation stopped: ${String(record.error || 'failed').slice(0, 200)}` : `Real DeepSeek run, 2026-10-15. Event gaps are shortened for the replay; browser checks ran later on the saved build.`,
      });
    }
  }
  return cases;
};

type ShowcaseFile = { ideas: { id: string; title: string }[]; entries: { id: string; projectId?: string }[] };
/** Stages every attempt of the real-model showcase (first pass, then retries), failures included. */
const stageShowcase = async () => {
  const cases = [];
  const attempts = new Map<string, number>();
  // retry, retry2, retry3, ... in order
  const retries = (await readdir(showcaseDirectory)).filter((name) => name.startsWith('retry')).sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const directory of [showcaseDirectory, ...retries.map((name) => join(showcaseDirectory, name))]) {
    const showcase = JSON.parse(await readFile(join(directory, 'showcase.json'), 'utf8')) as ShowcaseFile;
    for (const entry of showcase.entries) {
      if (!entry.projectId) continue;
      const record = await stageBenchmarkProject(studioRoot, join(directory, entry.id));
      const attempt = (attempts.get(entry.id) || 0) + 1;
      attempts.set(entry.id, attempt);
      const browserRun = (await (await call(`/api/studio/projects/${record.projectId}/browser-runs`)).json() as { runs: { id: string; status: string; screenshots: string[]; checks: { status: string }[] }[] }).runs[0];
      const outcome = record.status !== 'ready_for_review' ? 'not-built' : browserRun?.status === 'passed' ? 'passed' : 'checks-failed';
      cases.push({
        projectId: record.projectId, kind: 'real-model', group: 'showcase', caseId: entry.id, run: attempt, outcome,
        checks: browserRun ? `${browserRun.checks.filter((check) => check.status === 'passed').length}/${browserRun.checks.length}` : undefined,
        screenshot: browserRun?.screenshots.includes('final.png') ? `/api/studio/projects/${record.projectId}/browser-runs/${browserRun.id}/final.png` : undefined,
        title: `${showcase.ideas.find((idea) => idea.id === entry.id)?.title || entry.id} · attempt ${attempt}`,
        note: outcome === 'not-built' ? `Generation stopped: ${String(record.error || 'failed').slice(0, 200)}` : 'Real DeepSeek run, 2026-10-18, one generation with the visual brief. Event gaps are shortened for the replay.',
      });
    }
  }
  return cases;
};

const stageUnseen = async () => {
  const ideas = (await Promise.all(['live-holdout-h-cases', 'live-holdout-c-cases', 'live-holdout-e-cases', 'live-showcase-cases'].map(async (name) => JSON.parse(await readFile(resolve(`config/${name}.json`), 'utf8')) as { id: string; title: string; description: string }[]))).flat();
  const records = [
    ...['parking', 'elevator', 'match-three-lite', 'invoice', 'pomodoro-cycles', 'library', 'temperature-chart', 'door-lock'].map((id) => ({ path: `2026-10-21-tester-model/chat/${id}-run1.json`, bug: false, note: 'Real DeepSeek run on an idea never used for tuning, 2026-10-21.' })),
    { path: '2026-10-21-holdout/r10-holdout-c/mortgage-run2.json', bug: true, note: 'The checks caught a loan total that is four cents off.' },
    { path: '2026-10-21-holdout/r10-showcase/tip-calc-run1.json', bug: true, note: 'The checks caught $27.775 being rounded down.' },
    { path: '2026-10-21-holdout/r12-holdout-e/typing-run2.json', bug: true, note: 'The checks caught display:flex overriding the hidden attribute.' },
    { path: '2026-10-21-tester-model/v4-pro/invoice-run2.json', bug: true, note: 'The checks caught a runtime error in the invoice app.' },
  ];
  const cases = [];
  for (const { path, bug, note } of records) {
    const caseId = path.split('/').at(-1)!.replace(/-run\d+\.json$/, '');
    const idea = ideas.find((item) => item.id === caseId)!;
    const { projectId, saved } = await stageLiveReplay(studioRoot, path, idea.description);
    cases.push({ projectId, kind: 'real-model', group: 'unseen', caseId, run: saved.run, bug, note,
      title: `${idea.title} · unseen idea`, checks: saved.finalChecks, screenshot: undefined as string | undefined,
      outcome: saved.status !== 'ready_for_review' ? 'not-built' : saved.fullPass ? 'passed' : 'checks-failed',
    });
  }
  return cases;
};

try {
  const mock = await post('/api/studio/projects', { description: MOCK_DESCRIPTION });
  await waitFor(mock.jobId);
  const plan = await post(`/api/studio/projects/${mock.projectId}/test-plans`, {});
  await waitFor(plan.jobId);
  if (browser) {
    const run = await post(`/api/studio/projects/${mock.projectId}/browser-runs`, { testPlanId: plan.planId });
    await waitFor(run.jobId);
    const { runs } = await (await call(`/api/studio/projects/${mock.projectId}/browser-runs`)).json() as { runs: { status: string; error?: string }[] };
    // A missing browser must not be recorded as a failed check in the published demo.
    if (runs[0]?.status !== 'passed') throw new Error(`Mock browser run did not pass: ${runs[0]?.error || runs[0]?.status}`);
  }
  const evidence: { stage: string; projectId: string }[] = await stageRepairEvidence(studioRoot);
  const series = await stageSeries();
  const showcase = await stageShowcase();
  const unseen = await stageUnseen();

  await rm(out, { recursive: true, force: true });
  if (browser) {
    const chromiumBrowser = await chromium.launch({ executablePath: process.env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined });
    try {
      for (const item of unseen) {
        const page = await chromiumBrowser.newPage({ viewport: { width: 800, height: 600 }, serviceWorkers: 'block' });
        try {
          await page.route('**/*', (route) => route.abort());
          const { html } = await (await call(`/api/studio/projects/${item.projectId}/preview`)).json();
          await page.setContent(html, { waitUntil: 'load' });
          item.screenshot = `/screenshots/${item.projectId}.png`;
          await save(item.screenshot.slice(1), await page.screenshot({ animations: 'disabled' }));
        } finally {
          await page.close();
        }
      }
    } finally {
      await chromiumBrowser.close();
    }
  }
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
      { projectId: mock.projectId, kind: 'mock', group: 'featured', title: 'Offline mock model: real compile, repair and browser test', note: 'Agents use the offline mock model. Round 1 contains a deliberate syntax error; the real esbuild error goes back to the Coder and round 2 fixes it. Event timing is as recorded.' },
      ...evidence.map(({ stage, projectId }) => ({ projectId, kind: 'real-model', group: 'featured', title: { baseline: 'Real model: counter', fault: 'Real model: injected +2 bug caught by the browser test', repaired: 'Real model: repaired from the browser evidence' }[stage], note: 'Saved 2026-10-09 run with DeepSeek. The timeline is rebuilt from the saved record; only start and finish times are real.' })),
      ...showcase,
      ...unseen,
      ...series,
    ],
  };
  await save('manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`Replay written to ${out}: ${list.projects.length} projects, hero ${mock.projectId}${browser ? ', with browser checks' : ''}.`);
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temp, { recursive: true, force: true });
}
