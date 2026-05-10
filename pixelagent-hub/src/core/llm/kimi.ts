import { LLMProvider } from './provider.js';
import { LLMMessage, LLMResponse, LLMProviderOptions, LLMProviderId } from './types.js';

/**
 * Kimi / Moonshot provider — OpenAI-compatible API.
 * Default endpoint: https://api.moonshot.cn/v1
 */
export class KimiProvider implements LLMProvider {
  readonly name: LLMProviderId = 'kimi';
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: LLMProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.LLM_API_KEY || process.env.KIMI_API_KEY || '';
    this.baseUrl = (options.baseUrl || process.env.LLM_BASE_URL || process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
    this.model = options.model || process.env.LLM_MODEL || process.env.KIMI_MODEL || 'kimi-k2p5';
    this.fetchFn = options.fetchImpl || fetch;
    if (!this.apiKey) {
      throw new Error('Kimi API key not found. Set KIMI_API_KEY or LLM_API_KEY.');
    }
  }

  async chat(messages: LLMMessage[], temperature: number = 0.7): Promise<string> {
    const result = await this.chatWithUsage(messages, temperature);
    return result.content;
  }

  async chatWithUsage(messages: LLMMessage[], temperature: number = 0.7): Promise<LLMResponse> {
    const resp = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`Kimi API error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
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
