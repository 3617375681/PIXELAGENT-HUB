import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class ReviewerAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'reviewer',
        name: 'Reviewer',
        role: 'quality_controller',
        capabilities: ['review', 'evaluate', 'critique', 'suggest'],
        systemPrompt: 'You are a professional reviewer. Evaluate content against quality criteria and provide actionable feedback.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { context, description } = task;
    const draft = context?.draft || context?.previousRound?.[0]?.output || null;

    if (!draft) {
      return this.createResult(task.id, 'failed', null, 'No content to review');
    }

    return this.llmOrMock(
      task,
      () => ({
        system: 'You are a professional content reviewer. Output valid JSON with: verdict ("approved"|"needs_revision"|"rejected"), score (0-100), issues (array of {type, severity, detail}), suggestions (string[]), requiredChanges (string[]).',
        user: `Topic: "${description}"\nDraft content:\n${typeof draft.content === 'string' ? draft.content.slice(0, 3000) : JSON.stringify(draft).slice(0, 3000)}\n\nProvide a structured review as JSON.`,
      }),
      (content) => {
        const parsed = this.extractJson(content);
        return {
          verdict: parsed.verdict || 'needs_revision',
          score: Number(parsed.score) || 72,
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
          requiredChanges: parsed.requiredChanges || [],
        };
      },
      (reason) =>
        this.createResult(
          task.id,
          'success',
          {
            verdict: 'needs_revision',
            score: 72,
            issues: [
              { type: 'content', severity: 'medium', detail: 'Mock: needs more data' },
              { type: 'structure', severity: 'low', detail: 'Mock: transitions could improve' },
            ],
            suggestions: ['Add more data points', 'Improve structure'],
            requiredChanges: ['Add supporting evidence', 'Improve logical flow'],
            generatedBy: 'mock',
          },
          `mock: ${reason}`
        )
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
