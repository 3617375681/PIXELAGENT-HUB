import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class DirectorAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'director',
        name: 'Director',
        role: 'final_approver',
        capabilities: ['final_review', 'approve', 'reject', 'strategic_judgment'],
        systemPrompt: 'You are the content director. You have final say on whether content is ready for delivery. Output only valid JSON.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { context } = task;
    const history = context?.reviewHistory || [];
    const finalDraft = context?.draft;
    const totalRounds = history.length;

    return this.llmOrMock(
      task,
      () => ({
        system: this.config.systemPrompt || 'You are the content director.',
        user: [
          `Decide if this content is ready for delivery. Return JSON with:`,
          `verdict: "approved_for_delivery" | "rejected"`,
          `qualityScore: 0-100`,
          `finalAssessment: string`,
          `mustFixBeforeDelivery: string[]`,
          '',
          `Total review rounds: ${totalRounds}`,
          `Review history:`,
          JSON.stringify(history.map((x: any) => ({ status: x.status, reasoning: x.reasoning }))).slice(0, 2000),
          '',
          `Final draft:`,
          String(finalDraft?.content || '').slice(0, 3000),
        ].join('\n'),
      }),
      (content) => {
        const parsed = this.extractJson(content);
        const approved = parsed.verdict === 'approved_for_delivery';
        return {
          verdict: approved ? 'approved_for_delivery' : 'rejected',
          qualityScore: Number(parsed.qualityScore) || (approved ? 88 : 55),
          finalAssessment: parsed.finalAssessment || (approved ? 'Ready for delivery' : 'Not ready'),
          totalRounds,
          deliveryPackage: approved ? {
            content: finalDraft,
            qualityReport: { rounds: totalRounds, score: parsed.qualityScore || 88 },
            recommendedAction: 'Deliver to user',
          } : undefined,
          mustFixBeforeDelivery: parsed.mustFixBeforeDelivery || [],
        };
      },
      (reason) => {
        const contentLength = String(finalDraft?.content || '').length;
        const meetsStandard = totalRounds >= 2 && contentLength >= 1200;
        return this.createResult(
          task.id,
          meetsStandard ? 'success' : 'failed',
          meetsStandard
            ? {
                verdict: 'approved_for_delivery',
                qualityScore: 90,
                totalRounds,
                finalAssessment: 'Content is solid, logical, and ready for delivery',
                deliveryPackage: {
                  content: finalDraft,
                  qualityReport: { rounds: totalRounds, score: 90 },
                  recommendedAction: 'Deliver to user',
                },
                generatedBy: 'mock',
              }
            : {
                verdict: 'rejected',
                reason: 'Content does not meet delivery standards',
                decision: 'Send back to team',
                totalRounds,
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
