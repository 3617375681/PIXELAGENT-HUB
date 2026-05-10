import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpWeightsFromMetric, defaultScorerWeights, scoreChunk } from './retrievalScorer.js';

test('scoreChunk combines cosine and length', () => {
  const w = defaultScorerWeights();
  const a = scoreChunk(w, 0.9, 100);
  const b = scoreChunk(w, 0.9, 10);
  assert.ok(a > b);
});

test('bumpWeightsFromMetric nudges when metric is low', () => {
  const w = defaultScorerWeights();
  const next = bumpWeightsFromMetric(w, 0.2);
  assert.ok(next.logChunkLen >= w.logChunkLen);
});
