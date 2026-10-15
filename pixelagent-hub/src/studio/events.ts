import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StudioRecord } from './softwareStudio.js';
import type { TestPlanRecord } from './testPlans.js';
import type { BrowserRun } from './browserRuns.js';

export type StudioEventType =
  | 'queued' | 'phase' | 'plan_ready' | 'code_ready' | 'build_failed' | 'build_passed'
  | 'ready_for_review' | 'failed' | 'cancelled'
  | 'test_plan_started' | 'test_plan_ready' | 'test_plan_failed'
  | 'browser_run_started' | 'browser_check' | 'browser_run_finished';
export type StudioEvent = { seq: number; at: string; type: StudioEventType; round?: number; data?: Record<string, unknown> };
export type StudioEventInput = Omit<StudioEvent, 'seq' | 'at'>;

/** Generation ends with exactly one of these; later events only concern checks of the finished preview. */
const terminal = new Set<StudioEventType>(['ready_for_review', 'failed', 'cancelled']);
export const isTerminalStudioEvent = (event: Pick<StudioEvent, 'type'>) => terminal.has(event.type);

/** `partialLine`: the file ends without a newline (a crash mid-write), so the next append must start a new line. */
type LogState = { seq: number; terminated: boolean; partialLine: boolean };
const pending = new Map<string, Promise<LogState>>();
const listeners = new Map<string, Set<(event: StudioEvent) => void>>();
const logFile = (root: string, projectId: string) => join(root, projectId, 'events.jsonl');

async function loadState(file: string): Promise<LogState> {
  const text = await readText(file);
  const events = parseLog(text);
  return { seq: events.at(-1)?.seq ?? 0, terminated: events.some(isTerminalStudioEvent), partialLine: text.length > 0 && !text.endsWith('\n') };
}

async function readText(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error; }
}

const readLog = async (file: string) => parseLog(await readText(file));

function parseLog(text: string): StudioEvent[] {
  const events: StudioEvent[] = [];
  // A crash can leave a truncated final line; skip anything that does not parse.
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* partial write */ }
  }
  return events;
}

/**
 * Appends one event, assigning a per-project sequence number, and notifies live subscribers.
 * Writers share one process, so a per-file promise chain keeps sequence numbers ordered.
 * A second terminal event (e.g. user cancel followed by the runner noticing the abort) is dropped.
 */
export async function appendStudioEvent(root: string, projectId: string, input: StudioEventInput): Promise<StudioEvent | null> {
  const file = logFile(root, projectId);
  const previous = pending.get(file) || loadState(file);
  const next = previous.catch(() => loadState(file)).then(async (state): Promise<{ state: LogState; event: StudioEvent | null }> => {
    if (state.terminated && isTerminalStudioEvent(input)) return { state, event: null };
    const event: StudioEvent = { seq: state.seq + 1, at: new Date().toISOString(), ...input };
    await mkdir(join(root, projectId), { recursive: true });
    await appendFile(file, `${state.partialLine ? '\n' : ''}${JSON.stringify(event)}\n`);
    return { state: { seq: event.seq, terminated: state.terminated || isTerminalStudioEvent(event), partialLine: false }, event };
  });
  const chained = next.then((result) => result.state);
  chained.catch(() => {}); // The caller sees the failure via `next`; the next append reloads state from disk.
  pending.set(file, chained);
  const { event } = await next;
  if (event) for (const listener of listeners.get(file) || []) listener(event);
  return event;
}

export async function readStudioEvents(root: string, projectId: string, after = 0): Promise<StudioEvent[]> {
  const file = logFile(root, projectId);
  await pending.get(file)?.catch(() => {});
  return (await readLog(file)).filter((event) => event.seq > after);
}

export function subscribeStudioEvents(root: string, projectId: string, listener: (event: StudioEvent) => void): () => void {
  const file = logFile(root, projectId);
  const set = listeners.get(file) || new Set();
  set.add(listener); listeners.set(file, set);
  return () => { set.delete(listener); if (!set.size) listeners.delete(file); };
}

export const studioEventListenerCount = (root: string, projectId: string) => listeners.get(logFile(root, projectId))?.size || 0;

