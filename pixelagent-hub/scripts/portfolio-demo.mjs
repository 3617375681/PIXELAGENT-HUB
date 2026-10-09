import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(app, 'docs/software-studio/benchmark-results/2026-10-09-real-repair-source-context');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'pixelagent-portfolio-'));
try {
  for (const stage of ['baseline', 'fault', 'repaired']) {
    const source = join(evidence, stage);
    const recordBytes = await readFile(join(source, 'project.json'));
    const record = JSON.parse(recordBytes);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.projectId) || record.previewFile !== 'v1/dist/index.html') throw new Error('Unexpected evidence layout');
    const directory = join(root, 'studio', record.projectId);
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
    console.log(`${stage}: /studio/${record.projectId}`);
  }
  console.log('Historical evidence replay: original model results, injected fault and saved browser reports. No new model calls or new approval.');
  if (!process.argv.includes('--check')) {
    await access(join(app, 'dist/src/web/server.js'));
    await access(join(app, 'dashboard/dist/public/index.html'));
    const port = process.env.PORTFOLIO_DEMO_PORT || '3131';
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid PORTFOLIO_DEMO_PORT');
    console.log(`Open http://127.0.0.1:${port}/studio — temporary local demo; generation buttons use mock, not real generation.`);
    const child = spawn(process.execPath, ['dist/src/web/server.js', '--dashboard'], {
      cwd: app, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', ALLOW_UNAUTH_IN_DEV: 'true', LLM_PROVIDER: 'mock', ENABLE_STUDIO_BROWSER_CHECKS: 'false', ENABLE_EMBEDDING: 'false', RECORDS_API_PORT: port, RECORDS_ROOT_OVERRIDE: root, STUDIO_ROOT_OVERRIDE: join(root, 'studio') },
    });
    const stop = () => child.kill();
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try {
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => { process.exitCode = code || 0; resolve(); }); });
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  }
} finally { await rm(root, { recursive: true, force: true }); }
