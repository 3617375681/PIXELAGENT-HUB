/**
 * Records a small showcase with the configured real model: each idea is generated once through the
 * production Studio API, gets a Tester plan, and is checked in the sandboxed browser. Every outcome is
 * saved (failures included) in the benchmark evidence layout, so `export-replay` can stage it.
 *
 *   npx tsx scripts/record-showcase.ts <out-dir> [--max-tokens 400000] [--only snake,timer]
 *
 * Calls the paid model. Stops before the next idea once reported tokens pass --max-tokens.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOrchestrator } from '../src/factory.js';
import { RunRuntime } from '../src/web/runRuntime.js';
import { createStudioApi } from '../src/web/studioApi.js';

export const SHOWCASE_IDEAS = [
  { id: 'snake', title: 'Snake', description: 'A pixel snake game: arrow keys to move, a score, pause/resume, restart and a game-over screen. Start paused and show how to play.' },
  { id: 'timer', title: 'Pomodoro timer', description: 'A pixel pomodoro timer: 25-minute work and 5-minute break modes, start/pause/reset buttons and a big countdown.' },
  { id: 'tip-calc', title: 'Tip calculator', description: 'A pixel tip calculator: bill amount, tip percent buttons (10, 15, 20) and the number of people; show the tip and the total per person.' },
  { id: 'pet', title: 'Pixel pet', description: 'A pixel virtual pet: a CSS-drawn creature with hunger, happiness and energy bars; Feed, Play and Sleep buttons change the bars, and its mood text updates.' },
  { id: 'memory', title: 'Memory match', description: 'A pixel memory-match game with 8 pairs of colored cards: flip two at a time, matched pairs stay open, count moves, show a win message and a New game button.' },
  { id: 'palette', title: 'Palette generator', description: 'A pixel color palette generator: show 5 color swatches with their hex codes, a Generate button for a new harmonious palette, and a lock toggle on each swatch to keep it.' },
];

const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const out = resolve(process.argv[2] || '');
if (!process.argv[2] || process.argv[2].startsWith('--')) throw new Error('Usage: record-showcase.ts <out-dir> [--max-tokens N]');
const maxTokens = Number(argument('--max-tokens') || 400_000);
const only = argument('--only')?.split(',');
const ideas = SHOWCASE_IDEAS.filter((idea) => !only || only.includes(idea.id));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() !== '';

const temp = await mkdtemp(join(tmpdir(), 'pixelagent-showcase-'));
const studioRoot = join(temp, 'studio');
const runtime = new RunRuntime({ recordsRoot: join(temp, 'runtime'), maxConcurrency: 1, maxQueueSize: 20, maxRetries: 0 });
await runtime.init();
const api = createStudioApi({
  root: studioRoot, runtime, timeoutMs: 480_000,
  browserChecks: { enabled: true, executablePath: process.env.STUDIO_BROWSER_EXECUTABLE?.trim() || undefined },
  createOrchestrator: () => createOrchestrator('showcase-recorder', undefined, { includeTester: true }),
});
const server = createServer((req, res) => { void (async () => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  await api.handle(req, res, new URL(req.url!, 'http://localhost').pathname, raw ? JSON.parse(raw) : undefined);
})(); });
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const post = async (path: string, body: unknown) => {
  const response = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
  if (response.status !== 202) throw new Error(`POST ${path} → ${response.status} ${await response.text()}`);
  return response.json();
};
const get = async (path: string) => (await fetch(base + path)).json();
const waitFor = async (jobId: string) => {
  while (['queued', 'running'].includes(runtime.getJob(jobId)?.status || 'queued') || runtime.isJobActive(jobId)) await new Promise((done) => setTimeout(done, 200));
};
type Usage = { total_tokens?: number };
const tokensOf = (result?: { output?: { llmUsage?: Usage } }) => result?.output?.llmUsage?.total_tokens || 0;

const entries = [];
let spent = 0;
try {
  for (const idea of ideas) {
    if (spent >= maxTokens) { entries.push({ id: idea.id, skipped: `token budget reached (${spent})` }); continue; }
    const started = Date.now();
    const created = await post('/api/studio/projects', { description: idea.description });
    await waitFor(created.jobId);
    const { project } = await get(`/api/studio/projects/${created.projectId}`);
    let tokens = tokensOf(project.plan) + (project.rounds || []).reduce((sum: number, round: { code?: { output?: { llmUsage?: Usage } } }) => sum + tokensOf(round.code), 0);
    const entry: Record<string, unknown> = { id: idea.id, title: idea.title, projectId: created.projectId, status: project.status, buildAttempts: project.rounds?.length || 0, error: project.error };
    if (project.status === 'ready_for_review') {
      const plan = await post(`/api/studio/projects/${created.projectId}/test-plans`, {});
      await waitFor(plan.jobId);
      const planRecord = (await get(`/api/studio/projects/${created.projectId}/test-plans`)).plans.find((item: { id: string }) => item.id === plan.planId);
      tokens += tokensOf(planRecord?.result);
      if (planRecord?.status === 'ready') {
        const run = await post(`/api/studio/projects/${created.projectId}/browser-runs`, { testPlanId: plan.planId });
        await waitFor(run.jobId);
        const browserRun = (await get(`/api/studio/projects/${created.projectId}/browser-runs`)).runs.find((item: { id: string }) => item.id === run.runId);
        Object.assign(entry, { browserStatus: browserRun?.status, checks: `${browserRun?.checks.filter((check: { status: string }) => check.status === 'passed').length}/${browserRun?.checks.length}`, browserError: browserRun?.error });
      } else Object.assign(entry, { browserStatus: 'no-plan', planError: planRecord?.error || planRecord?.result?.reasoning });
    }
    spent += tokens;
    Object.assign(entry, { reportedTokens: tokens, elapsedMs: Date.now() - started });
    entries.push(entry);
    console.log(JSON.stringify(entry));
    await cp(join(studioRoot, created.projectId), join(out, idea.id), { recursive: true, filter: (source) => !/[\\/]v[1-3][\\/](source|build-report\.json)/.test(source) });
  }
} finally {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'showcase.json'), JSON.stringify({ recordedAt: new Date().toISOString(), sourceRevision: revision, sourceDirty: dirty, models: [process.env.LLM_PROVIDER, process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL].filter(Boolean).join('/'), reportedTokens: spent, ideas, entries }, null, 2));
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temp, { recursive: true, force: true });
}
