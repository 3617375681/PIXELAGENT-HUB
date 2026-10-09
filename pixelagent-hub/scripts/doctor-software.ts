import 'dotenv/config';
import { checkStudioEnvironment } from '../src/studio/doctor.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--browser', '--json'].includes(arg))) {
    console.error('Usage: npm run studio:doctor -- [--browser] [--json]');
    process.exitCode = 1;
    return;
  }
  const checks = await checkStudioEnvironment({ env: process.env, cwd: process.cwd(), browser: args.includes('--browser') });
  const failed = checks.some((check) => check.status === 'fail');
  if (args.includes('--json')) console.log(JSON.stringify({ checks, failed }, null, 2));
  else {
    for (const check of checks) console.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.message}`);
    console.log('Local environment checks only; no model requests, application acceptance or server connectivity checks.');
  }
  process.exitCode = failed ? 1 : 0;
}

void main().catch(() => {
  console.error('Environment check failed. Verify local installation and rerun npm run studio:doctor.');
  process.exitCode = 1;
});
