import { LLMProvider } from './provider.js';
import { LLMMessage, LLMResponse, LLMProviderOptions, LLMProviderId } from './types.js';

/**
 * Anthropic provider — Claude Messages API.
 * Default endpoint: https://api.anthropic.com/v1
 */
export class AnthropicProvider implements LLMProvider {
  readonly name: LLMProviderId = 'anthropic';
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: LLMProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = (options.baseUrl || process.env.LLM_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.model = options.model || process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    this.fetchFn = options.fetchImpl || fetch;
    if (!this.apiKey) {
      throw new Error('Anthropic API key not found. Set ANTHROPIC_API_KEY or LLM_API_KEY.');
    }
  }

  async chat(messages: LLMMessage[], temperature: number = 0.7): Promise<string> {
    const result = await this.chatWithUsage(messages, temperature);
    return result.content;
  }

  async chatWithUsage(messages: LLMMessage[], temperature: number = 0.7): Promise<LLMResponse> {
    // Separate system message from conversation for Anthropic API format
    let system = '';
    const conversation: LLMMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n\n' : '') + msg.content;
      } else {
        conversation.push(msg);
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      messages: conversation.map(m => ({ role: m.role, content: m.content })),
      temperature,
    };
    if (system) {
      body.system = system;
    }

    const resp = await this.fetchFn(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`Anthropic API error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const text = data.content?.find((b: any) => b.type === 'text')?.text || '';

    return {
      content: text,
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: data.model || this.model,
      provider: this.name,
    };
  }

  async ask(systemPrompt: string, userPrompt: string, temperature?: number): Promise<string> {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], temperature);
  }

  async askWithUsage(systemPrompt: string, userPrompt: string, temperature?: number): Promise<LLMResponse> {
    return this.chatWithUsage([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], temperature);
  }
}
