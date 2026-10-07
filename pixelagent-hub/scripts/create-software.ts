import 'dotenv/config';
import { resolve } from 'node:path';
import { runSoftwareStudio } from '../src/studio/softwareStudio.js';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('User cancelled')));
const timer = setTimeout(() => controller.abort(new Error('Software creation exceeded 8 minutes')), 480_000);

async function main() {
  const description = process.argv.slice(2).join(' ');
  if (!description) throw new Error('Usage: npm run studio:create -- "Describe a browser app"');
  const root = resolve('records/software-studio');
  const result = await runSoftwareStudio({
    description, root, signal: controller.signal,
    onProgress: (phase, round) => console.log(JSON.stringify({ phase, round })),
  });
  console.log(JSON.stringify({ projectId: result.projectId, status: result.status, directory: resolve(root, result.projectId), error: result.error }, null, 2));
  if (result.status !== 'ready_for_review') process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => clearTimeout(timer));
