export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
  ok?: boolean;
  message?: string;
};
