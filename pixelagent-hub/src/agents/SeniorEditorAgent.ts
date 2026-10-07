import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';
import { z } from 'zod';

const reviewSchema = z.object({
  verdict: z.enum(['approved', 'rejected']),
  score: z.number().min(0).max(100),
  issues: z.array(z.object({ type: z.string(), severity: z.string(), detail: z.string() })),
  requiredChanges: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export class SeniorEditorAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'senior_editor',
        name: 'Senior Editor',
        role: 'quality_gatekeeper',
        capabilities: ['review', 'reject', 'request_changes', 'enforce_standards'],
        systemPrompt: 'You are a senior editor with high standards. If content is not ready, reject it with specific required changes. Output only valid JSON.',
        timeout: 180_000,
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { context, description } = task;
    const draft = context?.draft;
    const round = context?.round || 1;

    if (!draft) {
      return this.createResult(task.id, 'failed', null, 'No draft received');
    }

    return this.llmOrMock(
      task,
      () => ({
        system: this.config.systemPrompt || 'You are a senior editor.',
        user: [
          `Review the following draft and return JSON with:`,
          `verdict: "approved" | "rejected"`,
          `score: 0-100`,
          `issues: [{type, severity, detail}]`,
          `requiredChanges: string[]`,
          `suggestions: string[]`,
          `nextAction: "forward_to_director" | "revise"`,
          '',
          `Round: ${round}`,
          `Topic: ${description}`,
          `Draft content:`,
          String(draft?.content || JSON.stringify(draft)).slice(0, 4000),
        ].join('\n'),
      }),
      (content) => {
        const parsed = reviewSchema.parse(this.extractJson(content));
        return {
          verdict: parsed.verdict || 'rejected',
          score: parsed.score,
          issues: parsed.issues || [],
          requiredChanges: parsed.requiredChanges || [],
          suggestions: parsed.suggestions || [],
          nextAction: parsed.verdict === 'approved' ? 'forward_to_director' : 'revise',
        };
      },
      (output) => output.verdict === 'approved' ? 'success' : 'partial'
    );
  }

  private extractJson(raw: string): Record<string, any> {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
      }
      throw new Error('Invalid editor JSON response');
    }
  }
}
