import { LLMMessage, LLMResponse } from './types.js';

/** Reported when no provider is selected and no API key is available. */
export const NO_LLM_PROVIDER_MESSAGE = 'No LLM provider configured; set LLM_PROVIDER=mock for an offline demo or configure a provider API key.';

export interface LLMProvider {
  /** Provider identifier (e.g. "openai", "anthropic") */
  readonly name: string;
  /** The active model name */
  readonly model: string;
  /** Single chat completion, returns content string */
  chat(messages: LLMMessage[], temperature?: number, signal?: AbortSignal): Promise<string>;
  /** Chat completion with token usage info */
  chatWithUsage(messages: LLMMessage[], temperature?: number, signal?: AbortSignal): Promise<LLMResponse>;
  /** Convenience: system + user prompt */
  ask(systemPrompt: string, userPrompt: string, temperature?: number, signal?: AbortSignal): Promise<string>;
  /** Convenience: system + user prompt with usage */
  askWithUsage(systemPrompt: string, userPrompt: string, temperature?: number, signal?: AbortSignal): Promise<LLMResponse>;
}
