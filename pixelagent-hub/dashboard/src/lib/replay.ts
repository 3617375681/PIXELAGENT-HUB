import type { StudioEvent } from '../types/studio';

/**
 * Static, read-only replay build (GitHub Pages): `VITE_REPLAY=1`.
 * GET requests read files recorded by `scripts/export-replay.ts`; writes are refused.
 */
export const REPLAY = import.meta.env.VITE_REPLAY === '1';
export const REPLAY_READ_ONLY = '这是静态回放演示，只能查看。创建、返修和检查需要在本地运行完整版本。';
export type ReplayCase = { projectId: string; kind: 'mock' | 'real-model'; title: string; note: string };
export type ReplayManifest = { recordedAt: string; hero: string; cases: ReplayCase[] };

/** `/api/studio/projects/<id>/archive` → `<base>replay/api/studio/projects/<id>/archive.zip`; JSON routes get `.json`. */
export function replayFileUrl(apiPath: string): string {
  const path = apiPath.split('?')[0];
  const file = path.endsWith('/archive') ? `${path}.zip` : /\.png$/.test(path) ? path : `${path}.json`;
  return `${import.meta.env.BASE_URL}replay${file}`;
}

let manifest: Promise<ReplayManifest> | undefined;
export const loadReplayManifest = () => (manifest ??= fetch(`${import.meta.env.BASE_URL}replay/manifest.json`).then((res) => {
  if (!res.ok) throw new Error(`回放数据缺失（HTTP ${res.status}）`);
  return res.json() as Promise<ReplayManifest>;
}));

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

async function recordedEvents(projectId: string, signal?: AbortSignal) {
  const res = await fetch(replayFileUrl(`/api/studio/projects/${encodeURIComponent(projectId)}/events`), { signal });
  if (!res.ok) throw new Error(`回放事件缺失（HTTP ${res.status}）`);
  return res.json() as Promise<{ events: StudioEvent[]; derived: boolean }>;
}

/**
 * The initial JSON read returns nothing for a recorded live timeline, so the page opens the "stream"
 * and watches it unfold; derived timelines (no real timing) are returned at once.
 */
export async function replayEventPage(projectId: string, after: number, signal?: AbortSignal) {
  const recorded = await recordedEvents(projectId, signal);
  if (!recorded.derived && after === 0) return { events: [], derived: false };
  return { events: recorded.events.filter((event) => event.seq > after), derived: recorded.derived };
}

/** Plays a recorded timeline with its real gaps, clamped to 0.25–1.6 s so the whole run stays watchable. */
export async function replayEventStream(projectId: string, after: number, onEvent: (event: StudioEvent) => void, signal: AbortSignal) {
  const { events } = await recordedEvents(projectId, signal);
  let previous: StudioEvent | undefined;
  for (const event of events.filter((item) => item.seq > after)) {
    const gap = previous ? Date.parse(event.at) - Date.parse(previous.at) : 400;
    await sleep(Math.min(1600, Math.max(250, gap)), signal);
    onEvent(event);
    previous = event;
  }
}
