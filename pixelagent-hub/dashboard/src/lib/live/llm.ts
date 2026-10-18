/**
 * PLAY LIVE model clients: stream a chat completion straight from the visitor's browser with their
 * own key. Keys go only to the chosen provider's API, never into URLs, logs or error messages.
 * Every provider listed here answers CORS preflights from the Pages origin (checked 2026-10-18).
 */
export type LiveProvider = { id: string; label: string; endpoint: string; protocol: 'openai' | 'anthropic'; models: readonly string[]; keyPage: string; custom?: boolean };
export const LIVE_PROVIDERS: readonly LiveProvider[] = [
  { id: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', protocol: 'openai', models: ['deepseek-chat', 'deepseek-v4-pro'], keyPage: 'https://platform.deepseek.com/api_keys' },
  { id: 'anthropic', label: 'Anthropic (Claude)', endpoint: 'https://api.anthropic.com/v1/messages', protocol: 'anthropic', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], keyPage: 'https://platform.claude.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', protocol: 'openai', models: ['gpt-4o-mini', 'gpt-4o'], keyPage: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', protocol: 'openai', models: ['deepseek/deepseek-chat', 'anthropic/claude-sonnet-5-5', 'openai/gpt-4o-mini'], keyPage: 'https://openrouter.ai/keys' },
  { id: 'qwen', label: 'Qwen (DashScope)', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', protocol: 'openai', models: ['qwen-plus', 'qwen-max'], keyPage: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'glm', label: 'Zhipu GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', protocol: 'openai', models: ['glm-4-flash', 'glm-4-plus'], keyPage: 'https://open.bigmodel.cn/usercenter/apikeys' },
  // Any OpenAI-compatible server the visitor points at: Ollama, LM Studio, vLLM, LiteLLM, a proxy.
  { id: 'custom', label: 'Custom / local (OpenAI-compatible)', endpoint: '', protocol: 'openai', models: ['qwen3:4b', 'llama3.1', 'qwen2.5-coder'], keyPage: 'https://github.com/Jiarong-Song233/PIXELAGENT-HUB#local-models', custom: true },
  { id: 'siliconflow', label: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1/chat/completions', protocol: 'openai', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-Coder-32B-Instruct'], keyPage: 'https://cloud.siliconflow.cn/account/ak' },
];
export const liveProvider = (id: string) => LIVE_PROVIDERS.find((provider) => provider.id === id) || LIVE_PROVIDERS[0];
export const DEEPSEEK_ENDPOINT = LIVE_PROVIDERS[0].endpoint;
export const DEFAULT_CUSTOM_BASE_URL = 'http://localhost:11434/v1';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** `…/v1` or a full `…/chat/completions` URL; https anywhere, plain http only on this machine. */
export function customEndpoint(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); } catch { throw new LiveModelError('Enter the server URL, for example http://localhost:11434/v1.'); }
  if (url.username || url.password) throw new LiveModelError('Put credentials in the API KEY field, not in the URL.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) throw new LiveModelError('Use an https:// URL, or http:// only for localhost.');
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  url.search = ''; url.hash = '';
  return url.href;
}
export type LlmUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };
export type LlmReply = { content: string; usage?: LlmUsage; model: string };

/** Never let a key, or anything shaped like one, into an error message. */
const redact = (text: string, key: string) => (key ? text.split(key).join('[key]') : text).replace(/(sk|sk-ant|sk-or)-[A-Za-z0-9_-]{6,}/g, '[key]');

export class LiveModelError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}

const statusMessage = (provider: string, model: string, status: number, body: string) =>
  status === 401 ? `${provider} rejected the API key (401). Check the key and try again.`
    : status === 402 ? `${provider} reports insufficient balance on this key (402).`
      : status === 404 ? `${provider} does not know the model "${model}" (404). Change MODEL.`
        : status === 429 ? `${provider} rate limit reached (429). Wait a moment and try again.`
          : `${provider} API error (${status})${body ? `: ${body.slice(0, 200)}` : ''}`;

/** OpenAI-compatible streaming chat completion. */
export async function streamChat(options: { apiKey: string; model: string; system: string; user: string; signal?: AbortSignal; fetchImpl?: typeof fetch; endpoint?: string; provider?: string; withUsage?: boolean }): Promise<LlmReply> {
  const fetchImpl = options.fetchImpl || fetch;
  const withUsage = options.withUsage ?? true;
  const endpoint = options.endpoint || DEEPSEEK_ENDPOINT;
  const provider = options.provider || 'DeepSeek';
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST', signal: options.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      // Local servers often need no key; then no Authorization header is sent at all.
      headers: { 'Content-Type': 'application/json', ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}) },
      body: JSON.stringify({
        model: options.model, temperature: 0.7, stream: true, ...(withUsage ? { stream_options: { include_usage: true } } : {}),
        messages: [{ role: 'system', content: options.system }, { role: 'user', content: options.user }],
      }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const host = new URL(endpoint);
    throw new LiveModelError(LOCAL_HOSTS.has(host.hostname)
      ? `Could not reach ${host.host}. Is the server running, and does it allow this page's origin (CORS)? For Ollama, start it with OLLAMA_ORIGINS set.`
      : `Could not reach ${host.host}. Check your connection.`);
  }
  // Some OpenAI-compatible servers reject stream_options; ask once more without it.
  if (res.status === 400 && withUsage) return streamChat({ ...options, withUsage: false });
  if (!res.ok || !res.body) throw new LiveModelError(statusMessage(provider, options.model, res.status, redact(await res.text().catch(() => ''), options.apiKey)), res.status);
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
  if (!content) throw new LiveModelError(`${provider} returned an empty reply.`);
  return { content, usage, model };
}

/** One model call for the visitor's chosen provider. */
export async function liveChat(credentials: { provider: string; key: string; model: string; baseUrl?: string }, prompt: { system: string; user: string }, signal?: AbortSignal): Promise<LlmReply> {
  const provider = liveProvider(credentials.provider);
  if (provider.protocol === 'anthropic') {
    const { streamClaude } = await import('./anthropic');
    return streamClaude({ apiKey: credentials.key, model: credentials.model, ...prompt, signal });
  }
  const endpoint = provider.custom ? customEndpoint(credentials.baseUrl || DEFAULT_CUSTOM_BASE_URL) : provider.endpoint;
  return streamChat({ apiKey: credentials.key, model: credentials.model, ...prompt, signal, endpoint, provider: provider.custom ? new URL(endpoint).host : provider.label });
}
