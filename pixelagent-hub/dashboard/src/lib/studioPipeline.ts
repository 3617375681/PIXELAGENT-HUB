import type { StudioEvent } from '../types/studio';

export type StageId = 'manager' | 'coder' | 'builder' | 'tester';
export type StageState = 'idle' | 'active' | 'done' | 'failed' | 'skipped';
export type PipelineStage = { id: StageId; name: string; icon: string; color: string; detail: string; state: StageState; label: string };
/** A failure travelling back to the Coder: real compiler output or a failed browser check. */
export type PipelineFeedback = { from: 'builder' | 'tester'; round?: number; message: string };
export type PipelineView = {
  stages: PipelineStage[];
  round: number;
  feedback: PipelineFeedback | null;
  terminal: 'ready_for_review' | 'failed' | 'cancelled' | null;
  derived: boolean;
};

export const STAGE_ORDER: StageId[] = ['manager', 'coder', 'builder', 'tester'];
const STAGES: Record<StageId, Omit<PipelineStage, 'state' | 'label'>> = {
  manager: { id: 'manager', name: 'Manager', icon: '👾', color: '#00d4ff', detail: 'Plans the work' },
  coder: { id: 'coder', name: 'Coder', icon: '⌨️', color: '#22c55e', detail: 'Writes the code' },
  builder: { id: 'builder', name: 'Builder', icon: '🔧', color: '#a855f7', detail: 'Compiles it' },
  tester: { id: 'tester', name: 'Tester', icon: '🧪', color: '#f59e0b', detail: 'Clicks through it' },
};
const PHASE_STAGE: Record<string, StageId> = { planning: 'manager', coding: 'coder', building: 'builder' };

const text = (value: unknown) => (typeof value === 'string' ? value : '');
/**
 * Most informative line, shortened for a label: skips generic headers such as esbuild's
 * "Build failed with 1 error:" so the actual "file:line: ERROR: …" line is shown.
 */
