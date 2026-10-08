import type { StudioProject } from '../types/studio';

export function studioStages(project: StudioProject | null) {
  const current = project?.rounds.at(-1);
  const stopped = project?.status === 'failed' || project?.status === 'cancelled';
  const stoppedPhase = project?.stoppedPhase || (project?.plan?.status === 'failed' ? 'planning' : current?.code.status === 'failed' ? 'coding' : current?.build?.status === 'failed' ? 'building' : undefined);
  const interrupted = /Recovered after process restart|Generation was interrupted/.test(project?.error || '');
  return [
    { icon: '▤', name: 'Manager', detail: '需求与规划', phase: 'planning', done: project?.plan?.status === 'success', failed: project?.plan?.status === 'failed' },
    { icon: '⌘', name: 'Coder', detail: '生成真实源码', phase: 'coding', done: current?.code.status === 'success', failed: current?.code.status === 'failed' },
    { icon: '▣', name: 'Builder', detail: '编译与错误返修', phase: 'building', done: current?.build?.status === 'passed', failed: current?.build?.status === 'failed' },
  ].map((stage) => {
    if (stage.name === 'Manager' && project?.strategy === 'coder-only') return { ...stage, state: 'skipped', label: '对照组未执行' };
    if (project?.status === 'running' && project.phase === stage.phase) return { ...stage, state: 'active', label: '工作中' };
    if (stage.done) return { ...stage, state: 'done', label: '完成' };
    if (stopped && stoppedPhase === stage.phase) return { ...stage, state: 'failed', label: project?.status === 'cancelled' ? '已取消' : interrupted ? '已中断' : '失败' };
    if (stage.failed) return { ...stage, state: 'failed', label: '失败' };
    return { ...stage, state: '', label: stopped ? stoppedPhase ? '未执行' : '未完成' : '等待' };
  });
}
