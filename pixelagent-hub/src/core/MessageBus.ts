import { Message, MessageBus, AgentConfig, Task, TaskResult } from './types.js';

export class MessageBusImpl implements MessageBus {
  private handlers: Map<string, ((msg: Message) => void)[]> = new Map();
  private errorCount = 0;
  private onError: ((agentId: string, err: unknown) => void) | null = null;

  setErrorHandler(handler: (agentId: string, err: unknown) => void): void {
    this.onError = handler;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  subscribe(agentId: string, handler: (msg: Message) => void): void {
    const existing = this.handlers.get(agentId) || [];
    existing.push(handler);
    this.handlers.set(agentId, existing);
  }

  unsubscribe(agentId: string): void {
    this.handlers.delete(agentId);
  }

  send(message: Message): void {
    const handlers = this.handlers.get(message.to) || [];
    handlers.forEach(h => {
      try {
        h(message);
      } catch (err) {
        this.errorCount++;
        this.onError?.(message.to, err);
        console.error(`[MessageBus] Error delivering to ${message.to}:`, err);
      }
    });
  }

  broadcast(message: Omit<Message, 'to'>): void {
    this.handlers.forEach((handlers, agentId) => {
      handlers.forEach(h => {
        try {
          h({ ...message, to: agentId });
        } catch (err) {
          this.errorCount++;
          this.onError?.(agentId, err);
          console.error(`[MessageBus] Broadcast error to ${agentId}:`, err);
        }
      });
    });
  }
}
