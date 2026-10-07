import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createOrchestrator } from '../factory.js';
import type { Orchestrator } from '../core/Orchestrator.js';
import type { TaskResult } from '../core/types.js';
import { buildStaticProject, createSourceArchive, type BuildReport, type SourceFile } from './workspace.js';

export type StudioRecord = {
  projectId: string; description: string; status: 'running' | 'ready_for_review' | 'failed' | 'cancelled';
  startedAt: string; finishedAt?: string; plan?: TaskResult;
  rounds: { round: number; code: TaskResult; build?: BuildReport }[];
  previewFile?: string; archiveFile?: string; error?: string;
};

const constraints = 'Create an offline browser app using only HTML, CSS and plain JavaScript. Include root index.html and a README.md. No imports, packages, network requests, external assets, iframes or server code. Draw graphics with CSS or canvas. Use addEventListener instead of inline HTML event handlers. Keep the implementation concise. Provide keyboard-accessible labeled controls. Files must use relative paths and .html/.css/.js/.md extensions.';

/** Three build attempts maximum. A real compiler failure supplies the next revision request. */
export async function runSoftwareStudio(options: {
  description: string; root: string; signal?: AbortSignal; orchestrator?: Orchestrator;
  onProgress?: (phase: string, round?: number) => void;
}): Promise<StudioRecord> {
  if (!options.description.trim() || options.description.length > 4000) throw new Error('Provide a project description of 1–4000 characters');
  const projectId = randomUUID();
  const directory = join(options.root, projectId);
  await mkdir(directory, { recursive: true });
  const record: StudioRecord = { projectId, description: options.description, status: 'running', startedAt: new Date().toISOString(), rounds: [] };
  const save = () => writeFile(join(directory, 'project.json'), JSON.stringify(record, null, 2));
  await save();
  try {
    options.signal?.throwIfAborted();
    const orchestrator = options.orchestrator || createOrchestrator('SoftwareStudio');
    const task = { id: projectId, type: 'software_creation', description: options.description };
    options.onProgress?.('planning');
    record.plan = await orchestrator.runTask({ ...task, context: { constraints, deliverable: 'Runnable browser app, build evidence, source archive; human interaction acceptance follows build.' } }, 'manager', { signal: options.signal });
    await save();
    if (record.plan.status !== 'success') throw new Error(record.plan.reasoning || 'Planning failed');
    await writeFile(join(directory, 'requirements.md'), `# Requirements\n\n${options.description}\n\n${constraints}\n\nBrowser acceptance is pending.\n`);
    await writeFile(join(directory, 'design.md'), `# Project plan\n\n\`\`\`json\n${JSON.stringify(record.plan.output, null, 2)}\n\`\`\`\n`);
    let previousFiles: SourceFile[] = [];
    let revisionNotes: string[] = [];
    for (let round = 1; round <= 3; round++) {
      options.signal?.throwIfAborted();
      options.onProgress?.('coding', round);
      const code = await orchestrator.runTask({ ...task, id: `${projectId}-code-${round}`, context: {
        language: 'javascript', constraints, plan: record.plan.output, previousFiles, revisionNotes,
      } }, 'coder', { signal: options.signal });
      const attempt: StudioRecord['rounds'][number] = { round, code };
      record.rounds.push(attempt);
      await save();
      if (code.status !== 'success') throw new Error(code.reasoning || 'Code generation failed');
      if (code.output.dependencies?.length) throw new Error('Generated project requires unsupported dependencies');
      options.onProgress?.('building', round);
      attempt.build = await buildStaticProject(code.output.files, join(directory, `v${round}`), options.signal);
      await save();
      if (attempt.build.status === 'passed') {
        options.signal?.throwIfAborted();
        const preview = await readFile(join(directory, `v${round}`, 'dist', 'index.html'), 'utf-8');
        const archive = createSourceArchive(code.output.files, preview, attempt.build);
        await writeFile(join(directory, 'source.zip'), archive);
        record.previewFile = `v${round}/dist/index.html`;
        record.archiveFile = 'source.zip';
        record.status = 'ready_for_review';
        options.onProgress?.('ready_for_review', round);
        break;
      }
      previousFiles = code.output.files;
      revisionNotes = attempt.build.errors;
    }
    if (record.status === 'running') throw new Error('Build failed after three attempts');
  } catch (error) {
    record.status = options.signal?.aborted ? 'cancelled' : 'failed';
    record.error = error instanceof Error ? error.message : String(error);
  } finally {
    record.finishedAt = new Date().toISOString();
    await save();
  }
  return record;
}
