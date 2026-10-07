import test from 'node:test';
import assert from 'node:assert/strict';
import { SeniorEditorAgent } from '../SeniorEditorAgent.js';
import { DirectorAgent } from '../DirectorAgent.js';
import { WriterAgent } from '../WriterAgent.js';
import { ReviewerAgent } from '../ReviewerAgent.js';
import { ModeratorAgent } from '../ModeratorAgent.js';
import { MessageBusImpl } from '../../core/MessageBus.js';
import { OpenAIProvider } from '../../core/llm/openai.js';
import { Task } from '../../core/types.js';

const task: Task = { id: 'review-test', type: 'review', description: 'A draft', context: { draft: { content: 'Draft body' } } };

function provider(content: string, status = 200) {
  return new OpenAIProvider({
    apiKey: 'test-key',
    fetchImpl: (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as typeof fetch,
  });
}

test('reviewer validates output and preserves rejection with a zero score', async () => {
  const bus = new MessageBusImpl();
  const rejected = await new ReviewerAgent(bus, provider(JSON.stringify({ verdict: 'rejected', score: 0, issues: [], suggestions: [], requiredChanges: ['Revise'] }))).execute(task);
  assert.equal(rejected.status, 'partial');
  assert.equal(rejected.output.score, 0);
  const invalid = await new ReviewerAgent(bus, provider('{}')).execute(task);
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.output, null);
});

test('moderator rejects empty output and speakers outside the actual team', async () => {
  const moderationTask = { ...task, context: { participants: ['writer'], round: 4, maxRounds: 4 } };
  for (const content of ['{}', JSON.stringify({ nextSpeaker: 'unregistered', guidance: 'Proceed', converged: true, summary: 'Done' })]) {
    const result = await new ModeratorAgent(new MessageBusImpl(), provider(content)).execute(moderationTask);
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
  }
  const valid = await new ModeratorAgent(new MessageBusImpl(), provider(JSON.stringify({ nextSpeaker: 'writer', guidance: 'Continue', converged: false, summary: 'Still discussing' }))).execute(moderationTask);
  assert.equal(valid.status, 'success');
  assert.equal(valid.output.converged, false);
});

for (const verdict of ['approved', 'rejected'] as const) {
  test(`editor distinguishes ${verdict} from call success`, async () => {
    const agent = new SeniorEditorAgent(new MessageBusImpl(), provider(JSON.stringify({
      verdict, score: 0, issues: [], requiredChanges: ['Add evidence'], suggestions: [], nextAction: 'forward_to_director',
    })));
    const result = await agent.execute(task);
    assert.equal(result.status, verdict === 'approved' ? 'success' : 'partial');
    assert.equal(result.output.score, 0);
    assert.equal(result.output.nextAction, verdict === 'approved' ? 'forward_to_director' : 'revise');
  });
}

test('director rejection has no delivery package', async () => {
  const agent = new DirectorAgent(new MessageBusImpl(), provider(JSON.stringify({
    verdict: 'rejected', qualityScore: 0, finalAssessment: 'Needs changes', mustFixBeforeDelivery: ['Fix content'],
  })));
  const result = await agent.execute(task);
  assert.equal(result.status, 'partial');
  assert.equal(result.output.qualityScore, 0);
  assert.equal(result.output.deliveryPackage, undefined);
});

for (const content of ['not JSON', '{}', '{"verdict":"maybe"}']) {
  test(`invalid editor response fails: ${content}`, async () => {
    const result = await new SeniorEditorAgent(new MessageBusImpl(), provider(content)).execute(task);
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
  });
}

test('401 and malformed writer output cannot fall back to mock', async () => {
  for (const llm of [provider('Unauthorized', 401), provider('invalid JSON'), provider('{}'), null]) {
    const result = await new WriterAgent(new MessageBusImpl(), llm).execute(task);
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
  }
});
