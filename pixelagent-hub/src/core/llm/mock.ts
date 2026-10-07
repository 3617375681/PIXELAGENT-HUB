import { LLMProvider } from './provider.js';
import { LLMMessage, LLMResponse, LLMUsage, LLMProviderId, LLMProviderOptions } from './types.js';

const MOCK_USAGE: LLMUsage = {
  prompt_tokens: 1,
  completion_tokens: 1,
  total_tokens: 2,
};

/**
 * Offline / demo LLM: returns one JSON blob compatible with all preset agents (no network).
 */
export class MockProvider implements LLMProvider {
  readonly name: LLMProviderId = 'mock';
  readonly model: string;

  constructor(options: LLMProviderOptions = {}) {
    this.model = options.model?.trim() || process.env.MOCK_LLM_MODEL || 'mock-echo';
  }

  private buildJson(systemPrompt: string, userPrompt: string): string {
    const topicMatch = userPrompt.match(/["']([^"']{1,160})["']/);
    const topic = topicMatch?.[1]?.trim() || 'task';
    const lines = [
      `# ${topic}`,
      '',
      '## Summary',
      'MockProvider offline response — valid JSON for pipeline and company modes.',
      '',
      '## Body',
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(48),
      '',
      '## Demo task context',
      userPrompt,
    ];
    const longContent = lines.join('\n');

    let verdict = 'approved_for_delivery';
    if (userPrompt.includes('Provide a structured review as JSON')) {
      verdict = 'needs_revision';
    } else if (userPrompt.includes('Review the following draft')) {
      verdict = 'approved';
    } else if (userPrompt.includes('Decide if this content is ready')) {
      verdict = 'approved_for_delivery';
    }

    return JSON.stringify({
      topic,
      summary: `Structured mock research summary for "${topic}". Round progress (mock).`,
      keyPoints: ['Fact A (mock)', 'Fact B (mock)', 'Fact C (mock)'],
      sources: [],
      projectName: topic,
      goal: `Complete: ${topic}`,
      phases: [
        { id: 'p1', name: 'Research', tasks: ['Gather facts'], assignee: 'researcher', priority: 'high' },
        { id: 'p2', name: 'Deliver', tasks: ['Draft', 'Review'], assignee: 'writer', priority: 'high' },
      ],
      estimatedRounds: 2,
      risks: [] as string[],
      title: `Mock article: ${topic}`,
      content: longContent,
      wordCount: longContent.length,
      verdict,
      score: 88,
      qualityScore: 90,
      finalAssessment: 'Ready for delivery (mock).',
      mustFixBeforeDelivery: [] as string[],
      issues: [] as unknown[],
      suggestions: ['Polish headings (mock)'],
      requiredChanges: [] as string[],
      nextAction: 'forward_to_director',
      nextSpeaker: 'writer',
      guidance: 'Proceed with draft (mock).',
      converged: false,
      language: 'typescript',
      files: [
        {
          path: 'src/mock.ts',
          content: "// mock\nexport const answer = 42;\n",
          description: 'Mock file',
        },
      ],
      explanation: 'Mock implementation.',
      dependencies: [] as string[],
      deliveryPackage: {
        content: { title: `Mock: ${topic}`, content: longContent },
        qualityReport: { rounds: 1, score: 90 },
        recommendedAction: 'Deliver (mock)',
      },
      _echo: { systemLen: systemPrompt.length, userLen: userPrompt.length },
    });
  }

  async chat(messages: LLMMessage[], temperature = 0.7): Promise<string> {
    const sys = messages.find((m) => m.role === 'system')?.content ?? '';
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return this.buildJson(String(sys), String(lastUser));
  }

  async chatWithUsage(messages: LLMMessage[], temperature = 0.7): Promise<LLMResponse> {
    const content = await this.chat(messages, temperature);
    return { content, usage: { ...MOCK_USAGE }, model: this.model, provider: this.name };
  }

  async ask(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
    void temperature;
    return this.buildJson(systemPrompt, userPrompt);
  }

  async askWithUsage(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<LLMResponse> {
    void temperature;
    const content = this.buildJson(systemPrompt, userPrompt);
    return { content, usage: { ...MOCK_USAGE }, model: this.model, provider: this.name };
  }
}
