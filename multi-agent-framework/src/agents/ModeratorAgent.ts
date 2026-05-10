import { BaseAgent } from '../core/BaseAgent.js';
import { MessageBus, Task, TaskResult } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class ModeratorAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'moderator',
        name: 'Moderator',
        role: 'discussion_moderator',
        capabilities: ['select_next_speaker', 'summarize_progress', 'enforce_goal'],
        systemPrompt: 'You are a discussion moderator. Keep the conversation on track and productive.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { context } = task;
    const participants: string[] = Array.isArray(context?.participants) ? context.participants : ['researcher', 'writer', 'reviewer'];
    const round = Number(context?.round || 1);
    const maxRounds = Number(context?.maxRounds || 4);
    const previousMessages: string = Array.isArray(context?.conversation)
      ? context.conversation.map((t: any) => `${t.speakerRole}: ${t.message}`).join('\n').slice(-2000)
      : '';

    return this.llmOrMock(
      task,
      () => ({
        system: 'You are a professional discussion moderator. Output valid JSON with: nextSpeaker (string, choose from participants list), guidance (string), converged (boolean), summary (string).',
        user: [
          `Round ${round}/${maxRounds}. Available speakers: [${participants.join(', ')}].`,
          previousMessages ? `Previous conversation:\n${previousMessages}` : '',
          `Choose the next speaker and provide guidance. Return JSON.`,
        ].join('\n'),
      }),
      (content) => {
        const parsed = this.extractJson(content);
        return {
          nextSpeaker: parsed.nextSpeaker || participants[(round - 1) % participants.length],
          guidance: parsed.guidance || `Round ${round}: please speak and cite evidence.`,
          converged: parsed.converged === true || round >= maxRounds,
          summary: parsed.summary || '',
        };
      },
      (reason) => {
        const idx = (round - 1) % participants.length;
        return this.createResult(
          task.id,
          'success',
          {
            nextSpeaker: participants[idx],
            guidance: `Round ${round}: ${participants[idx]}, please speak and cite evidence.`,
            converged: round >= maxRounds,
            generatedBy: 'mock',
          },
          `mock (${reason}): next speaker = ${participants[idx]}`
        );
      }
    );
  }

  private extractJson(raw: string): Record<string, any> {
    try {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
      return {};
    } catch {
      return {};
    }
  }
}
