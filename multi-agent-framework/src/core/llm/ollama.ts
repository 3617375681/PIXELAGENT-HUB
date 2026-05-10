import { LLMProvider } from './provider.js';
import { LLMMessage, LLMResponse, LLMProviderOptions, LLMProviderId } from './types.js';

/**
 * Ollama provider for local models. No API key required.
 * Default endpoint: http://localhost:11434
 */
export class OllamaProvider implements LLMProvider {
  readonly name: LLMProviderId = 'ollama';
  readonly model: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: LLMProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.LLM_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model || process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'qwen3:14b';
    this.fetchFn = options.fetchImpl || fetch;
  }

  async chat(messages: LLMMessage[], temperature: number = 0.7): Promise<string> {
    const result = await this.chatWithUsage(messages, temperature);
    return result.content;
  }

  async chatWithUsage(messages: LLMMessage[], temperature: number = 0.7): Promise<LLMResponse> {
    const resp = await this.fetchFn(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: { temperature },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`Ollama API error (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    return {
      content: data.message?.content || '',
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
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
