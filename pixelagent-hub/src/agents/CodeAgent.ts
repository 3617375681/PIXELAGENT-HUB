import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';
import { coderPrompt } from '../studio/shared/prompts.js';
import { parseCodeOutput } from '../studio/shared/parse.js';

export class CodeAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'coder',
        name: 'Coder',
        role: 'code_generator',
        capabilities: ['code', 'debug', 'refactor', 'test'],
        systemPrompt: 'You are a professional software engineer. Generate clean, well-documented, production-quality code.',
        timeout: 180_000,
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { description, context } = task;
    const language = context?.language || 'typescript';

    return this.llmOrMock(
      task,
      () => coderPrompt(description, language, context),
      (content) => parseCodeOutput(JSON.parse(content))
    );
  }

}
