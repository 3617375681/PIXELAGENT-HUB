import { LLMMessage, LLMResponse } from './types.js';

export interface LLMProvider {
  /** Provider identifier (e.g. "openai", "anthropic") */
  readonly name: string;
  /** The active model name */
  readonly model: string;
  /** Single chat completion, returns content string */
  chat(messages: LLMMessage[], temperature?: number): Promise<string>;
  /** Chat completion with token usage info */
  chatWithUsage(messages: LLMMessage[], temperature?: number): Promise<LLMResponse>;
  /** Convenience: system + user prompt */
  ask(systemPrompt: string, userPrompt: string, temperature?: number): Promise<string>;
  /** Convenience: system + user prompt with usage */
  askWithUsage(systemPrompt: string, userPrompt: string, temperature?: number): Promise<LLMResponse>;
}
