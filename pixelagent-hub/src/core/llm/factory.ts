import 'dotenv/config';
import { LLMProvider } from './provider.js';
import { LLMProviderId } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { DeepSeekProvider } from './deepseek.js';
import { KimiProvider } from './kimi.js';
import { OllamaProvider } from './ollama.js';

function detectProviderId(): LLMProviderId {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'openai') return 'openai';
  if (explicit === 'anthropic') return 'anthropic';
  if (explicit === 'deepseek') return 'deepseek';
  if (explicit === 'kimi') return 'kimi';
  if (explicit === 'ollama') return 'ollama';
  if (explicit === 'custom-openai-compat') return 'custom-openai-compat';

  // Auto-detect from environment
  if (process.env.OPENAI_API_KEY || (process.env.LLM_API_KEY && !process.env.KIMI_API_KEY && !process.env.DEEPSEEK_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    return 'openai';
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.KIMI_API_KEY) return 'kimi';
  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_BASE_URL) return 'ollama';
  if (process.env.LLM_BASE_URL) return 'custom-openai-compat';

  return 'kimi'; // default
}

/**
 * Creates an LLMProvider based on environment configuration.
 *
 * ## Provider Selection
 *
 * Set `LLM_PROVIDER` to one of: `openai`, `anthropic`, `deepseek`, `kimi`, `ollama`, `custom-openai-compat`.
 * If not set, auto-detects from available API keys.
 *
 * ## Configuration
 *
 * | Provider  | API Key Env              | Base URL Env           | Model Env         |
 * |-----------|--------------------------|------------------------|--------------------|
 * | openai    | `OPENAI_API_KEY`         | `OPENAI_BASE_URL`      | `OPENAI_MODEL`     |
 * | anthropic | `ANTHROPIC_API_KEY`      | `ANTHROPIC_BASE_URL`   | `ANTHROPIC_MODEL`  |
 * | deepseek  | `DEEPSEEK_API_KEY`       | `DEEPSEEK_BASE_URL`    | `DEEPSEEK_MODEL`   |
 * | kimi      | `KIMI_API_KEY`           | `KIMI_BASE_URL`        | `KIMI_MODEL`       |
 * | ollama    | _(none)_                 | `OLLAMA_BASE_URL`      | `OLLAMA_MODEL`     |
 * | custom    | `LLM_API_KEY`            | `LLM_BASE_URL`         | `LLM_MODEL`        |
 *
 * All providers also respect `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` as overrides.
 */
export function createLLMProvider(): LLMProvider | null {
  const id = detectProviderId();

  try {
    switch (id) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      case 'deepseek':
        return new DeepSeekProvider();
      case 'kimi':
        return new KimiProvider();
      case 'ollama':
        return new OllamaProvider();
      case 'custom-openai-compat':
        // OpenAI-compatible custom endpoint
        return new OpenAIProvider({
          baseUrl: process.env.LLM_BASE_URL || 'http://localhost:8080/v1',
          model: process.env.LLM_MODEL || 'default',
        });
      default:
        return null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log but don't crash — callers handle null provider
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[LLMFactory] Failed to create ${id} provider: ${message}`);
    }
    return null;
  }
}

export { OpenAIProvider, AnthropicProvider, DeepSeekProvider, KimiProvider, OllamaProvider };
