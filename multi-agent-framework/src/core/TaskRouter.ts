import { Task, TaskResult, Message, PipelineStep, MessageBus, TaskRunControl } from './types.js';

function cancelledResult(taskId: string): TaskResult {
  return {
    taskId,
    agentId: 'system',
    status: 'failed',
    output: null,
    reasoning: 'JOB_CANCELLED',
    metadata: { cancelReason: 'abort' },
  };
}

function isCancelledResult(r: TaskResult | null): boolean {
  return Boolean(r?.metadata && (r.metadata as { cancelReason?: string }).cancelReason === 'abort');
}

export class TaskRouter {
  private bus: MessageBus;

  constructor(bus: MessageBus) {
    this.bus = bus;
  }

  // 发送任务给指定 Agent
  route(task: Task, targetAgentId: string, from: string = 'orchestrator'): void {
    this.bus.send({
      id: `task-${task.id}`,
      from,
      to: targetAgentId,
      type: 'task',
      payload: task,
      timestamp: Date.now(),
    });
  }

  // 广播任务给多个 Agent（并行）
  broadcast(task: Task, agentIds: string[], from: string = 'orchestrator'): void {
    agentIds.forEach(agentId => {
      this.route(task, agentId, from);
    });
  }

  // 串行流水线执行
  async runPipeline(
    initialTask: Task,
    steps: PipelineStep[],
    timeoutMs: number = 60000,
    control?: TaskRunControl
  ): Promise<{ results: TaskResult[]; finalOutput: any }> {
    const signal = control?.signal;
    const emit = control?.emit;
    const results: TaskResult[] = [];
    let currentTask = initialTask;

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      if (signal?.aborted) throw new Error('JOB_CANCELLED');
      const stepTimeoutMs = step.stepTimeoutMs ?? timeoutMs;
      emit?.({ type: 'pipeline_step_start', stepIndex, agentId: step.agentId });
      // 先发送任务，from 设为等待者 ID 以便 Agent 回复到正确地址
      const waiterId = `temp-${currentTask.id}`;
      this.route(currentTask, step.agentId, waiterId);

      const result = await this.waitForResult(waiterId, currentTask.id, stepTimeoutMs, signal);

      if (!result) {
        throw new Error(`Pipeline timeout at step: ${step.agentId}`);
      }
      emit?.({ type: 'pipeline_step_done', stepIndex, agentId: step.agentId, status: result.status });

      if (isCancelledResult(result)) {
        throw new Error('JOB_CANCELLED');
      }

      results.push(result);

      if (result.status === 'failed') {
        throw new Error(`Pipeline failed at step: ${step.agentId}`);
      }

      // 如果有 transform，生成下一个任务
      if (step.transform) {
        const next = step.transform(result, initialTask);
        currentTask = { ...next, _exec: currentTask._exec };
      }
    }

    return {
      results,
      finalOutput: results[results.length - 1]?.output,
    };
  }

  // 等待某个 Agent 返回结果
  private waitForResult(
    waiterId: string,
    taskId: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<TaskResult | null> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finalize = (value: TaskResult | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbortHandler);
        this.bus.unsubscribe(waiterId);
        resolve(value);
      };
      function onAbortHandler(): void {
        finalize(cancelledResult(taskId));
      }
      timer = setTimeout(() => {
        console.error(JSON.stringify({
          level: 'error',
          event: 'task_router.wait_timeout',
          waiterId,
          taskId,
          timeoutMs,
          at: new Date().toISOString(),
        }));
        finalize(null);
      }, timeoutMs);
      if (signal) {
        if (signal.aborted) {
          finalize(cancelledResult(taskId));
          return;
        }
        signal.addEventListener('abort', onAbortHandler, { once: true });
      }

      const handler = (msg: Message) => {
        if (msg.type === 'result') {
          const result = msg.payload as TaskResult;
          if (result.taskId === taskId) {
            finalize(result);
          }
        }
      };

      this.bus.subscribe(waiterId, handler);
    });
  }
}
