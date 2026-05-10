import { BaseAgent } from '../core/BaseAgent.js';
import { Task, TaskResult, MessageBus } from '../core/types.js';
import { LLMProvider } from '../core/llm/provider.js';

export class WriterAgent extends BaseAgent {
  constructor(bus: MessageBus, llmProvider?: LLMProvider | null) {
    super(
      {
        id: 'writer',
        name: 'Writer',
        role: 'content_creator',
        capabilities: ['write', 'edit', 'translate', 'adapt_style'],
        systemPrompt: 'You are a professional writer. Produce high-quality, logical, audience-appropriate content from research data.',
      },
      bus,
      llmProvider
    );
  }

  async execute(task: Task): Promise<TaskResult> {
    const { description, context } = task;
    const researchData = context?.researchData || context?.previousRound?.[0]?.output || null;
    const revisionNotes: string[] = Array.isArray(context?.revisionNotes) ? context.revisionNotes : [];

    return this.llmOrMock(
      task,
      () => {
        const revisionText = revisionNotes.length > 0
          ? `\n\nCRITICAL — You must address these revision notes:\n${revisionNotes.map((x, i) => `${i + 1}. ${x}`).join('\n')}`
          : '';
        const userPrompt = researchData
          ? `Write an article about "${description}" based on research data below.\n\nResearch:\n${JSON.stringify(researchData).slice(0, 4000)}\n\nRequirements:\n1. Clear structure: intro, key points, analysis, conclusion\n2. Style: ${context?.style || 'formal'}\n3. Audience: ${context?.audience || 'general'}\n4. Target length: ${context?.targetLength || '~1500 words'}${revisionText}\n\nOutput as JSON with: title, content, wordCount.`
          : `Write an article about "${description}".\n\nRequirements:\n1. Clear structure: intro, key points, analysis, conclusion\n2. Style: ${context?.style || 'formal'}\n3. Audience: ${context?.audience || 'general'}\n4. Target length: ${context?.targetLength || '~1500 words'}${revisionText}\n\nOutput as JSON with: title, content, wordCount.`;

        return {
          system: 'You are a professional writer. You write clear, well-structured, engaging content. Output valid JSON with fields: title (string), content (string), wordCount (number).',
          user: userPrompt,
        };
      },
      (content) => {
        const parsed = this.extractJson(content);
        const body = parsed.content || content;
        return {
          title: parsed.title || `About "${description}"`,
          content: body,
          wordCount: parsed.wordCount || body.length,
          style: context?.style || 'formal',
          targetAudience: context?.audience || 'general',
          appliedRevisionNotes: revisionNotes,
        };
      },
      (reason) => {
        const mockContent = [
          `# ${description}`,
          '',
          '## Introduction',
          `Based on recent research, ${description} is a significant topic that deserves attention.`,
          '',
          '## Key Points',
          researchData?.summary || '(Research data to be added)',
          '',
          '## Analysis',
          '1. Background and current state',
          '2. Key data and trends',
          '3. Impact and implications',
          '',
          '## Conclusion',
          `In summary, ${description} requires continued attention and deeper investigation.`,
          ...(revisionNotes.length > 0 ? ['\n## Revisions Applied\n' + revisionNotes.map((x, i) => `${i + 1}. ${x}`).join('\n')] : []),
        ].join('\n');
        return this.createResult(
          task.id,
          'success',
          {
            title: `About "${description}"`,
            content: mockContent,
            wordCount: mockContent.length,
            style: context?.style || 'formal',
            targetAudience: context?.audience || 'general',
            generatedBy: 'mock',
            appliedRevisionNotes: revisionNotes,
          },
          `mock mode (${reason}): no LLM provider configured`
        );
      }
    );
  }

  private extractJson(raw: string): Record<string, any> {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
      }
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
      }
      // If no JSON found, treat the entire response as content
      return { content: raw };
    }
  }
}
