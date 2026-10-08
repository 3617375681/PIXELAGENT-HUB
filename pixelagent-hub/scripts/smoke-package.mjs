import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const api = await import(pathToFileURL(resolve(manifest.main)).href);
const orchestrator = api.createOrchestrator('package-smoke', new api.MockProvider());
assert.ok(orchestrator.getAgentList().length > 0);
const response = await new api.MockProvider().ask('You are a writer', 'Write a short greeting');
assert.ok(typeof response === 'string' && response.length > 0);
await readFile(manifest.types, 'utf8');
const help = execFileSync(process.execPath, [resolve(manifest.bin.pixelagent), '--help'], { encoding: 'utf8', timeout: 10000 });
assert.match(help, /PixelAgent Hub CLI/);
assert.match(help, /Usage:/);
console.log('Compiled package import, offline provider, declarations and CLI help passed.');
