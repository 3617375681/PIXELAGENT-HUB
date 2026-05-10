import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { ActionProvider } from './actionAdapter.js';
import { MockActionProvider } from './mockAdapter.js';
import { ActionExecutionResult, IntelligenceAction } from './intelTypes.js';

export type LocalToolProviderOptions = {
  rootDir: string;
  maxReadBytes?: number;
  maxWriteBytes?: number;
  /** Executable basenames allowed for `local_shell` (e.g. `echo`, `node`). Empty = shell disabled. */
  shellAllowlist?: string[];
  /** Hostnames allowed for `local_http_get` (lowercase, no port in match — port checked separately). */
  httpHostAllowlist?: string[];
  fetchImpl?: typeof fetch;
};

function safePathUnderRoot(rootDir: string, rel: string): string {
  const trimmed = rel.replace(/\\/g, '/').trim();
  if (!trimmed || trimmed.split('/').includes('..')) {
    throw new Error('LOCAL_TOOL_INVALID_PATH');
  }
  const root = resolve(rootDir);
  const candidate = resolve(join(root, trimmed));
  const relTo = relative(root, candidate);
  if (relTo.startsWith('..') || relTo === '..') {
    throw new Error('LOCAL_TOOL_PATH_ESCAPE');
  }
  if (sep === '\\' && relTo.startsWith('..\\')) {
    throw new Error('LOCAL_TOOL_PATH_ESCAPE');
  }
  return candidate;
}

function parseAllowlist(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function createLocalToolProviderFromEnv(
  rootDir: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): LocalToolProvider {
  return new LocalToolProvider({
    rootDir,
    maxReadBytes: Number(env.INTELLIGENCE_LOCAL_MAX_READ || 262_144),
    maxWriteBytes: Number(env.INTELLIGENCE_LOCAL_MAX_WRITE || 1_048_576),
    shellAllowlist: parseAllowlist(env.INTELLIGENCE_SHELL_ALLOWLIST, []),
    httpHostAllowlist: parseAllowlist(env.INTELLIGENCE_HTTP_ALLOWLIST, ['127.0.0.1', 'localhost', 'example.com']),
    fetchImpl,
  });
}

/**
 * NanoClaw-style lightweight local executor: file IO, optional shell, HTTP GET, notify log.
 * All paths are confined under `rootDir`.
 */
export class LocalToolProvider implements ActionProvider {
  name = 'local';

  constructor(private readonly opts: LocalToolProviderOptions) {}

  async execute(action: IntelligenceAction): Promise<ActionExecutionResult> {
    const maxRead = this.opts.maxReadBytes ?? 262_144;
    const maxWrite = this.opts.maxWriteBytes ?? 1_048_576;
    const fetchImpl = this.opts.fetchImpl || fetch;

    try {
      switch (action.type) {
        case 'local_read_file': {
          const rel = String(action.params.path || action.target || '');
          const abs = safePathUnderRoot(this.opts.rootDir, rel);
          const buf = await readFile(abs);
          const slice = buf.subarray(0, maxRead);
          const text = slice.toString('utf-8');
          return {
            actionId: action.id,
            type: action.type,
            status: 'success',
            retryable: false,
            message: `read ${abs} bytes=${slice.length}`,
            providerRef: text.length > 200 ? `${text.slice(0, 200)}…` : text,
          };
        }
        case 'local_write_file': {
          const rel = String(action.params.path || action.target || '');
          const content = String(action.params.content ?? '');
          if (content.length > maxWrite) {
            return {
              actionId: action.id,
              type: action.type,
              status: 'failed',
              retryable: false,
              message: 'content exceeds maxWriteBytes',
            };
          }
          const abs = safePathUnderRoot(this.opts.rootDir, rel);
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, content, 'utf-8');
          return {
            actionId: action.id,
            type: action.type,
            status: 'success',
            retryable: false,
            message: `wrote ${abs} len=${content.length}`,
            providerRef: abs,
          };
        }
        case 'local_shell': {
          const allow = new Set((this.opts.shellAllowlist || []).map((x) => x.toLowerCase()));
          if (allow.size === 0) {
            return {
              actionId: action.id,
              type: action.type,
              status: 'failed',
              retryable: false,
              message: 'local_shell disabled (empty INTELLIGENCE_SHELL_ALLOWLIST)',
            };
          }
          const argv = Array.isArray(action.params.argv)
            ? (action.params.argv as unknown[]).map((x) => String(x))
            : [];
          const cmd = String(action.params.command || argv[0] || '').trim();
          if (!cmd || !allow.has(cmd.toLowerCase())) {
            return {
              actionId: action.id,
              type: action.type,
              status: 'failed',
              retryable: false,
              message: `command not allowed: ${cmd}`,
            };
          }
          const args = argv.length > 0 ? argv.slice(1) : (Array.isArray(action.params.args) ? (action.params.args as string[]) : []);
          const out = await runSpawn(cmd, args, this.opts.rootDir);
          return {
            actionId: action.id,
            type: action.type,
            status: 'success',
            retryable: false,
            message: out.slice(0, 500),
            providerRef: `exit0`,
          };
        }
        case 'local_http_get': {
          const urlStr = String(action.params.url || action.target || '');
          const u = new URL(urlStr);
          const hosts = new Set((this.opts.httpHostAllowlist || []).map((h) => h.toLowerCase()));
          if (!hosts.has(u.hostname.toLowerCase())) {
            return {
              actionId: action.id,
              type: action.type,
              status: 'failed',
              retryable: false,
              message: `host not allowed: ${u.hostname}`,
            };
          }
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return {
              actionId: action.id,
              type: action.type,
              status: 'failed',
              retryable: false,
              message: 'only http/https',
            };
          }
          const res = await fetchImpl(urlStr, { method: 'GET' });
          const body = await res.text();
          const clip = body.slice(0, maxRead);
          return {
            actionId: action.id,
            type: action.type,
            status: res.ok ? 'success' : 'failed',
            retryable: !res.ok,
            message: `GET ${urlStr} status=${res.status} len=${clip.length}`,
            providerRef: clip.slice(0, 400),
          };
        }
        case 'local_notify': {
          const msg = String(action.params.message ?? action.params.text ?? '');
          const logPath = safePathUnderRoot(this.opts.rootDir, '_nanoclaw/notify.log');
          await mkdir(join(this.opts.rootDir, '_nanoclaw'), { recursive: true });
          await appendFile(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
          return {
            actionId: action.id,
            type: action.type,
            status: 'success',
            retryable: false,
            message: 'appended notify.log',
            providerRef: logPath,
          };
        }
        default:
          return {
            actionId: action.id,
            type: action.type,
            status: 'failed',
            retryable: false,
            message: `local provider does not handle ${action.type}`,
          };
      }
    } catch (err) {
      return {
        actionId: action.id,
        type: action.type,
        status: 'failed',
        retryable: true,
        message: String(err),
      };
    }
  }
}

