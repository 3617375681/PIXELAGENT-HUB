import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowConfigSchema } from './workflowSchema.js';

test('workflow schema validates minimal config', () => {
  const parsed = workflowConfigSchema.parse({
    version: 1,
    workflows: [
      {
        id: 'w1',
        name: 'W1',
        enabled: true,
        trigger: { type: 'cron', cron: '0 9 * * *' },
        sources: [{ kind: 'search', query: 'abc', maxItems: 3 }],
        analysis: { maxItems: 5, riskThreshold: 'medium' },
        decision: { autoExecuteBelow: 'medium' },
        actions: [{ type: 'send_message', target: 'group', params: { text: 'hi' } }],
      },
    ],
  });
  assert.equal(parsed.workflows.length, 1);
});

test('workflow schema rejects missing trigger field', () => {
  assert.throws(() => {
    workflowConfigSchema.parse({
      version: 1,
      workflows: [
        {
          id: 'w1',
          name: 'W1',
          enabled: true,
          trigger: { type: 'event' },
          sources: [{ kind: 'search', query: 'abc' }],
          analysis: { maxItems: 5, riskThreshold: 'medium' },
          decision: { autoExecuteBelow: 'medium' },
          actions: [{ type: 'send_message', target: 'group', params: {} }],
        },
      ],
    });
  });
});

