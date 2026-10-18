/**
 * PLAY LIVE model client: streams a DeepSeek chat completion straight from the visitor's browser.
 * The key goes only to api.deepseek.com, never into URLs, logs or error messages.
 */
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const LIVE_MODELS = [
  { id: 'deepseek-chat', label: 'deepseek-chat · fast' },
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro · stronger, slower' },
] as const;
export type LlmUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };
export type LlmReply = { content: string; usage?: LlmUsage; model: string };

export class LiveModelError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

const statusMessage = (status: number, body: string) =>
  status === 401 ? 'DeepSeek rejected the API key (401). Check the key and try again.'
    : status === 402 ? 'DeepSeek reports insufficient balance on this key (402).'
      : status === 429 ? 'DeepSeek rate limit reached (429). Wait a moment and try again.'
        : `DeepSeek API error (${status})${body ? `: ${body.slice(0, 200)}` : ''}`;

export async function streamChat(options: { apiKey: string; model: string; system: string; user: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<LlmReply> {
  const fetchImpl = options.fetchImpl || fetch;
  let res: Response;
  try {
    res = await fetchImpl(DEEPSEEK_ENDPOINT, {
      method: 'POST', signal: options.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model: options.model, temperature: 0.7, stream: true, stream_options: { include_usage: true },
        messages: [{ role: 'system', content: options.system }, { role: 'user', content: options.user }],
      }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new LiveModelError('Could not reach api.deepseek.com. Check your connection.');
  }
  if (!res.ok || !res.body) throw new LiveModelError(statusMessage(res.status, (await res.text().catch(() => '')).replace(/sk-[A-Za-z0-9]+/g, 'sk-…')), res.status);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let content = '';
  let usage: LlmUsage | undefined;
  let model = options.model;
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return false;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return true;
    const chunk = JSON.parse(data) as { model?: string; usage?: LlmUsage | null; choices?: { delta?: { content?: string | null } }[] };
    content += chunk.choices?.[0]?.delta?.content || '';
    if (chunk.usage) usage = chunk.usage;
    if (chunk.model) model = chunk.model;
    return false;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trimEnd();
      buffer = buffer.slice(newline + 1);
      if (consume(line)) return { content, usage, model };
    }
  }
  consume(buffer.trimEnd());
  if (!content) throw new LiveModelError('DeepSeek returned an empty reply.');
  return { content, usage, model };
}
