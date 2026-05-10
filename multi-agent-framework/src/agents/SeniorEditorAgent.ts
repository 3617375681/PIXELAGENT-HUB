import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class SeniorEditorAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'senior_editor',
        name: 'Senior Editor',
        role: 'quality_gatekeeper',
        capabilities: ['review', 'reject', 'request_changes', 'enforce_standards'],
        systemPrompt: 'You are a senior editor with high standards. If content is not ready, reject it with specific required changes. Output only valid JSON.',
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
        const parsed = this.extractJson(content);
        return {
          verdict: parsed.verdict || 'rejected',
          score: Number(parsed.score) || 65,
          issues: parsed.issues || [],
          requiredChanges: parsed.requiredChanges || [],
          suggestions: parsed.suggestions || [],
          nextAction: parsed.nextAction || (parsed.verdict === 'approved' ? 'forward_to_director' : 'revise'),
        };
      },
      (reason) => {
        const text: string = String(draft?.content || '');
        const score = Math.max(30, Math.min(92, Math.floor(text.length / 45)));
        const isPass = round >= 2 && score >= 72;
        return this.createResult(
          task.id,
          isPass ? 'success' : 'partial',
          isPass
            ? {
                verdict: 'approved',
                score: 88,
                issues: [{ type: 'polish', severity: 'low', detail: 'Ending could be stronger' }],
                suggestions: ['Consider adding a future outlook section'],
                nextAction: 'forward_to_director',
                generatedBy: 'mock',
              }
            : {
                verdict: 'rejected',
                score,
                issues: [
                  { type: 'content', severity: 'high', detail: 'Mock: insufficient evidence' },
                  { type: 'structure', severity: 'medium', detail: 'Mock: logical flow needs work' },
                ],
                requiredChanges: ['Add at least 3 authoritative data points', 'Rewrite section 2 with better transitions'],
                nextAction: 'revise',
                generatedBy: 'mock',
              },
          `mock: ${reason}`
        );
      }
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
      return {};
    }
  }
}