/**
 * Coarse timeline for records created before event logs existed: the generation (timestamps are only
 * its start and finish), then any saved test plans and browser runs at their own recorded times.
 */
export function deriveEventsFromRecord(record: StudioRecord, saved: { testPlans?: TestPlanRecord[]; browserRuns?: BrowserRun[] } = {}): StudioEvent[] {
  const generation = deriveGeneration(record);
  const derived = { derived: true };
  const later: (StudioEventInput & { at: string })[] = [];
  const activity = [
    ...(saved.testPlans || []).map((plan) => ({ at: plan.startedAt, plan })),
    ...(saved.browserRuns || []).map((run) => ({ at: run.startedAt, run })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const item of activity) {
    if ('plan' in item) {
      const { plan } = item;
      later.push({ at: plan.startedAt, type: 'test_plan_started', data: { ...derived, planId: plan.id } });
      if (plan.status === 'ready') later.push({ at: plan.finishedAt || plan.startedAt, type: 'test_plan_ready', data: { ...derived, planId: plan.id, checks: plan.result?.output?.checks?.length ?? 0 } });
      else if (plan.status === 'failed' || plan.status === 'cancelled') later.push({ at: plan.finishedAt || plan.startedAt, type: 'test_plan_failed', data: { ...derived, planId: plan.id, status: plan.status, error: plan.error?.slice(0, 300) } });
      continue;
    }
    const { run } = item;
    const end = run.finishedAt || run.startedAt;
    later.push({ at: run.startedAt, type: 'browser_run_started', data: { ...derived, runId: run.id, testPlanId: run.testPlanId, checks: run.checks.length } });
    for (const check of run.checks) later.push({ at: end, type: 'browser_check', data: { ...derived, runId: run.id, name: check.name, passed: check.status === 'passed', actual: check.actual } });
    if (['passed', 'failed', 'cancelled'].includes(run.status)) {
      const passed = run.checks.filter((check) => check.status === 'passed').length;
      later.push({ at: end, type: 'browser_run_finished', data: { ...derived, runId: run.id, status: run.status, passed, failed: run.checks.length - passed, error: run.error?.slice(0, 300) } });
    }
  }
  return [...generation, ...later].map((event, index) => ({ ...event, seq: index + 1 }));
}

function deriveGeneration(record: StudioRecord): (StudioEventInput & { at: string })[] {
  const events: StudioEventInput[] = [];
  const derived = { derived: true };
  if (record.plan) events.push({ type: 'phase', data: { ...derived, phase: 'planning' } }, ...(record.plan.status === 'success' ? [{ type: 'plan_ready' as const, data: { ...derived, projectName: record.plan.output?.projectName } }] : []));
  for (const attempt of record.rounds) {
    events.push({ type: 'phase', round: attempt.round, data: { ...derived, phase: 'coding' } });
    if (attempt.code.status !== 'success') continue;
    events.push({ type: 'code_ready', round: attempt.round, data: { ...derived, files: attempt.code.output?.files?.length ?? 0 } });
    if (!attempt.build) continue;
    events.push({ type: 'phase', round: attempt.round, data: { ...derived, phase: 'building' } });
    events.push(attempt.build.status === 'passed'
      ? { type: 'build_passed', round: attempt.round, data: derived }
      : { type: 'build_failed', round: attempt.round, data: { ...derived, errors: summarizeErrors(attempt.build.errors) } });
  }
  const last = record.rounds.at(-1)?.round;
  if (record.status === 'ready_for_review') events.push({ type: 'ready_for_review', round: last, data: { ...derived, previewFile: record.previewFile } });
  if (record.status === 'failed' || record.status === 'cancelled') events.push({ type: record.status, data: { ...derived, stoppedPhase: record.stoppedPhase, error: record.error?.slice(0, 300) } });
  return events.map((event, index) => ({ at: index === events.length - 1 && record.finishedAt ? record.finishedAt : record.startedAt, ...event }));
}

/** Keeps compiler output readable in an event: first three errors, 300 characters each. */
export const summarizeErrors = (errors: string[]) => errors.slice(0, 3).map((error) => error.slice(0, 300));
