import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { stageRepairEvidence } from './lib/evidence.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(join(tmpdir(), 'pixelagent-portfolio-'));
try {
  for (const { stage, projectId } of await stageRepairEvidence(join(root, 'studio'))) console.log(`${stage}: /studio/${projectId}`);
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
