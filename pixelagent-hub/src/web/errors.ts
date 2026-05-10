export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'RUN_CONCURRENCY_LIMIT'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';

export type ApiErrorShape = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

export function toApiError(
  code: ApiErrorCode,
  message: string,
  requestId?: string,
  details?: Record<string, unknown>
): ApiErrorShape {
  return {
    error: {
      code,
      message,
      requestId,
      details,
    },
  };
}
