import test from 'node:test';
import assert from 'node:assert/strict';
import { KimiProvider } from '../kimi.js';
import { WriterAgent } from '../../../agents/WriterAgent.js';
import { MessageBusImpl } from '../../MessageBus.js';
import { Orchestrator } from '../../Orchestrator.js';
import { Task } from '../../types.js';
import { TaskRouter } from '../../TaskRouter.js';

test('agent timeout aborts in-flight model fetch without mutating input task', async () => {
  let requestSignal: AbortSignal | undefined;
  const provider = new KimiProvider({ apiKey: 'test', fetchImpl: ((_url, init) => {
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true });
    });
  }) as typeof fetch });
  const bus = new MessageBusImpl();
  const agent = new WriterAgent(bus, provider);
  agent.config.timeout = 30;
  const orchestrator = new Orchestrator({ name: 'test', agents: [], pipelines: {} }, bus);
  orchestrator.registerAgent(agent);
  const task: Task = { id: 'timeout', type: 'write', description: 'Test' };
  await assert.rejects(orchestrator.runTask(task, 'writer'), /AGENT_TIMEOUT/);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(task._exec, undefined);
});

test('cancellation reaches provider and prevents subsequent execution', async () => {
  const controller = new AbortController();
  let calls = 0;
  const provider = new KimiProvider({ apiKey: 'test', fetchImpl: ((_url, init) => {
    calls++;
    const signal = init?.signal as AbortSignal;
    queueMicrotask(() => controller.abort(new Error('JOB_CANCELLED')));
    return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }) as typeof fetch });
  const bus = new MessageBusImpl();
  const orchestrator = new Orchestrator({ name: 'test', agents: [], pipelines: {} }, bus);
  orchestrator.registerAgent(new WriterAgent(bus, provider));
  const task: Task = { id: 'cancel', type: 'write', description: 'Test' };
  await assert.rejects(orchestrator.runTask(task, 'writer', { signal: controller.signal }), /JOB_CANCELLED/);
  await assert.rejects(orchestrator.runTask(task, 'writer', { signal: controller.signal }), /JOB_CANCELLED/);
  assert.equal(calls, 1);
});

test('pipeline timeout aborts model request and never starts the next step', async () => {
  let requestSignal: AbortSignal | undefined;
  let nextStarted = false;
  const llm = new KimiProvider({ apiKey: 'test', fetchImpl: ((_url, init) => {
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true }));
  }) as typeof fetch });
  const bus = new MessageBusImpl();
  new WriterAgent(bus, llm);
  bus.subscribe('next', () => { nextStarted = true; });
  const router = new TaskRouter(bus);
  await assert.rejects(router.runPipeline({ id: 'pipeline-timeout', type: 'write', description: 'Test' }, [
    { agentId: 'writer', taskType: 'write' }, { agentId: 'next', taskType: 'test' },
  ], 30), /Pipeline timeout/);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(nextStarted, false);
});
