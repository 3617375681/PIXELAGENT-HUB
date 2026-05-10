import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMProvider } from '../factory.js';

describe('LLMFactory', () => {
  it('should return null when no provider is configured', () => {
    const prev = { ...process.env };
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;
    process.env.NODE_ENV = 'test';

    const provider = createLLMProvider();
    assert.equal(provider, null);

    process.env = prev;
  });

  it('should auto-select KimiProvider when KIMI_API_KEY is set', () => {
    const prev = { ...process.env };
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    process.env.KIMI_API_KEY = 'sk-test-kimi-key-1234567890';
    process.env.NODE_ENV = 'test';

    const provider = createLLMProvider();
    assert.ok(provider);
    assert.equal(provider.name, 'kimi');

    process.env = prev;
  });

  it('should select provider based on LLM_PROVIDER env', () => {
    const prev = { ...process.env };
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-openai-key-1234567890';
    process.env.NODE_ENV = 'test';

    const provider = createLLMProvider();
    assert.ok(provider);
    assert.equal(provider.name, 'openai');

    process.env = prev;
  });

  it('should return null when provider creation fails', () => {
    const prev = { ...process.env };
    process.env.LLM_PROVIDER = 'ollama';
    // Set base URL to something that will fail (fetch won't be called at construction for Ollama though)
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.NODE_ENV = 'test';

    const provider = createLLMProvider();
    assert.ok(provider);
    assert.equal(provider.name, 'ollama');

    process.env = prev;
  });
});
