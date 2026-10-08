import { expect, it } from 'vitest';
import { studioStages } from './studioStages';
import type { StudioProject } from '../types/studio';

const project = (overrides: Partial<StudioProject>): StudioProject => ({ projectId: 'fixture', description: 'Fixture', startedAt: '', status: 'failed', rounds: [], ...overrides });
const labels = (value: StudioProject) => studioStages(value).map((stage) => stage.label);

it('shows a failed planning attempt and unexecuted downstream work', () => {
  expect(labels(project({ stoppedPhase: 'planning' }))).toEqual(['失败', '未执行', '未执行']);
});

it('retains completed planning and exposes a legacy code failure', () => {
  expect(labels(project({ plan: { status: 'success', output: {} }, rounds: [{ round: 1, code: { status: 'failed' } }] }))).toEqual(['完成', '失败', '未执行']);
});

it('distinguishes restart interruption from user cancellation', () => {
  const value = project({ stoppedPhase: 'coding', plan: { status: 'success', output: {} }, error: 'Recovered after process restart' });
  expect(labels(value)).toEqual(['完成', '已中断', '未执行']);
  expect(labels({ ...value, status: 'cancelled' })).toEqual(['完成', '已取消', '未执行']);
});

it('shows active build repair even when the previous round returned code', () => {
  const value = project({ status: 'running', phase: 'coding', plan: { status: 'success', output: {} }, rounds: [{ round: 1, code: { status: 'success' }, build: { status: 'failed', errors: ['syntax'], checkedFiles: [], browserVerified: false } }] });
  expect(labels(value)).toEqual(['完成', '工作中', '失败']);
});

it('does not invent Manager execution for a cancelled baseline', () => {
  expect(labels(project({ strategy: 'coder-only', status: 'cancelled', stoppedPhase: 'coding' }))).toEqual(['对照组未执行', '已取消', '未执行']);
});

it('leaves the interruption location unknown when a legacy record has no stage evidence', () => {
  expect(labels(project({}))).toEqual(['未完成', '未完成', '未完成']);
});
