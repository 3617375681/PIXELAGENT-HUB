/**
 * Minimal typed client for the Records / multi-agent HTTP API.
 * Base URL example: http://127.0.0.1:3100
 */

export type RecordsApiClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export type ModeRunResponse = {
  mode: string;
  task: Record<string, unknown>;
  status: string;
  final: unknown;
  trace: Record<string, unknown>;
  raw?: unknown;
  artifacts?: Record<string, unknown>;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createRecordsApiClient(options: RecordsApiClientOptions) {
  const f = options.fetchImpl || fetch;
  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) h['X-API-Key'] = options.apiKey;
    return h;
  };

  return {
    health: () => f(joinUrl(options.baseUrl, '/health')),

    readiness: () => f(joinUrl(options.baseUrl, '/health/readiness')),

    runtimeMetrics: () =>
      f(joinUrl(options.baseUrl, '/api/runtime/metrics'), { headers: headers() }),

    listJobs: (limit?: number) => {
      const q = typeof limit === 'number' ? `?limit=${limit}` : '';
      return f(joinUrl(options.baseUrl, `/api/runtime/jobs${q}`), { headers: headers() });
    },

    getJob: (jobId: string) =>
      f(joinUrl(options.baseUrl, `/api/runtime/jobs/${encodeURIComponent(jobId)}`), { headers: headers() }),

    cancelJob: (jobId: string) =>
      f(joinUrl(options.baseUrl, `/api/runtime/jobs/${encodeURIComponent(jobId)}/cancel`), {
        method: 'POST',
        headers: headers(),
      }),

    runMode: (mode: string, body: Record<string, unknown>) =>
      f(joinUrl(options.baseUrl, `/api/run/${encodeURIComponent(mode)}`), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      }).then(async (res) => {
        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
        return { res, json: json as ModeRunResponse | Record<string, unknown> };
      }),

    runModeStream: async function* (mode: string, body: Record<string, unknown>) {
      const res = await f(
        joinUrl(options.baseUrl, `/api/run/${encodeURIComponent(mode)}?stream=1`),
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
        }
      );
      if (!res.ok || !res.body) {
        const t = await res.text();
        throw new Error(`stream request failed: ${res.status} ${t}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const lines = block.split('\n');
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          const dataStr = dataLines.join('\n');
          let data: unknown = dataStr;
          try {
            data = dataStr ? JSON.parse(dataStr) : null;
          } catch {
            /* keep string */
          }
          yield { event, data };
        }
      }
    },
  };
}
