import { createHash } from 'node:crypto';
import { BaseAgent } from '../../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../../core/types.js';
import { DecisionOutput, Insight, IntelligenceAction, RiskLevel, WorkflowDefinition } from '../core/intelTypes.js';

function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

const riskOrder: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };

export class DecisionAgent extends BaseAgent {
  constructor(bus: MessageBus) {
    super(
      {
        id: 'intel_decision',
        name: 'DecisionMaker',
        role: 'decision_maker',
        capabilities: ['prioritize', 'action_plan'],
      },
      bus
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const workflow = task.context?.workflow as WorkflowDefinition;
    const insight = task.context?.insight as Insight;
    const autoExecuteBelow = workflow.decision.autoExecuteBelow;
    const requiresApproval = riskOrder[insight.risk] > riskOrder[autoExecuteBelow];
    const actions: IntelligenceAction[] = workflow.actions.map((x, idx) => {
      const id = `action-${idx + 1}-${Date.now()}`;
      const fingerprint = `${task.id}|${x.type}|${x.target}|${insight.risk}|${insight.summary}`;
      return {
        id,
        type: x.type,
        target: x.target,
        params: x.params,
        requiresApproval,
        idempotencyKey: hashKey(fingerprint),
      };
    });
    const output: DecisionOutput = {
      summary: `Insight risk=${insight.risk}, actions=${actions.length}`,
      risk: insight.risk,
      requiresApproval,
      actions,
    };
    return this.createResult(task.id, 'success', output, requiresApproval ? 'pending_approval' : 'approved');
  }
}

