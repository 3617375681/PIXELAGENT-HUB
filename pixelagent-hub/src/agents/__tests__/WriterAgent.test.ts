import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WriterAgent } from '../WriterAgent.js';
import { MessageBusImpl } from '../../core/MessageBus.js';
import { Task } from '../../core/types.js';

describe('WriterAgent', () => {
  let bus: MessageBusImpl;
  let agent: WriterAgent;

  beforeEach(() => {
    bus = new MessageBusImpl();
    agent = new WriterAgent(bus, null);
  });

  it('should generate content in mock mode', async () => {
    const task: Task = {
      id: 'write-1',
      type: 'write',
      description: 'AI safety overview',
      context: {},
    };

    const result = await agent.execute(task);
    assert.equal(result.status, 'success');
    assert.ok(result.output.content.includes('AI safety overview'));
    assert.ok(result.output.wordCount > 0);
  });

  it('should include revision notes when provided', async () => {
    const task: Task = {
      id: 'write-2',
      type: 'write',
      description: 'Revision test',
      context: {
        revisionNotes: ['Fix intro', 'Add more data'],
      },
    };

    const result = await agent.execute(task);
    assert.ok(result.output.content.includes('Fix intro'));
    assert.ok(result.output.content.includes('Add more data'));
    assert.deepEqual(result.output.appliedRevisionNotes, ['Fix intro', 'Add more data']);
  });

  it('should use research data when provided', async () => {
    const task: Task = {
      id: 'write-3',
      type: 'write',
      description: 'Research-based writing',
      context: {
        researchData: { summary: 'Research says X is important' },
      },
    };

    const result = await agent.execute(task);
    assert.equal(result.status, 'success');
    assert.ok(result.output.content.includes('Research says X is important'));
  });
});
