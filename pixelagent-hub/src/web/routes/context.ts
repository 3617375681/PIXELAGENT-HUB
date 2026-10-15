import type { IncomingMessage } from 'node:http';
import { sendError, sendJson, type ApiResponse } from '../http/respond.js';
import type { toApiError } from '../errors.js';

/** Request-scoped state for the access log; routes fill in what they know. */
export type RequestLog = { statusCode: number; mode?: string; taskId?: string; sessionId?: string };

export type RouteContext = {
  req: IncomingMessage;
  res: ApiResponse;
  url: URL;
  pathname: string;
  requestId: string;
  log: RequestLog;
  /** Sends JSON and records the status for the access log. */
  json(status: number, payload: unknown): void;
  error(status: number, code: Parameters<typeof toApiError>[0], message: string, details?: Record<string, unknown>): void;
};

/** A route group: returns true when it handled (and answered) the request. */
export type Route = (ctx: RouteContext) => Promise<boolean>;

export function createRouteContext(req: IncomingMessage, res: ApiResponse, url: URL, requestId: string, log: RequestLog): RouteContext {
  return {
    req, res, url, pathname: url.pathname, requestId, log,
    json(status, payload) { log.statusCode = status; sendJson(res, status, payload); },
    error(status, code, message, details) { log.statusCode = status; sendError(res, status, code, message, requestId, details); },
  };
}
