import { BaseAgent } from '../core/BaseAgent.js';
import type { Task, TaskResult, MessageBus } from '../core/types.js';
import type { LLMProvider } from '../core/llm/provider.js';
import { testerPrompt } from '../studio/shared/prompts.js';
import { parseTestPlanOutput } from '../studio/shared/parse.js';

export class TesterAgent extends BaseAgent {
  constructor(bus: MessageBus, provider?: LLMProvider | null) {
    super({ id: 'tester', name: 'Tester', role: 'browser_test_planner', capabilities: ['test'], systemPrompt: 'Plan observable browser checks from requirements and source.', timeout: 180_000 }, bus, provider);
  }
  async execute(task: Task): Promise<TaskResult> {
    return this.llmOrMock(task, () => testerPrompt(task.description, task.context), (content) => parseTestPlanOutput(JSON.parse(content)));
  }
}
