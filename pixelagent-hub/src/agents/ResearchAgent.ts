import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class ResearchAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'researcher',
        name: 'Researcher',
        role: 'information_gatherer',
        capabilities: ['search', 'summarize', 'fact_check'],
        systemPrompt: 'You are a professional researcher. Your task is to gather, organize, and analyze information, providing structured research reports.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { description, context } = task;

    return this.llmOrMock(
      task,
      () => ({
        system: 'You are a professional researcher. Output valid JSON with fields: topic (string), summary (string), keyPoints (string[]), sources (array of {title, url}).',
        user: `Research topic: "${description}"\nContext: ${JSON.stringify(context || {})}\n\nProvide a structured research report as JSON.`,
      }),
      (content) => {
        const parsed = this.extractJson(content);
        return {
          topic: parsed.topic || description,
          summary: parsed.summary || `Research summary about "${description}"`,
          keyPoints: parsed.keyPoints || ['Key point A', 'Key point B', 'Key point C'],
          sources: parsed.sources || [],
        };
      },
      (reason) =>
        this.createResult(
          task.id,
          'success',
          {
            topic: description,
            summary: `Mock research summary about "${description}" (${reason})`,
            keyPoints: ['Confirmed fact A', 'Background info B', 'Data source C'],
            sources: [
              { title: 'Source 1', url: 'https://example.com/1' },
              { title: 'Source 2', url: 'https://example.com/2' },
            ],
            generatedBy: 'mock',
          },
          `mock: ${reason}`
        )
    );
  }

  private extractJson(raw: string): Record<string, any> {
    try {
      // Try to find JSON block first
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      // Try to find raw JSON
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed);
      return { summary: raw };
    } catch {
      return { summary: raw };
    }
  }
}
