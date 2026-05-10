/**
 * @deprecated Use `KimiProvider` from `./llm/kimi.js` and types from `./llm/types.js` instead.
 * This re-export is kept for backward compatibility.
 */
export { KimiProvider as KimiClient } from './llm/kimi.js';
export type { LLMProviderOptions as KimiClientOptions } from './llm/types.js';

// Re-export compatible types
import type { LLMMessage, LLMResponse, LLMUsage } from './llm/types.js';
export type KimiMessage = LLMMessage;
export type KimiResponse = LLMResponse;
export type KimiUsage = LLMUsage;
export type KimiChatResult = LLMResponse;