export const firstLine = (value: string, max = 140) => {
  const lines = value.split('\n').map((part) => part.trim()).filter(Boolean);
  const line = lines.find((part) => !/^build failed with \d+ errors?:?$/i.test(part)) || lines[0] || value.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Pure reduction of the server's event log into what the pixel pipeline shows. */
export function reducePipeline(events: StudioEvent[]): PipelineView {
  const state = Object.fromEntries(STAGE_ORDER.map((id) => [id, { state: 'idle' as StageState, label: 'Waiting' }])) as Record<StageId, { state: StageState; label: string }>;
  const set = (id: StageId, next: StageState, label: string) => { state[id] = { state: next, label }; };
  let round = 0;
  let feedback: PipelineFeedback | null = null;
  let terminal: PipelineView['terminal'] = null;
  let checks = { total: 0, passed: 0, failed: 0 };

  for (const event of events) {
    switch (event.type) {
      case 'queued': set('manager', 'idle', 'Queued'); break;
      case 'phase': {
        const stage = PHASE_STAGE[text(event.data?.phase)];
        if (!stage) break;
        if (stage === 'coder') {
          round = event.round ?? round + 1;
          if (state.manager.state === 'idle') set('manager', 'skipped', 'No plan this run');
          set('builder', 'idle', 'Waiting');
        }
        set(stage, 'active', stage === 'manager' ? 'Planning…' : stage === 'coder' ? `Writing code · round ${round}` : `Compiling · round ${round}`);
        break;
      }
      case 'plan_ready': set('manager', 'done', 'Plan ready'); break;
      case 'code_ready': set('coder', 'done', `${Number(event.data?.files) || 0} files written`); break;
      case 'build_failed': {
        const errors = Array.isArray(event.data?.errors) ? event.data.errors.map(text) : [];
        set('builder', 'failed', `Build failed · round ${event.round ?? round}`);
        feedback = { from: 'builder', round: event.round, message: firstLine(errors[0] || 'Build failed') };
        break;
      }
      case 'build_passed': set('builder', 'done', 'Build passed'); feedback = null; break;
      case 'ready_for_review': terminal = 'ready_for_review'; set('tester', 'idle', 'Ready to test'); break;
      case 'failed':
      case 'cancelled': {
        terminal = event.type;
        const stopped = PHASE_STAGE[text(event.data?.stoppedPhase)];
        const active = STAGE_ORDER.find((id) => state[id].state === 'active');
        const target = active || stopped;
        if (target) set(target, 'failed', event.type === 'cancelled' ? 'Cancelled' : event.data?.interrupted ? 'Interrupted' : 'Failed');
        break;
      }
      case 'test_plan_started': set('tester', 'active', 'Writing checks…'); break;
      case 'test_plan_ready': set('tester', 'done', `${Number(event.data?.checks) || 0} checks planned`); break;
      case 'test_plan_failed': set('tester', 'failed', event.data?.status === 'cancelled' ? 'Plan cancelled' : 'Plan failed'); break;
      case 'browser_run_started':
        checks = { total: Number(event.data?.checks) || 0, passed: 0, failed: 0 };
        feedback = null;
        set('tester', 'active', `Testing 0/${checks.total}`);
        break;
      case 'browser_check':
        if (event.data?.passed) checks.passed++;
        else {
          checks.failed++;
          feedback ??= { from: 'tester', message: firstLine(`${text(event.data?.name)}: got ${JSON.stringify(text(event.data?.actual))}`) };
        }
        set('tester', 'active', `Testing ${checks.passed + checks.failed}/${checks.total || '?'}`);
        break;
      case 'browser_run_finished': {
        const passed = Number(event.data?.passed) || 0;
        const total = passed + (Number(event.data?.failed) || 0);
        set('tester', event.data?.status === 'passed' ? 'done' : 'failed', event.data?.status === 'passed' ? `All checks passed ${passed}/${total}` : event.data?.status === 'cancelled' ? 'Checks cancelled' : `Checks failed ${passed}/${total}`);
        if (event.data?.status !== 'passed' && !feedback && text(event.data?.error)) feedback = { from: 'tester', message: firstLine(text(event.data?.error)) };
        break;
      }
    }
  }
  return {
    stages: STAGE_ORDER.map((id) => ({ ...STAGES[id], ...state[id] })),
    round, feedback, terminal,
    derived: events.some((event) => event.data?.derived === true),
  };
}

/** One readable line per event for the log beside the graph. */
export function describeEvent(event: StudioEvent): string {
  const r = event.round ? `R${event.round} · ` : '';
  const d = event.data || {};
  switch (event.type) {
    case 'queued': return 'Mission queued';
    case 'phase': return `${r}${{ planning: 'Manager is planning', coding: 'Coder is writing code', building: 'Builder is compiling' }[text(d.phase)] || text(d.phase)}`;
    case 'plan_ready': return `Plan ready${text(d.projectName) ? `: ${text(d.projectName)}` : ''}`;
    case 'code_ready': return `${r}${Number(d.files) || 0} files written`;
    case 'build_failed': return `${r}Build failed: ${firstLine(text((d.errors as unknown[] | undefined)?.[0]) || 'unknown error', 200)}`;
    case 'build_passed': return `${r}Build passed`;
    case 'ready_for_review': return 'Built. Ready to play';
    case 'failed': return `Run failed${text(d.error) ? `: ${firstLine(text(d.error), 200)}` : ''}`;
    case 'cancelled': return 'Run cancelled';
    case 'test_plan_started': return 'Tester is writing checks';
    case 'test_plan_ready': return `${Number(d.checks) || 0} checks planned`;
    case 'test_plan_failed': return d.status === 'cancelled' ? 'Check plan cancelled' : `Check plan failed${text(d.error) ? `: ${firstLine(text(d.error), 200)}` : ''}`;
    case 'browser_run_started': return `Browser test started · ${Number(d.checks) || 0} checks`;
    case 'browser_check': return `${d.passed ? 'PASS' : 'FAIL'} ${text(d.name)}${d.passed ? '' : ` (got ${JSON.stringify(text(d.actual))})`}`;
    case 'browser_run_finished': return d.status === 'passed' ? `All ${Number(d.passed) || 0} checks passed` : `Browser test ${text(d.status)}: ${Number(d.passed) || 0} passed, ${Number(d.failed) || 0} failed`;
  }
}
