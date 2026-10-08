import test from 'node:test';
import assert from 'node:assert/strict';
import { versionFamily } from './versions.js';
import type { StudioRecord } from './softwareStudio.js';

const record = (projectId: string, parent?: string, change?: string): StudioRecord => ({ projectId, description: 'Fixture', status: 'ready_for_review', startedAt: `2026-01-0${projectId}T00:00:00Z`, rounds: [], ...(parent ? change ? { revision: { parentProjectId: parent, previewFile: 'v1/dist/index.html', changeRequest: change } } : { repair: { parentProjectId: parent, previewFile: 'v1/dist/index.html', diagnosticId: 'fixture', errors: ['fault'] } } : {}) });

test('version family includes repair and revision branches and excludes other projects', () => {
  const family = versionFamily([record('1'), record('2', '1'), record('3', '2', 'Change'), record('4', '1', 'Branch'), record('5')], '3');
  assert.equal(family.rootProjectId, '1');
  assert.deepEqual(family.versions.map((version) => version.projectId), ['1', '2', '3', '4']);
});

test('invalid version ancestry fails explicitly instead of looping or inventing a root', () => {
  assert.throws(() => versionFamily([record('1', '2'), record('2', '1')], '1'), /cycle/);
  assert.throws(() => versionFamily([record('1', 'missing')], '1'), /missing/);
});
