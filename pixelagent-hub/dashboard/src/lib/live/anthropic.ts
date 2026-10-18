import type { LlmReply } from './llm';
import { LiveModelError } from './llm';

/**
 * PLAY LIVE with Claude: the official SDK in browser mode, with the visitor's own key. The SDK is
 * loaded only when the visitor picks Anthropic, so other providers don't pay for its bundle.
 */
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

// Server-side refusal fallbacks: on the Claude API for Opus and Sonnet, not for Haiku.
const supportsFallbacks = (model: string) => !model.startsWith('claude-haiku');

export async function streamClaude(options: { apiKey: string; model: string; system: string; user: string; signal?: AbortSignal }): Promise<LlmReply> {
  const sdk = await import('@anthropic-ai/sdk');
  const client = new sdk.default({ apiKey: options.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const stream = client.beta.messages.stream({
      model: options.model,
      max_tokens: 64000,
      system: options.system,
      messages: [{ role: 'user', content: options.user }],
      output_config: { effort: 'medium' },
      ...(supportsFallbacks(options.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, { signal: options.signal });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new LiveModelError('Claude declined this request. Try rewording the idea.');
    if (message.stop_reason === 'max_tokens') throw new LiveModelError('Claude ran out of output tokens before finishing. Try a smaller idea.');
    const content = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    if (!content) throw new LiveModelError('Claude returned an empty reply.');
    const { input_tokens, output_tokens } = message.usage;
    return { content, model: message.model, usage: { prompt_tokens: input_tokens, completion_tokens: output_tokens, total_tokens: input_tokens + output_tokens } };
  } catch (error) {
    if (error instanceof LiveModelError || options.signal?.aborted) throw error;
    if (error instanceof sdk.AuthenticationError) throw new LiveModelError('Anthropic rejected the API key (401). Check the key and try again.', 401);
    if (error instanceof sdk.PermissionDeniedError) throw new LiveModelError('This Anthropic key is not allowed to use that model (403).', 403);
    if (error instanceof sdk.NotFoundError) throw new LiveModelError(`Anthropic does not know the model "${options.model}" (404). Change MODEL.`, 404);
    if (error instanceof sdk.RateLimitError) throw new LiveModelError('Anthropic rate limit reached (429). Wait a moment and try again.', 429);
    if (error instanceof sdk.APIConnectionError) throw new LiveModelError('Could not reach api.anthropic.com. Check your connection.');
    if (error instanceof sdk.APIError) throw new LiveModelError(`Anthropic API error (${error.status ?? 'network'}): ${String(error.message).slice(0, 200)}`, error.status);
    throw error;
  }
}
