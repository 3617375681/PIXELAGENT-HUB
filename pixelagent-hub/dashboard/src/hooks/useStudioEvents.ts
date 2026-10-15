import { useEffect, useState } from 'react';
import { streamStudioEvents, studioApi } from '../lib/recordsApi';
import type { StudioEvent } from '../types/studio';

const TERMINAL = new Set(['ready_for_review', 'failed', 'cancelled']);
const FALLBACK_POLL_MS = 2000;
const AFTER_GENERATION_POLL_MS = 4000;

/**
 * Event timeline for one project: initial JSON read, then the SSE stream while the generation runs.
 * After the generation ends (or if streaming is unavailable) it polls for later Tester/browser events.
 */
export function useStudioEvents(projectId: string | undefined, refreshKey = 0) {
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [derived, setDerived] = useState(false);

  useEffect(() => {
    setEvents([]); setDerived(false);
    if (!projectId) return;
    const controller = new AbortController();
    const { signal } = controller;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const add = (incoming: StudioEvent[]) => {
      const fresh = incoming.filter((event) => event.seq > last).sort((a, b) => a.seq - b.seq);
      if (!fresh.length) return;
      last = fresh.at(-1)!.seq;
      setEvents((current) => [...current, ...fresh]);
    };
    const poll = (delay: number) => {
      timer = setTimeout(async () => {
        try {
          const page = await studioApi.events(projectId, last, signal);
          add(page.events);
        } catch { /* keep polling; the page shows API errors from its own requests */ }
        if (!signal.aborted) poll(delay);
      }, delay);
    };
    void (async () => {
      try {
        const page = await studioApi.events(projectId, 0, signal);
        setDerived(page.derived);
        add(page.events);
        if (page.derived) return; // rebuilt from an old record; nothing more will arrive
        if (!page.events.some((event) => TERMINAL.has(event.type))) {
          await streamStudioEvents(projectId, last, (event) => add([event]), signal);
        }
        if (!signal.aborted) poll(AFTER_GENERATION_POLL_MS);
      } catch {
        if (!signal.aborted) poll(FALLBACK_POLL_MS);
      }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, refreshKey]);

  return { events, derived };
}
