import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';
import { z } from 'zod';

const codeSchema = z.object({
  language: z.string().min(1),
  files: z.array(z.object({ path: z.string().min(1), content: z.string().min(1), description: z.string() })).min(1),
  explanation: z.string(), dependencies: z.array(z.string()),
});

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
      () => ({
        system: 'You are a professional software engineer. Output valid JSON with: language (string), files (array of {path, content, description}), explanation (string), dependencies (string[]).',
        user: `Task: "${description}"\nLanguage: ${language}\nContext: ${JSON.stringify(context || {})}\n\nGenerate the code as JSON.`,
      }),
      (content) => {
        const parsed = codeSchema.parse(this.extractJson(content));
        return {
          language: parsed.language || language,
          files: parsed.files || [],
          explanation: parsed.explanation || '',
          dependencies: parsed.dependencies || [],
        };
      }
    );
  }

  private extractJson(raw: string): Record<string, any> {
    try {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
      return { raw };
    } catch {
      return { raw };
    }
  }
}
