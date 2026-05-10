import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ResearchAgent } from '../ResearchAgent.js';
import { MessageBusImpl } from '../../core/MessageBus.js';
import { Task } from '../../core/types.js';

describe('ResearchAgent', () => {
  let bus: MessageBusImpl;
  let agent: ResearchAgent;

  beforeEach(() => {
    bus = new MessageBusImpl();
    agent = new ResearchAgent(bus, null); // No LLM provider → uses mock
  });

  it('should return research results in mock mode', async () => {
    const task: Task = {
      id: 'research-1',
      type: 'research',
      description: 'AI safety frameworks',
    };

    const result = await agent.execute(task);
    assert.equal(result.status, 'success');
    assert.equal(result.output.topic, 'AI safety frameworks');
    assert.ok(Array.isArray(result.output.keyPoints));
    assert.ok(result.output.keyPoints.length > 0);
    assert.ok(Array.isArray(result.output.sources));
  });

  it('should include mock metadata', async () => {
    const task: Task = {
      id: 'research-2',
      type: 'research',
      description: 'Test topic',
      context: { detail: 'extra' },
    };

    const result = await agent.execute(task);
    assert.equal(result.output.generatedBy, 'mock');
  });
});
