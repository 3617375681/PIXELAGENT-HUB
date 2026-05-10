import { BaseAgent } from '../../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../../core/types.js';
import { ActionExecutionResult, DecisionOutput } from '../core/intelTypes.js';
import { ActionProviderRegistry } from '../core/actionAdapter.js';
import { IntelligenceRunStore } from '../core/runStore.js';

export class ExecutorAgent extends BaseAgent {
  constructor(
    bus: MessageBus,
    private readonly providers: ActionProviderRegistry,
    private readonly store: IntelligenceRunStore
  ) {
    super(
      {
        id: 'intel_executor',
        name: 'Executor',
        role: 'executor',
        capabilities: ['execute_action'],
      },
      bus
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const decision = task.context?.decision as DecisionOutput;
    const runId = String(task.context?.runId || task.id);
    const provider = this.providers.get();
    const output: ActionExecutionResult[] = [];

    for (const action of decision.actions) {
      if (this.store.isActionProcessed(action.idempotencyKey)) {
        output.push({
          actionId: action.id,
          type: action.type,
          status: 'skipped',
          retryable: false,
          message: 'skipped_by_idempotency',
        });
        continue;
      }
      const r = await provider.execute(action);
      output.push(r);
      if (r.status === 'success') this.store.markActionProcessed(action.idempotencyKey, runId);
    }

    return this.createResult(task.id, 'success', output, `Executed ${output.length} actions`);
  }
}

