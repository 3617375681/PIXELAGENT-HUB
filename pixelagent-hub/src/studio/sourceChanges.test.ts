import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSources } from './sourceChanges.js';

test('source comparison distinguishes added, removed, modified and unchanged files without normalizing content', () => {
  const result = compareSources([
    { path: 'index.html', content: 'same' }, { path: 'a.js', content: 'old\n' }, { path: 'b.css', content: '' }, { path: 'line.js', content: 'a\r\n' },
  ], [
    { path: 'index.html', content: 'same' }, { path: 'a.js', content: 'new\n' }, { path: 'c.js', content: '' }, { path: 'line.js', content: 'a\n' },
  ]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.files, [
    { path: 'a.js', status: 'modified', before: 'old\n', after: 'new\n' },
    { path: 'b.css', status: 'removed', before: '', after: undefined },
    { path: 'c.js', status: 'added', before: undefined, after: '' },
    { path: 'line.js', status: 'modified', before: 'a\r\n', after: 'a\n' },
  ]);
});
