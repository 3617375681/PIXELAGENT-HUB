import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';
import { managerPrompt } from '../studio/shared/prompts.js';
import { parsePlanOutput } from '../studio/shared/parse.js';

export class ManagerAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'manager',
        name: 'Manager',
        role: 'project_planner',
        capabilities: ['plan', 'decompose', 'prioritize', 'assign'],
        systemPrompt: 'You are a project manager. Break down complex tasks into actionable steps with clear assignments.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { description, context } = task;

    return this.llmOrMock(
      task,
      () => managerPrompt(description, context),
      (content) => parsePlanOutput(JSON.parse(content))
    );
  }

}
