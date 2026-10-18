import type { StudioEvent } from '../types/studio';

/**
 * Static, read-only replay build (GitHub Pages): `VITE_REPLAY=1`.
 * GET requests read files recorded by `scripts/export-replay.ts`; writes are refused.
 */
export const REPLAY = import.meta.env.VITE_REPLAY === '1';
export const REPLAY_READ_ONLY = 'This is a read-only replay. Clone the repo and run it locally to build your own.';
export type ReplayCase = {
  projectId: string; kind: 'mock' | 'real-model'; title: string; note: string;
  /** `featured`: the demo and repair story; `series`: one generation of the 2026-10-15 strategy comparison. */
  group?: 'featured' | 'series' | 'showcase';
  caseId?: string; strategy?: 'manager-coder' | 'coder-only'; run?: number;
  outcome?: 'passed' | 'checks-failed' | 'not-built'; checks?: string;
  /** API path of the final browser screenshot (showcase cards). */
  screenshot?: string;
};
export type ReplayManifest = { recordedAt: string; hero: string; cases: ReplayCase[] };

/** `/api/studio/projects/<id>/archive` → `<base>replay/api/studio/projects/<id>/archive.zip`; JSON routes get `.json`. */
export function replayFileUrl(apiPath: string): string {
  const path = apiPath.split('?')[0];
  const file = path.endsWith('/archive') ? `${path}.zip` : /\.png$/.test(path) ? path : `${path}.json`;
  return `${import.meta.env.BASE_URL}replay${file}`;
}

let manifest: Promise<ReplayManifest> | undefined;
export const loadReplayManifest = () => (manifest ??= fetch(`${import.meta.env.BASE_URL}replay/manifest.json`).then((res) => {
  if (!res.ok) throw new Error(`Replay data missing (HTTP ${res.status})`);
  return res.json() as Promise<ReplayManifest>;
}));

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

async function recordedEvents(projectId: string, signal?: AbortSignal) {
  const res = await fetch(replayFileUrl(`/api/studio/projects/${encodeURIComponent(projectId)}/events`), { signal });
  if (!res.ok) throw new Error(`Replay events missing (HTTP ${res.status})`);
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
