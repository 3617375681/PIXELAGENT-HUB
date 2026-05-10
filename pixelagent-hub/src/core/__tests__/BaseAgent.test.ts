import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BaseAgent } from '../BaseAgent.js';
import { MessageBusImpl } from '../MessageBus.js';
import { AgentConfig, Task, TaskResult } from '../types.js';

// Concrete implementation for testing
class TestAgent extends BaseAgent {
  public lastTask: Task | null = null;

  constructor(bus: MessageBusImpl, config?: Partial<AgentConfig>) {
    super({
      id: 'test-agent',
      name: 'Test Agent',
      role: 'tester',
      capabilities: ['test'],
      ...config,
    }, bus);
  }

  async execute(task: Task): Promise<TaskResult> {
    this.lastTask = task;
    return this.createResult(task.id, 'success', { done: true }, 'Test execution');
  }

  // Expose protected method for testing
  public testLlmOrMock(task: Task): Promise<TaskResult> {
    return this.llmOrMock(
      task,
      () => ({ system: 'test', user: 'test' }),
      (content) => ({ parsed: content }),
      (reason) => this.createResult(task.id, 'success', { mocked: true }, reason)
    );
  }
}

describe('BaseAgent', () => {
  let bus: MessageBusImpl;
  let agent: TestAgent;

  beforeEach(() => {
    bus = new MessageBusImpl();
    agent = new TestAgent(bus);
  });

  it('should create an agent with config', () => {
    assert.equal(agent.config.id, 'test-agent');
    assert.equal(agent.config.role, 'tester');
  });

  it('should execute a task', async () => {
    const task: Task = {
      id: 'task-1',
      type: 'test',
      description: 'Test task',
    };

    const result = await agent.execute(task);
    assert.equal(result.status, 'success');
    assert.equal(result.agentId, 'test-agent');
    assert.deepEqual(result.output, { done: true });
  });

  it('should fall back to mock when no LLM provider', async () => {
    const task: Task = {
      id: 'task-2',
      type: 'test',
      description: 'LLM test',
    };

    const result = await agent.testLlmOrMock(task);
    assert.equal(result.status, 'success');
    assert.deepEqual(result.output, { mocked: true });
  });

  it('should handle task cancellation via _exec.signal', async () => {
    // Note: cancellation is checked in BaseAgent.receive(), not execute().
    // When the orchestrator routes a task via the MessageBus, receive() checks
    // the abort signal before calling execute().
    const controller = new AbortController();
    controller.abort();

    const task: Task = {
      id: 'task-3',
      type: 'test',
      description: 'Cancelled task',
      _exec: { signal: controller.signal },
    };

    // To properly test cancellation, we call receive() which is what the
    // MessageBus invokes when delivering a task message.
    let result: TaskResult | null = null;
    // Subscribe to catch the response
    bus.subscribe('orchestrator', (msg) => {
      if (msg.type === 'result') result = msg.payload as TaskResult;
    });

    await agent.receive({
      id: 'msg-3',
      from: 'orchestrator',
      to: 'test-agent',
      type: 'task',
      payload: task,
      timestamp: Date.now(),
    });

    assert.ok(result);
    assert.equal(result!.status, 'failed');
    assert.equal(result!.metadata?.cancelReason, 'abort');
  });

  it('should create result with metadata', () => {
    const result = agent['createResult']('task-x', 'success', { a: 1 }, 'reasoning', { extra: true });
    assert.equal(result.taskId, 'task-x');
    assert.equal(result.status, 'success');
    assert.equal(result.reasoning, 'reasoning');
    assert.ok(result.metadata?.executedAt);
    assert.equal(result.metadata?.agentName, 'Test Agent');
    assert.equal(result.metadata?.extra, true);
  });
});
