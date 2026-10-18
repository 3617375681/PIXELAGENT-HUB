import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCodeOutput, parseModelObject, parseTestPlanOutput } from './parse.js';
import { inlineDocument, utf8ToBase64, validateFiles } from './inline.js';
import { coderPrompt, STUDIO_CONSTRAINTS } from './prompts.js';

test('model replies parse from a fenced block or bare JSON, and must be one object', () => {
  assert.deepEqual(parseModelObject('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelObject(' {"a":2} '), { a: 2 });
  assert.throws(() => parseModelObject('[1,2]'), /Expected a JSON object/);
});

test('code output tolerates omitted descriptive fields but not missing files', () => {
  assert.deepEqual(parseCodeOutput({ language: 'javascript', files: [{ path: 'index.html', content: '<p>hi</p>' }] }),
    { language: 'javascript', files: [{ path: 'index.html', content: '<p>hi</p>', description: '' }], explanation: '', dependencies: [] });
  assert.throws(() => parseCodeOutput({ language: 'javascript', files: [] }), /The code did not match the expected format: .*files/);
  assert.throws(() => parseTestPlanOutput({ checks: [], limitations: [] }), /The test plan did not match/);
});

test('the coder prompt carries the shared constraints unchanged', () => {
  const { user } = coderPrompt('A counter', 'javascript', { constraints: STUDIO_CONSTRAINTS, revisionNotes: [] });
  assert.match(user, /^Task: "A counter"\nLanguage: javascript\nContext: /);
  assert.ok(user.includes(JSON.stringify(STUDIO_CONSTRAINTS)));
  assert.ok(user.includes('"revisionNotes":[]'));
});

test('utf8ToBase64 matches Buffer for multi-byte and large input', () => {
  for (const text of ['', 'é ✓ 漢字 🎮', 'x'.repeat(200_000)]) assert.equal(utf8ToBase64(text), Buffer.from(text).toString('base64'));
});

test('validateFiles rejects unsafe paths and projects without index.html', () => {
  assert.throws(() => validateFiles([{ path: '../evil.js', content: '' }]), /unsafe source path/);
  assert.throws(() => validateFiles([{ path: 'app.js', content: '' }]), /requires index.html/);
});

test('inlineDocument refuses external scripts through any adapter', async () => {
  const doc = { hasEmbeddedDocuments: () => false, scripts: () => [{ src: 'https://cdn.example/x.js', text: '', removeIntegrity() {}, setSrc() {}, setText() {} }], stylesheets: () => [], removeMetaAndLinks() {}, prependToHead() {}, serialize: () => '' };
  await assert.rejects(inlineDocument(doc, new Map(), async (code) => code), /Missing or external script/);
});