function buildSpawnEnv(): Record<string, string> {
  // Only pass through safe environment variables to child processes
  const safeKeys = new Set([
    'PATH', 'HOME', 'USER', 'USERNAME', 'TMP', 'TEMP', 'TMPDIR',
    'LANG', 'LC_ALL', 'LC_CTYPE',
    'SYSTEMROOT', 'SystemRoot', 'windir',
    'NODE_PATH',
  ]);
  const childEnv: Record<string, string> = {};
  for (const k of safeKeys) {
    if (process.env[k]) childEnv[k] = process.env[k]!;
  }
  return childEnv;
}

function runSpawn(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: buildSpawnEnv() });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on('data', (d) => chunks.push(Buffer.from(d)));
    child.stderr?.on('data', (d) => errChunks.push(Buffer.from(d)));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(chunks).toString('utf-8');
      const err = Buffer.concat(errChunks).toString('utf-8');
      if (code === 0) resolvePromise(out || err);
      else reject(new Error(`spawn exit ${code}: ${err || out}`));
    });
  });
}

/** When `INTELLIGENCE_PROVIDER=local`, non-local actions still use the mock provider for CI-safe demos. */
export class HybridLocalActionProvider implements ActionProvider {
  name = 'local';

  constructor(
    private readonly local: LocalToolProvider,
    private readonly mock: MockActionProvider
  ) {}

  async execute(action: IntelligenceAction): Promise<ActionExecutionResult> {
    if (action.type.startsWith('local_')) return this.local.execute(action);
    return this.mock.execute(action);
  }
}
