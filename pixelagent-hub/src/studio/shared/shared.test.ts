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

test('a leading <think> block from a reasoning model is ignored', () => {
  assert.deepEqual(parseModelObject('<think>\nThe user wants {"a": 0}\n</think>\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelObject('<think></think>{"b":2}'), { b: 2 });
});

test('code output tolerates omitted descriptive fields but not missing files', () => {
  assert.deepEqual(parseCodeOutput({ language: 'javascript', files: [{ path: 'index.html', content: '<p>hi</p>' }] }),
    { language: 'javascript', files: [{ path: 'index.html', content: '<p>hi</p>', description: '' }], explanation: '', dependencies: [] });
  assert.throws(() => parseCodeOutput({ language: 'javascript', files: [] }), /The code did not match the expected format: .*files/);
  assert.throws(() => parseTestPlanOutput({ checks: [], limitations: [] }), /The test plan did not match/);
});

test('test plans keep their checks when limitations are malformed', () => {
  const check = { name: 'Adds one', actions: [], selector: '#count', expected: '1' };
  const parsed = parseTestPlanOutput({ checks: [check], isolation: 'fresh', limitations: [{ note: 'canvas' }, 'x'.repeat(400), ...Array(12).fill('more')] });
  assert.equal(parsed.checks.length, 1);
  assert.deepEqual(parsed.limitations[0], '{"note":"canvas"}');
  assert.equal(parsed.limitations[1].length, 300);
  assert.equal(parsed.limitations.length, 10);
  assert.deepEqual(parseTestPlanOutput({ checks: [check] }).limitations, []);
  assert.throws(() => parseTestPlanOutput({ checks: [], limitations: [] }), /did not match/);
});

test('the tester prompt explains how to set selects and asks for self-contained checks', async () => {
  const { testerPrompt } = await import('./prompts.js');
  assert.match(testerPrompt('x').system, /To choose a <select> option, use an input action/);
  assert.match(testerPrompt('x').system, /sets every input and select it depends on/);
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

test('only real package names count as unsupported dependencies', async () => {
  const { unsupportedDependencies, dependencyNote } = await import('./dependencies.js');
  assert.deepEqual(unsupportedDependencies(['none', 'HTML5', 'CSS3', 'Vanilla JS', 'canvas API', 'localStorage', ' ']), []);
  assert.deepEqual(unsupportedDependencies(['react', 'none', 'lodash@4']), ['react', 'lodash@4']);
  assert.match(dependencyNote(['react']), /Unsupported dependencies: react\..*"dependencies": \[\]/);
});

test('a Tester review only revises a failing check with a valid corrected check of the same name', async () => {
  const { parseTesterReview } = await import('./parse.js');
  const fixed = { name: 'Adds one', actions: [{ type: 'click', selector: '#add' }], selector: '#count', expected: '1' };
  const verdicts = parseTesterReview({ verdicts: [
    { name: 'Adds one', verdict: 'check-wrong', reason: 'never clicked', check: fixed },
    { name: 'Resets', verdict: 'check-wrong', reason: 'no corrected check given' },
    { name: 'Renamed', verdict: 'check-wrong', reason: 'x', check: { ...fixed, name: 'Something else' } },
    { name: 'Not failing', verdict: 'check-wrong', reason: 'ignored', check: { ...fixed, name: 'Not failing' } },
  ] }, ['Adds one', 'Resets', 'Renamed', 'Missing']);
  assert.deepEqual(verdicts.map((item) => item.verdict), ['check-wrong', 'app-wrong', 'app-wrong', 'app-wrong']);
  assert.deepEqual(verdicts[0].check, fixed);
});
