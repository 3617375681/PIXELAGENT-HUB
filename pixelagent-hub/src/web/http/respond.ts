import type { IncomingMessage, ServerResponse } from 'node:http';
import { toApiError } from '../errors.js';
import type { WebServerConfig } from '../config.js';

/** The response carries the request's allowed CORS origin so every writer can echo it. */
export type ApiResponse = ServerResponse & { _corsOrigin?: string };

export function corsOrigin(config: WebServerConfig, req: IncomingMessage): string {
  const origin = req.headers?.origin || '';
  if (config.allowedOrigins.length > 0 && config.allowedOrigins.includes(origin)) return origin;
  if (config.allowUnauthInDev && config.allowedOrigins.length === 0) return origin || '*';
  return config.allowedOrigins[0] || '';
}

export function corsHeaders(res: ApiResponse): Record<string, string> {
  return res._corsOrigin ? { 'Access-Control-Allow-Origin': res._corsOrigin, Vary: 'Origin' } : {};
}

export function isAuthorized(config: WebServerConfig, req: IncomingMessage): boolean {
  if (config.allowUnauthInDev) return true;
  const apiKeyHeader = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const token = (typeof apiKeyHeader === 'string' ? apiKeyHeader : '') || bearer;
  return Boolean(token) && token === config.recordsApiKey;
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(res) });
  res.end(JSON.stringify(payload));
}

export function sendBinary(res: ApiResponse, status: number, body: Buffer, contentType: string, filename: string): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': String(body.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  res.end(body);
}

export function sendError(res: ApiResponse, status: number, code: Parameters<typeof toApiError>[0], message: string, requestId: string, details?: Record<string, unknown>): void {
  sendJson(res, status, toApiError(code, message, requestId, details));
}

export function getRequestId(req: IncomingMessage): string {
  const fromHeader = req.headers['x-request-id'];
  return typeof fromHeader === 'string' && fromHeader.length > 0 ? fromHeader : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parses a JSON body; malformed or empty bodies become `{}` so routes validate fields themselves. */
export async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { return {}; }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, tag: string, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => { reject(new Error(`${tag}_TIMEOUT_${timeoutMs}ms`)); onTimeout?.(); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function safeStringifyObject(value: unknown): string {
  const ancestors: object[] = [];
  return JSON.stringify(value, function (this: object, _key, v) {
    if (typeof v === 'object' && v !== null) {
      while (ancestors.length && ancestors[ancestors.length - 1] !== this) ancestors.pop();
      if (ancestors.includes(v)) return '[Circular]';
      ancestors.push(v);
    }
    return v;
  });
}
