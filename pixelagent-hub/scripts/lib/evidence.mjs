import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const evidenceDirectory = join(app, 'docs/software-studio/benchmark-results/2026-10-09-real-repair-source-context');
const digest = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Copies the saved real-model repair experiment (baseline → injected fault → repaired) into a Studio
 * root, verifying record identity and preview/plan hashes. Returns [{ stage, projectId }].
 */
export async function stageRepairEvidence(studioRoot) {
  const staged = [];
  for (const stage of ['baseline', 'fault', 'repaired']) {
    const source = join(evidenceDirectory, stage);
    const recordBytes = await readFile(join(source, 'project.json'));
    const record = JSON.parse(recordBytes);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.projectId) || record.previewFile !== 'v1/dist/index.html') throw new Error('Unexpected evidence layout');
    const directory = join(studioRoot, record.projectId);
    const archive = await readFile(join(source, 'source.zip'));
    const preview = unzipSync(archive)['preview/index.html'];
    if (!preview) throw new Error('Evidence archive has no preview');
    await mkdir(join(directory, 'v1/dist'), { recursive: true });
    await writeFile(join(directory, 'project.json'), recordBytes);
    await writeFile(join(directory, 'source.zip'), archive);
    await writeFile(join(directory, record.previewFile), preview);
    for (const suite of stage === 'repaired' ? ['fixed', 'additional'] : ['fixed']) {
      const suiteRoot = join(source, suite);
      const planBytes = await readFile(join(suiteRoot, 'test-plan.json'));
      const runBytes = await readFile(join(suiteRoot, 'browser-run.json'));
      const plan = JSON.parse(planBytes);
      const run = JSON.parse(runBytes);
      if (run.projectId !== record.projectId || plan.projectId !== record.projectId || run.testPlanId !== plan.id
        || run.previewHash !== digest(preview) || run.planHash !== digest(JSON.stringify(plan.result.output))) throw new Error('Evidence identity or content hash mismatch');
      await mkdir(join(directory, 'test-plans'), { recursive: true });
      await mkdir(join(directory, 'browser-runs', run.id), { recursive: true });
      await writeFile(join(directory, 'test-plans', `${plan.id}.json`), planBytes);
      await writeFile(join(directory, 'browser-runs', `${run.id}.json`), runBytes);
      for (const image of run.screenshots) {
        if (!['initial.png', 'final.png'].includes(image)) throw new Error('Unexpected evidence screenshot');
        await copyFile(join(suiteRoot, image), join(directory, 'browser-runs', run.id, image));
      }
    }
    staged.push({ stage, projectId: record.projectId });
  }
  return staged;
}

export const seriesDirectory = join(app, 'docs/software-studio/benchmark-results/2026-10-15-repeated');
export const showcaseDirectory = join(app, 'docs/software-studio/benchmark-results/2026-10-18-showcase');

/**
 * Copies one saved benchmark project (record, events, source, plans and browser runs) into a Studio
 * root, verifying that each browser run belongs to the record and matches its preview and plan.
 */
export async function stageBenchmarkProject(studioRoot, source) {
  const recordBytes = await readFile(join(source, 'project.json'));
  const record = JSON.parse(recordBytes);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.projectId)) throw new Error(`Unexpected evidence layout in ${source}`);
  const directory = join(studioRoot, record.projectId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'project.json'), recordBytes);
  await copyFile(join(source, 'events.jsonl'), join(directory, 'events.jsonl'));
  if (record.status !== 'ready_for_review') return record;
  const archive = await readFile(join(source, 'source.zip'));
  const preview = unzipSync(archive)['preview/index.html'];
  if (!preview || !/^v[1-3]\/dist\/index\.html$/.test(record.previewFile)) throw new Error(`Evidence preview missing in ${source}`);
  await mkdir(join(directory, dirname(record.previewFile)), { recursive: true });
  await writeFile(join(directory, 'source.zip'), archive);
  await writeFile(join(directory, record.previewFile), preview);
  const plans = new Map();
  await mkdir(join(directory, 'test-plans'), { recursive: true });
  for (const name of await readdir(join(source, 'test-plans'))) {
    const bytes = await readFile(join(source, 'test-plans', name));
    plans.set(JSON.parse(bytes).id, JSON.parse(bytes));
    await writeFile(join(directory, 'test-plans', name), bytes);
  }
  for (const name of (await readdir(join(source, 'browser-runs'))).filter((entry) => entry.endsWith('.json'))) {
    const bytes = await readFile(join(source, 'browser-runs', name));
    const run = JSON.parse(bytes);
    const plan = plans.get(run.testPlanId);
    if (run.projectId !== record.projectId || !plan || run.previewHash !== digest(preview)
      || run.planHash !== digest(JSON.stringify({ checks: plan.result.output.checks, limitations: plan.result.output.limitations }))) throw new Error(`Evidence identity or content hash mismatch in ${source}`);
    await mkdir(join(directory, 'browser-runs', run.id), { recursive: true });
    await writeFile(join(directory, 'browser-runs', name), bytes);
    for (const image of run.screenshots) {
      if (!['initial.png', 'final.png'].includes(image)) throw new Error('Unexpected evidence screenshot');
      await copyFile(join(source, 'browser-runs', run.id, image), join(directory, 'browser-runs', run.id, image));
    }
  }
  return record;
}
