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
  manager: { id: 'manager', name: 'Manager', icon: '👾', color: '#00d4ff', detail: '需求与规划' },
  coder: { id: 'coder', name: 'Coder', icon: '⌨️', color: '#22c55e', detail: '生成真实源码' },
  builder: { id: 'builder', name: 'Builder', icon: '🔧', color: '#a855f7', detail: '编译与错误返修' },
  tester: { id: 'tester', name: 'Tester', icon: '🧪', color: '#f59e0b', detail: '浏览器交互检查' },
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
  const state = Object.fromEntries(STAGE_ORDER.map((id) => [id, { state: 'idle' as StageState, label: '等待' }])) as Record<StageId, { state: StageState; label: string }>;
  const set = (id: StageId, next: StageState, label: string) => { state[id] = { state: next, label }; };
  let round = 0;
  let feedback: PipelineFeedback | null = null;
  let terminal: PipelineView['terminal'] = null;
  let checks = { total: 0, passed: 0, failed: 0 };

  for (const event of events) {
    switch (event.type) {
      case 'queued': set('manager', 'idle', '排队中'); break;
      case 'phase': {
        const stage = PHASE_STAGE[text(event.data?.phase)];
        if (!stage) break;
        if (stage === 'coder') {
          round = event.round ?? round + 1;
          if (state.manager.state === 'idle') set('manager', 'skipped', '本次未规划');
          set('builder', 'idle', '等待');
        }
        set(stage, 'active', stage === 'manager' ? '规划中' : stage === 'coder' ? `第 ${round} 轮编码` : `第 ${round} 轮编译`);
        break;
      }
      case 'plan_ready': set('manager', 'done', '计划完成'); break;
      case 'code_ready': set('coder', 'done', `${Number(event.data?.files) || 0} 个文件`); break;
      case 'build_failed': {
        const errors = Array.isArray(event.data?.errors) ? event.data.errors.map(text) : [];
        set('builder', 'failed', `第 ${event.round ?? round} 轮编译失败`);
        feedback = { from: 'builder', round: event.round, message: firstLine(errors[0] || '编译失败') };
        break;
      }
      case 'build_passed': set('builder', 'done', '编译通过'); feedback = null; break;
      case 'ready_for_review': terminal = 'ready_for_review'; set('tester', 'idle', '可生成检查'); break;
      case 'failed':
      case 'cancelled': {
        terminal = event.type;
        const stopped = PHASE_STAGE[text(event.data?.stoppedPhase)];
        const active = STAGE_ORDER.find((id) => state[id].state === 'active');
        const target = active || stopped;
        if (target) set(target, 'failed', event.type === 'cancelled' ? '已取消' : event.data?.interrupted ? '已中断' : '失败');
        break;
      }
      case 'test_plan_started': set('tester', 'active', '生成检查计划'); break;
      case 'test_plan_ready': set('tester', 'done', `计划就绪 · ${Number(event.data?.checks) || 0} 项`); break;
      case 'test_plan_failed': set('tester', 'failed', event.data?.status === 'cancelled' ? '计划已取消' : '计划失败'); break;
      case 'browser_run_started':
        checks = { total: Number(event.data?.checks) || 0, passed: 0, failed: 0 };
        feedback = null;
        set('tester', 'active', `浏览器检查 0/${checks.total}`);
        break;
      case 'browser_check':
        if (event.data?.passed) checks.passed++;
        else {
          checks.failed++;
          feedback ??= { from: 'tester', message: firstLine(`${text(event.data?.name)}：实际为 ${JSON.stringify(text(event.data?.actual))}`) };
        }
        set('tester', 'active', `浏览器检查 ${checks.passed + checks.failed}/${checks.total || '?'}`);
        break;
      case 'browser_run_finished': {
        const passed = Number(event.data?.passed) || 0;
        const total = passed + (Number(event.data?.failed) || 0);
        set('tester', event.data?.status === 'passed' ? 'done' : 'failed', event.data?.status === 'passed' ? `检查通过 ${passed}/${total}` : event.data?.status === 'cancelled' ? '检查已取消' : `检查未通过 ${passed}/${total}`);
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
  const r = event.round ? `第 ${event.round} 轮 · ` : '';
  const d = event.data || {};
  switch (event.type) {
    case 'queued': return '任务进入队列';
    case 'phase': return `${r}${{ planning: 'Manager 开始规划', coding: 'Coder 开始编写源码', building: 'Builder 开始真实编译' }[text(d.phase)] || text(d.phase)}`;
    case 'plan_ready': return `规划完成${text(d.projectName) ? `：${text(d.projectName)}` : ''}`;
    case 'code_ready': return `${r}生成 ${Number(d.files) || 0} 个文件`;
    case 'build_failed': return `${r}编译失败：${firstLine(text((d.errors as unknown[] | undefined)?.[0]) || '未知错误', 200)}`;
    case 'build_passed': return `${r}编译通过`;
    case 'ready_for_review': return '构建完成，可以试玩（尚未验收）';
    case 'failed': return `运行失败${text(d.error) ? `：${firstLine(text(d.error), 200)}` : ''}`;
    case 'cancelled': return '运行已取消';
    case 'test_plan_started': return 'Tester 开始生成检查计划';
    case 'test_plan_ready': return `检查计划就绪，共 ${Number(d.checks) || 0} 项`;
    case 'test_plan_failed': return d.status === 'cancelled' ? '检查计划已取消' : `检查计划失败${text(d.error) ? `：${firstLine(text(d.error), 200)}` : ''}`;
    case 'browser_run_started': return `独立浏览器开始执行 ${Number(d.checks) || 0} 项检查`;
    case 'browser_check': return `${d.passed ? '✓' : '✗'} ${text(d.name)}${d.passed ? '' : `（实际 ${JSON.stringify(text(d.actual))}）`}`;
    case 'browser_run_finished': return d.status === 'passed' ? `浏览器检查全部通过（${Number(d.passed) || 0} 项）` : `浏览器检查结束：${text(d.status)}，通过 ${Number(d.passed) || 0}，失败 ${Number(d.failed) || 0}`;
  }
}
