import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { createOrchestrator } from '../factory.js';
import type { Orchestrator } from '../core/Orchestrator.js';
import type { TaskResult } from '../core/types.js';
import { buildStaticProject, createSourceArchive, type BuildReport, type SourceFile } from './workspace.js';
import { writeJsonSnapshot } from './atomicJson.js';
import { REPAIR_INSTRUCTIONS, STUDIO_CONSTRAINTS, STUDIO_DELIVERABLE } from './shared/prompts.js';
import { dependencyNote, unsupportedDependencies } from './shared/dependencies.js';
import { appendStudioEvent, summarizeErrors, type StudioEventInput } from './events.js';

export type StudioRecord = {
  projectId: string; description: string; status: 'queued' | 'running' | 'ready_for_review' | 'failed' | 'cancelled';
  jobId?: string; phase?: string; stoppedPhase?: string;
  strategy?: 'manager-coder' | 'coder-only';
  ownerPid?: number; ownerHost?: string;
  startedAt: string; finishedAt?: string; plan?: TaskResult;
  rounds: { round: number; code: TaskResult; build?: BuildReport }[];
  previewFile?: string; archiveFile?: string; error?: string;
  repair?: { parentProjectId: string; previewFile: string; errors: string[] } & ({ diagnosticId: string; browserRunId?: never } | { browserRunId: string; testPlanId: string; diagnosticId?: never });
  revision?: { parentProjectId: string; previewFile: string; changeRequest: string };
  retry?: { parentProjectId: string };
};

const constraints = STUDIO_CONSTRAINTS;
const repairInstructions = REPAIR_INSTRUCTIONS;

export function validateProjectId(projectId: string): void {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(projectId)) throw new Error('Invalid project ID');
}

export async function saveStudioRecord(root: string, record: StudioRecord): Promise<void> {
  validateProjectId(record.projectId);
  await writeJsonSnapshot(join(root, record.projectId, 'project.json'), record);
}

