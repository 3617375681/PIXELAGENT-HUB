import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalToolProvider } from './localToolProvider.js';

test('local_read_file rejects path traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nanoclaw-'));
  try {
    const p = new LocalToolProvider({ rootDir: dir, shellAllowlist: [] });
    const r = await p.execute({
      id: 'a1',
      type: 'local_read_file',
      target: '',
      params: { path: '../outside' },
      idempotencyKey: 'k1',
      requiresApproval: false,
    });
    assert.equal(r.status, 'failed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('local_write_file then read roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nanoclaw-'));
  try {
    const p = new LocalToolProvider({ rootDir: dir, shellAllowlist: [] });
    const w = await p.execute({
      id: 'a2',
      type: 'local_write_file',
      target: '',
      params: { path: 'notes/hello.txt', content: 'ping' },
      idempotencyKey: 'k2',
      requiresApproval: false,
    });
    assert.equal(w.status, 'success');
    const body = await readFile(join(dir, 'notes/hello.txt'), 'utf-8');
    assert.equal(body, 'ping');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
