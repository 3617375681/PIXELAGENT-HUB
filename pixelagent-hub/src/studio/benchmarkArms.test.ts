import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArms, rotateArms } from './benchmarkArms.js';

const defaults = { strategy: 'manager-coder', model: 'deepseek-chat', testerModel: '' };

test('benchmark arms parse settings and fill defaults', () => {
  assert.deepEqual(parseArms('strategy=coder-only;model=other,tester-model=tester', defaults), [
    { arm: 'strategy-coder-only', strategy: 'coder-only', model: 'deepseek-chat', testerModel: 'deepseek-chat' },
    { arm: 'model-other-testermodel-tester', strategy: 'manager-coder', model: 'other', testerModel: 'tester' },
  ]);
  assert.equal(parseArms('testerModel=tester', defaults)[0].testerModel, 'tester');
  assert.equal(parseArms('model=other', { ...defaults, testerModel: 'default-tester' })[0].testerModel, 'default-tester');
  assert.deepEqual(parseArms(undefined, defaults), [{ arm: 'strategy-manager-coder', ...defaults, testerModel: defaults.model }]);
});

test('benchmark arms reject unknown keys and malformed settings', () => {
  for (const value of ['unknown=x', 'model', 'model=', '']) assert.throws(() => parseArms(value, defaults));
});

test('benchmark arms use safe distinct slugs', () => {
  const arms = parseArms('model=vendor/model;model=vendor/model;model=vendor-model-2', defaults);
  assert.equal(new Set(arms.map(({ arm }) => arm)).size, 3);
  for (const { arm } of arms) assert.match(arm, /^[a-z0-9-]+$/);
});

test('benchmark arms rotate for runs 1 through 3 without mutating the arms', () => {
  const arms = ['A', 'B'];
  assert.deepEqual([1, 2, 3].map((run) => rotateArms(arms, run)), [['A', 'B'], ['B', 'A'], ['A', 'B']]);
  assert.deepEqual([1, 2, 3].map((run) => rotateArms(['A', 'B', 'C'], run)), [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B']]);
  assert.deepEqual(arms, ['A', 'B']);
});
