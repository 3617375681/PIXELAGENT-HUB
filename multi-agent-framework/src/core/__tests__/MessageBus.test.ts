import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MessageBusImpl } from '../MessageBus.js';
import { Message } from '../types.js';

describe('MessageBusImpl', () => {
  let bus: MessageBusImpl;

  beforeEach(() => {
    bus = new MessageBusImpl();
  });

  it('should deliver messages to subscribed handlers', () => {
    const received: Message[] = [];
    bus.subscribe('agent-1', (msg) => received.push(msg));

    const msg: Message = {
      id: 'msg-1',
      from: 'orchestrator',
      to: 'agent-1',
      type: 'task',
      payload: { test: true },
      timestamp: Date.now(),
    };

    bus.send(msg);
    assert.equal(received.length, 1);
    assert.equal(received[0].id, 'msg-1');
  });

  it('should not deliver to unsubscribed agents', () => {
    const received: Message[] = [];
    bus.subscribe('agent-1', (msg) => received.push(msg));
    bus.unsubscribe('agent-1');

    bus.send({
      id: 'msg-2',
      from: 'orchestrator',
      to: 'agent-1',
      type: 'task',
      payload: {},
      timestamp: Date.now(),
    });

    assert.equal(received.length, 0);
  });

  it('should broadcast to all agents', () => {
    const a1: Message[] = [];
    const a2: Message[] = [];
    bus.subscribe('agent-1', (msg) => a1.push(msg));
    bus.subscribe('agent-2', (msg) => a2.push(msg));

    bus.broadcast({
      id: 'broadcast-1',
      from: 'orchestrator',
      type: 'system',
      payload: { alert: true },
      timestamp: Date.now(),
    });

    assert.equal(a1.length, 1);
    assert.equal(a2.length, 1);
    assert.equal(a1[0].to, 'agent-1');
    assert.equal(a2[0].to, 'agent-2');
  });

  it('should isolate errors in handlers', () => {
    bus.subscribe('agent-1', () => {
      throw new Error('Handler error');
    });
    const received: Message[] = [];
    bus.subscribe('agent-2', (msg) => received.push(msg));

    bus.broadcast({
      id: 'test',
      from: 'test',
      type: 'system',
      payload: {},
      timestamp: Date.now(),
    });

    assert.equal(received.length, 1);
    assert.ok(bus.getErrorCount() > 0);
  });

  it('should count errors and call onError', () => {
    let errorArgs: any = null;
    bus.setErrorHandler((agentId, err) => {
      errorArgs = { agentId, err };
    });

    bus.subscribe('bad-agent', () => {
      throw new Error('test error');
    });

    bus.send({
      id: 'err-1',
      from: 'test',
      to: 'bad-agent',
      type: 'task',
      payload: {},
      timestamp: Date.now(),
    });

    assert.equal(bus.getErrorCount(), 1);
    assert.ok(errorArgs);
    assert.equal(errorArgs.agentId, 'bad-agent');
  });
});
