// PixelAgent Hub — API Client for WeChat Mini Program
// 微信小程序 API 客户端

const app = getApp<{ globalData: { baseUrl: string; apiKey: string } }>();

function getBaseUrl(): string {
  return app?.globalData?.baseUrl || 'http://localhost:3100';
}

function getApiKey(): string {
  return app?.globalData?.apiKey || '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = getBaseUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const { method = 'GET', data, headers = {}, timeout = 30000 } = opts;

  const apiKey = getApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          const msg = (res.data as any)?.error?.message || (res.data as any)?.message || `HTTP ${res.statusCode}`;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network error'));
      },
    });
  });
}

// ===== Health =====
export function healthCheck(): Promise<{ ok: boolean }> {
  return request('/health');
}

// ===== Sessions =====
export interface SessionMeta {
  id: string;
  name?: string;
  status?: string;
  mode?: string;
  created?: string;
  updated?: string;
}

export function listSessions(): Promise<SessionMeta[]> {
  return request('/api/sessions');
}

export function getSession(id: string): Promise<any> {
  return request(`/api/sessions/${id}`);
}

// ===== Run / Orchestrate =====
export interface RunResult {
  ok: boolean;
  sessionUrl?: string;
  sessionId?: string;
  result?: any;
  jobId?: string;
}

export function postRun(mode: string, body: any, async = false): Promise<RunResult> {
  const suffix = async ? '?async=1' : '';
  return request(`/api/run/${mode}${suffix}`, { method: 'POST', data: body, timeout: 120000 });
}

// ===== Runtime Jobs =====
export function getRuntimeJob(jobId: string): Promise<any> {
  return request(`/api/runtime/jobs/${jobId}`);
}

// ===== Chat (JSON mode) =====
export interface ChatResponse {
  chatId: string;
  content: string;
  reasoning?: string;
  llmUsage?: any;
}

export function chatSync(messages: Array<{ role: string; content: any }>): Promise<ChatResponse> {
  return request('/api/chat', {
    method: 'POST',
    data: { messages, stream: false },
    timeout: 120000,
  });
}

// ===== Chat (SSE streaming) via socket task =====
// WeChat does not support SSE/EventSource natively.
// We use wx.request with enableChunked:true and parse the stream manually.
export interface ChatStreamCallbacks {
  onMeta?: (chatId: string) => void;
  onDelta?: (text: string) => void;
  onDone?: (chatId: string, content: string, llmUsage?: any) => void;
  onError?: (message: string) => void;
}

export function chatStream(
  messages: Array<{ role: string; content: any }>,
  callbacks: ChatStreamCallbacks,
  files?: Array<{ name: string; mime: string; data: string }>,
): WechatMiniprogram.RequestTask {
  const base = getBaseUrl();
  const url = `${base}/api/chat`;

  const apiKey = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const body: Record<string, any> = { messages, stream: true };
  if (files && files.length > 0) {
    body.files = files;
  }

  const req = wx.request({
    url,
    method: 'POST',
    header: headers,
    data: body,
    timeout: 120000,
    enableHttp2: true,
    enableChunked: true,
    success(_res) {
      // Handled via onChunkReceived
    },
    fail(err) {
      callbacks.onError?.(err.errMsg || 'Request failed');
    },
  });

  let buffer = '';
  req.onChunkReceived((chunk: WechatMiniprogram.OnChunkReceivedListenerResult) => {
    const text = typeof chunk.data === 'string'
      ? chunk.data
      : new TextDecoder().decode((chunk as any).data as ArrayBuffer);

    buffer += text;
    const lines = buffer.split('\n');
    // Keep the last partial line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: meta')) continue;
      if (line.startsWith('event: text')) continue;
      if (line.startsWith('event: done')) continue;
      if (line.startsWith('event: error')) continue;

      if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        try {
          const event = JSON.parse(raw);
          if (event.stream !== undefined) {
            callbacks.onMeta?.(event.chatId);
          } else if (event.delta) {
            callbacks.onDelta?.(event.delta);
          } else if (event._done) {
            callbacks.onDone?.(event.chatId || event._done, event.content || '', event.llmUsage);
          } else if (event.message) {
            callbacks.onError?.(event.message);
          }
        } catch {
          // Skip unparseable
        }
      }
    }
  });

  return req;
}

// ===== Export =====
export function getExport(sessionId: string): Promise<any> {
  return request(`/api/export?sessionId=${encodeURIComponent(sessionId)}`);
}

// ===== Seedance =====
export const seedanceCreateVideo = (body: any): Promise<any> =>
  request('/api/seedance', { method: 'POST', data: body, timeout: 60000 });

export const seedanceGetVideo = (genId: string): Promise<any> =>
  request(`/api/seedance?generation_id=${encodeURIComponent(genId)}`);
