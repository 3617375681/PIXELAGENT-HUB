import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverCheckRecords, lastCheckVerdicts, compareVerdicts } from './replayChecks.js';

test('record discovery is recursive, sorted, deduplicated and filtered before limiting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'check-discovery-'));
  try {
    await mkdir(join(root, 'nested'));
    for (const file of ['z-run1.json', 'a-run2.json', 'summary.json', 'nested/a-run1.json']) await writeFile(join(root, file), '{}');
    assert.deepEqual(await discoverCheckRecords([root, join(root, 'nested')], 'a-run', 2), [join(root, 'a-run2.json'), join(root, 'nested/a-run1.json')]);
    assert.equal((await discoverCheckRecords([root])).length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('extract only the last run for the final plan, including an unfinished run', () => {
  const events = [
    { type: 'browser_run_started', data: { runId: 'old' } },
    { type: 'browser_check', data: { runId: 'old', name: 'same', passed: false, actual: 'old' } },
    { type: 'test_plan_ready' },
    { type: 'browser_run_started', data: { runId: 'new' } },
    { type: 'browser_check', data: { runId: 'old', name: 'same', passed: false } },
    { type: 'browser_check', data: { runId: 'new', name: 'same', passed: true, actual: 'new' } },
  ];
  assert.deepEqual(lastCheckVerdicts(events), [{ name: 'same', status: 'passed', actual: 'new' }]);
  assert.deepEqual(lastCheckVerdicts([...events, { type: 'test_plan_ready' }]), []);
  assert.deepEqual(lastCheckVerdicts([...events, { type: 'browser_run_started', data: { runId: 'empty' } }]), []);
  assert.deepEqual(lastCheckVerdicts([]), []);
});

test('comparison matches names, ignores actual-only drift and retains both directions and missing checks', () => {
  const recorded = [{ name: 'a', status: 'passed' as const, actual: '1' }, { name: 'b', status: 'failed' as const, actual: '2' }];
  assert.deepEqual(compareVerdicts(recorded, [...recorded].reverse().map((result) => ({ ...result, actual: 'different' }))), []);
  const changes = compareVerdicts(recorded, [{ name: 'b', status: 'passed', actual: '3' }, { name: 'a', status: 'failed', actual: '4' }]);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].recorded?.actual, '1');
  assert.equal(changes[0].replayed?.actual, '4');
  assert.equal(compareVerdicts(recorded, [recorded[0]])[0].replayed, null);
});
