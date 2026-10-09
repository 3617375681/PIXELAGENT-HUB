import 'dotenv/config';
import { LLMProvider } from './provider.js';
import { LLMProviderId, LLMProviderOptions } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { DeepSeekProvider } from './deepseek.js';
import { KimiProvider } from './kimi.js';
import { OllamaProvider } from './ollama.js';
import { MockProvider } from './mock.js';

const ALL_PROVIDER_IDS: LLMProviderId[] = [
  'openai',
  'anthropic',
  'deepseek',
  'kimi',
  'ollama',
  'custom-openai-compat',
  'mock',
];

function isProviderId(raw: string): raw is LLMProviderId {
  return (ALL_PROVIDER_IDS as string[]).includes(raw);
}

function envKeyForAgent(agentId: string): string {
  return agentId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** Per-agent overrides: `AGENT_<AGENTID>_LLM_PROVIDER`, `AGENT_<AGENTID>_LLM_MODEL` (e.g. AGENT_WRITER_LLM_PROVIDER). */
export function readAgentLlmEnv(agentId: string, env: NodeJS.ProcessEnv = process.env): { llmProvider?: LLMProviderId; llmModel?: string } {
  const k = envKeyForAgent(agentId);
  const pRaw = env[`AGENT_${k}_LLM_PROVIDER`]?.trim().toLowerCase();
  const mRaw = env[`AGENT_${k}_LLM_MODEL`]?.trim();
  let llmProvider: LLMProviderId | undefined;
  if (pRaw) {
    if (isProviderId(pRaw)) llmProvider = pRaw;
    else throw new Error(`Unknown AGENT_${k}_LLM_PROVIDER=${pRaw}`);
  }
  return { llmProvider, llmModel: mRaw || undefined };
}

export function detectProviderId(env: NodeJS.ProcessEnv = process.env): LLMProviderId {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === 'mock') return 'mock';
  if (env.OFFLINE === 'true' || env.OFFLINE === '1') return 'mock';
  if (explicit === 'openai') return 'openai';
  if (explicit === 'anthropic') return 'anthropic';
  if (explicit === 'deepseek') return 'deepseek';
  if (explicit === 'kimi') return 'kimi';
  if (explicit === 'ollama') return 'ollama';
  if (explicit === 'custom-openai-compat') return 'custom-openai-compat';
  if (explicit) throw new Error(`Unknown LLM_PROVIDER=${explicit}`);

  // Auto-detect from environment
  if (env.OPENAI_API_KEY || (env.LLM_API_KEY && !env.KIMI_API_KEY && !env.DEEPSEEK_API_KEY && !env.ANTHROPIC_API_KEY)) {
    return 'openai';
  }
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.DEEPSEEK_API_KEY) return 'deepseek';
  if (env.KIMI_API_KEY) return 'kimi';
  if (env.OLLAMA_MODEL || env.OLLAMA_BASE_URL) return 'ollama';
  if (env.LLM_BASE_URL) return 'custom-openai-compat';

  return 'kimi'; // default
}

function providerOptions(model?: string): LLMProviderOptions {
  const m = model?.trim();
  return m ? { model: m } : {};
}

/** Construct a single provider instance for a known id (used by global + per-agent routing). */
export function instantiateLlmProvider(id: LLMProviderId, modelOverride?: string): LLMProvider | null {
  const opts = providerOptions(modelOverride);
  try {
    switch (id) {
      case 'mock':
        return new MockProvider(opts);
      case 'openai':
        return new OpenAIProvider(opts);
      case 'anthropic':
        return new AnthropicProvider(opts);
      case 'deepseek':
        return new DeepSeekProvider(opts);
      case 'kimi':
        return new KimiProvider(opts);
      case 'ollama':
        return new OllamaProvider(opts);
      case 'custom-openai-compat':
        return new OpenAIProvider({
          baseUrl: process.env.LLM_BASE_URL || 'http://localhost:8080/v1',
          model: modelOverride?.trim() || process.env.LLM_MODEL || 'default',
        });
      default:
        return null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[LLMFactory] Failed to create ${id} provider: ${message}`);
    }
    return null;
  }
}

/**
 * Per-agent LLM: uses `AgentConfig`-style fields when passed, else env `AGENT_<ID>_LLM_*`,
 * else the same selection as {@link createLLMProvider}.
 */
export function createLLMProviderFor(spec: { id: string; llmProvider?: LLMProviderId; llmModel?: string }): LLMProvider | null {
  const env = readAgentLlmEnv(spec.id);
  const id = spec.llmProvider ?? env.llmProvider;
  const model = spec.llmModel ?? env.llmModel;
  if (!id && !model) return createLLMProvider();
  const resolvedId = id ?? detectProviderId();
  return instantiateLlmProvider(resolvedId, model);
}

/**
 * Creates an LLMProvider based on environment configuration.
 *
 * ## Provider Selection
 *
 * Set `LLM_PROVIDER` to one of: `openai`, `anthropic`, `deepseek`, `kimi`, `ollama`, `custom-openai-compat`, `mock`.
 * Set `OFFLINE=true` (or `LLM_PROVIDER=mock`) for deterministic local responses without API keys.
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
 * | mock      | _(none)_                 | —                      | `MOCK_LLM_MODEL`   |
 * | custom    | `LLM_API_KEY`            | `LLM_BASE_URL`         | `LLM_MODEL`        |
 *
 * All providers also respect `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` as overrides.
 */
export function createLLMProvider(): LLMProvider | null {
  const id = detectProviderId();
  return instantiateLlmProvider(id, undefined);
}

export { OpenAIProvider, AnthropicProvider, DeepSeekProvider, KimiProvider, OllamaProvider, MockProvider };
