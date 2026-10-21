import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildStaticProject, createSourceArchive, type SourceFile } from '../../src/studio/workspace.js';
import type { StudioEvent } from '../../src/studio/events.js';
import type { StudioRecord } from '../../src/studio/softwareStudio.js';

export type LiveRecord = {
  caseId: string; run: number; model: string; testerModel: string; status: StudioRecord['status']; error?: string;
  fullPass: boolean; finalChecks: string; events: StudioEvent[]; plan: { checks: unknown[]; limitations: string[] };
  rounds: { round: number; build?: 'passed' | 'failed'; errors?: string[] }[]; files: SourceFile[];
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const liveReplayId = (path: string) => hash(path).slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

/** Only the final source and Tester plan survive in PLAY LIVE benchmark records. */
export async function stageLiveReplay(root: string, path: string, description: string) {
  const saved = JSON.parse(await readFile(join('docs/software-studio/benchmark-results', path), 'utf8')) as LiveRecord;
  const projectId = liveReplayId(path);
  const directory = join(root, projectId);
  const last = saved.rounds.at(-1)!;
  const previewFile = `v${last.round}/dist/index.html`;
  const build = await buildStaticProject(saved.files, join(directory, `v${last.round}`));
  if (saved.status === 'ready_for_review' && build.status !== 'passed') throw new Error(`Replay build failed: ${path}: ${build.errors.join('; ')}`);
  const record: StudioRecord = {
    projectId, description, status: saved.status, error: saved.error, strategy: 'manager-coder',
    startedAt: saved.events[0].at, finishedAt: saved.events.at(-1)!.at,
    rounds: saved.rounds.map((round) => ({
      round: round.round,
      code: { taskId: `${projectId}-${round.round}`, agentId: 'coder', status: 'success', output: { ...(round === last ? { files: saved.files } : {}), llmProvider: 'DeepSeek', llmModel: saved.model }, reasoning: round === last ? undefined : 'Earlier source was not saved in this benchmark record.' },
      build: round.build ? { status: round.build, tool: 'esbuild', errors: round.errors || [], checkedFiles: [], browserVerified: false } : undefined,
    })),
    ...(saved.status === 'ready_for_review' ? { previewFile, archiveFile: 'source.zip' } : {}),
  };
  const json = async (file: string, value: unknown) => {
    await mkdir(join(directory, file, '..'), { recursive: true });
    await writeFile(join(directory, file), JSON.stringify(value));
  };
  await json('project.json', record);
  await writeFile(join(directory, 'events.jsonl'), saved.events.map((event) => JSON.stringify(event)).join('\n') + '\n');
  if (saved.status === 'ready_for_review') {
    const html = await readFile(join(directory, previewFile), 'utf8');
    await writeFile(join(directory, 'source.zip'), createSourceArchive(saved.files, html, build));
    const finish = saved.events.filter((event) => event.type === 'browser_run_finished').at(-1);
    if (finish) {
      const start = saved.events.find((event) => event.type === 'browser_run_started' && event.data?.runId === finish.data?.runId)!;
      const planId = String(start.data!.testPlanId);
      const planReady = saved.events.filter((event) => event.type === 'test_plan_ready' && event.seq < start.seq).at(-1)!;
      await json(`test-plans/${planId}.json`, {
        id: planId, projectId, previewFile, jobId: planId, status: 'ready', startedAt: planReady.at, finishedAt: planReady.at,
        result: { taskId: planId, agentId: 'tester', status: 'success', output: saved.plan },
      });
      await json(`browser-runs/${finish.data!.runId}.json`, {
        id: finish.data!.runId, projectId, testPlanId: planId, previewFile, jobId: String(finish.data!.runId), source: 'in-page',
        status: finish.data!.status, startedAt: start.at, finishedAt: finish.at, previewHash: hash(html), planHash: hash(JSON.stringify(saved.plan)),
        checks: saved.events.filter((event) => event.type === 'browser_check' && event.data?.runId === finish.data!.runId).map((event) => ({ name: event.data!.name, status: event.data!.passed ? 'passed' : 'failed', actual: event.data!.actual })),
        errors: finish.data!.error ? [finish.data!.error] : [], blockedRequests: [], screenshots: [],
      });
    }
  }
  return { projectId, saved };
}
