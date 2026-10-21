import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { replayFileUrl, type ReplayManifest } from './replay';
import type { StudioProject, StudioTestPlan, StudioBrowserRun, StudioEvent } from '../types/studio';

const root = resolve('public/replay');
const records = [
  ...['parking', 'elevator', 'match-three-lite', 'invoice', 'pomodoro-cycles', 'library', 'temperature-chart', 'door-lock'].map((id) => `2026-10-21-tester-model/chat/${id}-run1.json`),
  '2026-10-21-holdout/r10-holdout-c/mortgage-run2.json',
  '2026-10-21-holdout/r10-showcase/tip-calc-run1.json',
  '2026-10-21-holdout/r12-holdout-e/typing-run2.json',
  '2026-10-21-tester-model/v4-pro/invoice-run2.json',
];
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

// Exported fixtures are ignored by git; run npm run replay:export before this integration check.
it.skipIf(!existsSync(resolve(root, 'manifest.json')))('exports all unseen records with resolvable replay routes and faithful evidence', () => {
  const manifest = json(resolve(root, 'manifest.json')) as ReplayManifest;
  const unseen = manifest.cases.filter((item) => item.group === 'unseen');
  expect(unseen).toHaveLength(12);
  expect(unseen.filter((item) => item.bug)).toHaveLength(4);
  for (const path of records) {
    const id = createHash('sha256').update(path).digest('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const item = unseen.find((entry) => entry.projectId === id)!;
    expect(item).toBeDefined();
    const saved = json(resolve('../docs/software-studio/benchmark-results', path));
    expect(item.caseId).toBe(saved.caseId);
    expect(item.run).toBe(saved.run);
    expect(item.checks).toBe(saved.finalChecks);
    expect(item.outcome).toBe(saved.status !== 'ready_for_review' ? 'not-built' : saved.fullPass ? 'passed' : 'checks-failed');
    const route = (action = '') => {
      const url = replayFileUrl(`/api/studio/projects/${id}${action}`);
      const file = resolve(root, url.split('replay/')[1]);
      expect(existsSync(file), url).toBe(true);
      return file;
    };
    const { project } = json(route()) as { project: StudioProject };
    expect(project.status).toBe(saved.status);
    expect(project.rounds.at(-1)?.code.output?.files).toEqual(saved.files);
    expect(json(route('/events'))).toEqual({ events: saved.events, derived: false });
    for (const action of ['/versions', '/diagnostics', '/reviews']) route(action);
    const { plans } = json(route('/test-plans')) as { plans: StudioTestPlan[] };
    expect(plans[0].result?.output).toMatchObject(saved.plan);
    const { runs } = json(route('/browser-runs')) as { runs: StudioBrowserRun[] };
    const finish = (saved.events as StudioEvent[]).filter((event) => event.type === 'browser_run_finished').at(-1)!;
    expect(runs[0].status).toBe(finish.data!.status);
    expect(`${runs[0].checks.filter((check) => check.status === 'passed').length}/${runs[0].checks.length}`).toBe(item.checks);
    expect(runs[0].checks).toEqual((saved.events as StudioEvent[]).filter((event) => event.type === 'browser_check' && event.data?.runId === finish.data!.runId).map((event) => ({ name: event.data!.name, status: event.data!.passed ? 'passed' : 'failed', actual: event.data!.actual })));
    expect(runs[0].errors).toEqual(finish.data!.error ? [finish.data!.error] : []);
    expect(json(route('/preview')).html).toContain('<html');
    expect(readFileSync(route('/archive')).subarray(0, 2).toString()).toBe('PK');
  }
});