/** Three build attempts maximum. A real compiler failure supplies the next revision request. */
export async function runSoftwareStudio(options: {
  description: string; root: string; signal?: AbortSignal; orchestrator?: Orchestrator;
  projectId?: string; jobId?: string;
  strategy?: StudioRecord['strategy'];
  repair?: StudioRecord['repair']; initialFiles?: SourceFile[];
  revision?: StudioRecord['revision']; changeRequests?: string[];
  retry?: StudioRecord['retry'];
  onProgress?: (phase: string, round?: number) => void;
}): Promise<StudioRecord> {
  if (!options.description.trim() || options.description.length > 4000) throw new Error('Provide a project description of 1–4000 characters');
  const projectId = options.projectId || randomUUID();
  validateProjectId(projectId);
  const directory = join(options.root, projectId);
  await mkdir(directory, { recursive: true });
  const record: StudioRecord = { projectId, jobId: options.jobId, strategy: options.strategy || 'manager-coder', ...(!options.jobId ? { ownerPid: process.pid, ownerHost: hostname() } : {}), description: options.description, repair: options.repair, revision: options.revision, retry: options.retry, status: 'running', startedAt: new Date().toISOString(), rounds: [] };
  const save = () => saveStudioRecord(options.root, record);
  const emit = (event: StudioEventInput) => appendStudioEvent(options.root, projectId, event);
  const progress = async (phase: string, round?: number) => {
    record.phase = phase;
    await save();
    if (phase !== 'ready_for_review') await emit({ type: 'phase', round, data: { phase } });
    options.onProgress?.(phase, round);
  };
  await save();
  try {
    options.signal?.throwIfAborted();
    const orchestrator = options.orchestrator || createOrchestrator('SoftwareStudio');
    const task = { id: projectId, type: 'software_creation', description: options.description };
    const requestNotes = [...(options.repair ? [repairInstructions, ...options.repair.errors] : []), ...(options.changeRequests?.length ? ['Update the existing source to meet these successive change requests; preserve unaffected behavior.', ...options.changeRequests] : [])];
    if (record.strategy === 'manager-coder') {
      await progress('planning');
      record.plan = await orchestrator.runTask({ ...task, context: { constraints, repair: options.repair, changeRequests: options.changeRequests, ...(options.repair ? { previousFiles: options.initialFiles || [], revisionNotes: requestNotes } : {}), deliverable: STUDIO_DELIVERABLE } }, 'manager', { signal: options.signal });
      await save();
      if (record.plan.status !== 'success') throw new Error(record.plan.reasoning || 'Planning failed');
      await emit({ type: 'plan_ready', data: { projectName: record.plan.output?.projectName } });
    }
    await writeFile(join(directory, 'requirements.md'), `# Requirements\n\n${options.description}\n\n${(options.changeRequests || []).map((request, index) => `## Change ${index + 1}\n\n${request}`).join('\n\n')}\n\n${constraints}\n\nBrowser acceptance is pending.\n`);
    await writeFile(join(directory, 'design.md'), record.plan ? `# Project plan\n\n\`\`\`json\n${JSON.stringify(record.plan.output, null, 2)}\n\`\`\`\n` : '# Project plan\n\nCoder-only benchmark baseline: no Manager plan.\n');
    let previousFiles: SourceFile[] = options.initialFiles || [];
    let revisionNotes: string[] = requestNotes;
    for (let round = 1; round <= 3; round++) {
      options.signal?.throwIfAborted();
      await progress('coding', round);
      const code = await orchestrator.runTask({ ...task, id: `${projectId}-code-${round}`, context: {
        language: 'javascript', constraints, plan: record.plan?.output, previousFiles, revisionNotes,
      } }, 'coder', { signal: options.signal });
      const attempt: StudioRecord['rounds'][number] = { round, code };
      record.rounds.push(attempt);
      await save();
      if (code.status !== 'success') throw new Error(code.reasoning || 'Code generation failed');
      await emit({ type: 'code_ready', round, data: { files: code.output.files?.length ?? 0 } });
      // Real packages are unsupported; like a compile error, the reason goes back to the Coder.
      const dependencies = unsupportedDependencies(code.output.dependencies);
      await progress('building', round);
      attempt.build = dependencies.length
        ? { status: 'failed', tool: 'esbuild', errors: [dependencyNote(dependencies)], checkedFiles: [], browserVerified: false }
        : await buildStaticProject(code.output.files, join(directory, `v${round}`), options.signal);
      await save();
      await emit(attempt.build.status === 'passed' ? { type: 'build_passed', round } : { type: 'build_failed', round, data: { errors: summarizeErrors(attempt.build.errors) } });
      if (attempt.build.status === 'passed') {
        options.signal?.throwIfAborted();
        const preview = await readFile(join(directory, `v${round}`, 'dist', 'index.html'), 'utf-8');
        const archive = createSourceArchive(code.output.files, preview, attempt.build);
        await writeFile(join(directory, 'source.zip'), archive);
        options.signal?.throwIfAborted();
        record.previewFile = `v${round}/dist/index.html`;
        record.archiveFile = 'source.zip';
        record.status = 'ready_for_review';
        await progress('ready_for_review', round);
        await emit({ type: 'ready_for_review', round, data: { previewFile: record.previewFile } });
        break;
      }
      previousFiles = code.output.files;
      revisionNotes = [...requestNotes, ...attempt.build.errors];
    }
    if (record.status === 'running') throw new Error('Build failed after three attempts');
  } catch (error) {
    const reason = options.signal?.aborted ? options.signal.reason : error;
    record.status = options.signal?.aborted && reason?.name !== 'TimeoutError' ? 'cancelled' : 'failed';
    record.stoppedPhase = record.phase;
    record.phase = record.status;
    record.error = reason instanceof Error ? reason.message : String(reason);
  } finally {
    record.finishedAt = new Date().toISOString();
    await save();
    if (record.status === 'failed' || record.status === 'cancelled') await emit({ type: record.status, data: { stoppedPhase: record.stoppedPhase, error: record.error?.slice(0, 300) } });
  }
  return record;
}
