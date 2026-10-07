import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StudioRecord } from '../src/studio/softwareStudio.js';

async function main() {
  const projectId = process.argv[2] || '';
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(projectId)) throw new Error('Usage: npm run studio:preview -- <project UUID>');
  const directory = resolve('records/software-studio', projectId);
  const record: StudioRecord = JSON.parse(await readFile(resolve(directory, 'project.json'), 'utf-8'));
  if (record.status !== 'ready_for_review' || !record.previewFile || !/^v[1-3]\/dist\/index.html$/.test(record.previewFile)) throw new Error('Project has no successful build to preview');
  const html = await readFile(resolve(directory, record.previewFile), 'utf-8');
  const port = Number(process.env.STUDIO_PREVIEW_PORT || 4175);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('STUDIO_PREVIEW_PORT must be a valid port');
  const server = createServer((req, res) => {
    if (req.url !== '/' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    res.end(html);
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Project ${projectId}: http://127.0.0.1:${port}/ — browser acceptance pending`));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
