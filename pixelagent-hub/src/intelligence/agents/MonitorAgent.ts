import { BaseAgent } from '../../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../../core/types.js';
import { ActionExecutionResult, MonitorSummary } from '../core/intelTypes.js';

export class MonitorAgent extends BaseAgent {
  constructor(bus: MessageBus) {
    super(
      {
        id: 'intel_monitor',
        name: 'Monitor',
        role: 'monitor',
        capabilities: ['summarize', 'alert'],
      },
      bus
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const execution = (task.context?.execution || []) as ActionExecutionResult[];
    const summary: MonitorSummary = {
      successActions: execution.filter((x) => x.status === 'success').length,
      failedActions: execution.filter((x) => x.status === 'failed').length,
      skippedActions: execution.filter((x) => x.status === 'skipped').length,
      retryableActions: execution.filter((x) => x.retryable).length,
      message: `completed=${execution.filter((x) => x.status === 'success').length}, failed=${execution.filter((x) => x.status === 'failed').length}`,
    };
    return this.createResult(task.id, 'success', summary, 'monitor_complete');
  }
}

