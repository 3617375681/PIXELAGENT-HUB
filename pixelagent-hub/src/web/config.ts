type NodeEnv = 'development' | 'test' | 'production';

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`[config] ${name} must be a positive integer, got: ${raw}`);
  }
  return value;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`[config] ${name} must be a non-negative integer, got: ${raw}`);
  }
  return value;
}

function parseOptionalPositiveInt(raw: string | undefined, name: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`[config] ${name} must be a positive integer when set, got: ${raw}`);
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

export type WebServerConfig = {
  port: number;
  nodeEnv: NodeEnv;
  recordsApiKey: string;
  allowUnauthInDev: boolean;
  allowedOrigins: string[];
  runTimeoutMs: number;
  /** Optional per-mode HTTP/run timeout overrides (ms). */
  runTimeoutMsByMode: Partial<Record<string, number>>;
  maxRunConcurrency: number;
  runRateLimitPerMinute: number;
  runQueueSize: number;
  runMaxRetries: number;
};

export function resolveRunTimeoutMs(cfg: WebServerConfig, mode: string): number {
  const override = cfg.runTimeoutMsByMode[mode];
  return typeof override === 'number' && override > 0 ? override : cfg.runTimeoutMs;
}

export function loadWebServerConfig(env: NodeJS.ProcessEnv = process.env): WebServerConfig {
  const nodeEnv = (env.NODE_ENV || 'development') as NodeEnv;
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`[config] NODE_ENV must be development/test/production, got: ${env.NODE_ENV}`);
  }

  const recordsApiKey = env.RECORDS_API_KEY || '';
  const allowUnauthInDev = parseBoolean(env.ALLOW_UNAUTH_IN_DEV, nodeEnv !== 'production');
  if (nodeEnv === 'production' && allowUnauthInDev) {
    throw new Error('[config] ALLOW_UNAUTH_IN_DEV cannot be true in production');
  }
  if (!allowUnauthInDev && !recordsApiKey) {
    throw new Error('[config] RECORDS_API_KEY is required when auth is enabled');
  }
  if (nodeEnv === 'production' && recordsApiKey.length < 16) {
    throw new Error('[config] RECORDS_API_KEY must be at least 16 chars in production');
  }

  const runTimeoutMs = parsePositiveInt(env.RUN_TIMEOUT_MS, 120000, 'RUN_TIMEOUT_MS');
  const runTimeoutMsByMode: Partial<Record<string, number>> = {};
  const modeEnvPairs: [string, string][] = [
    ['pipeline', 'RUN_TIMEOUT_MS_PIPELINE'],
    ['parallel', 'RUN_TIMEOUT_MS_PARALLEL'],
    ['debate', 'RUN_TIMEOUT_MS_DEBATE'],
    ['vote', 'RUN_TIMEOUT_MS_VOTE'],
    ['roundtable', 'RUN_TIMEOUT_MS_ROUNDTABLE'],
    ['company', 'RUN_TIMEOUT_MS_COMPANY'],
  ];
  for (const [mode, envKey] of modeEnvPairs) {
    const v = parseOptionalPositiveInt(env[envKey], envKey);
    if (v !== undefined) runTimeoutMsByMode[mode] = v;
  }

  return {
    port: parsePositiveInt(env.RECORDS_API_PORT, 3100, 'RECORDS_API_PORT'),
    nodeEnv,
    recordsApiKey,
    allowUnauthInDev,
    allowedOrigins: (env.ALLOWED_ORIGINS || (nodeEnv === 'production' ? '' : 'http://localhost:5173,http://localhost:3000')).split(',').map(s => s.trim()).filter(Boolean),
    runTimeoutMs,
    runTimeoutMsByMode,
    maxRunConcurrency: parsePositiveInt(env.MAX_RUN_CONCURRENCY, 3, 'MAX_RUN_CONCURRENCY'),
    runRateLimitPerMinute: parsePositiveInt(env.RUN_RATE_LIMIT_PER_MINUTE, 30, 'RUN_RATE_LIMIT_PER_MINUTE'),
    runQueueSize: parsePositiveInt(env.RUN_QUEUE_SIZE, 20, 'RUN_QUEUE_SIZE'),
    runMaxRetries: parseNonNegativeInt(env.RUN_MAX_RETRIES, 0, 'RUN_MAX_RETRIES'),
  };
}
