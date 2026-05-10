import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrchestrator } from '../factory.js';

test('runVote returns winner and score breakdown', async () => {
  const orchestrator = createOrchestrator('VoteTest');
  const result = await orchestrator.runVote('Should we prioritize reliability?', ['researcher', 'writer', 'reviewer'], {
    threshold: 0.6,
  });
  assert.ok(result.winner.agentId);
  assert.ok(result.candidates.length >= 3);
  assert.ok(typeof result.scoreBreakdown[result.winner.agentId] === 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
});
