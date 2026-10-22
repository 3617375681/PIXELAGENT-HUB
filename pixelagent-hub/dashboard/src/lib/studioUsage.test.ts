import { expect, it } from 'vitest';
import { agentUsage } from './studioUsage';
import type { StudioProject, StudioTestPlan, StudioEvent } from '../types/studio';

const output = (llmModel: string, total_tokens?: number) => ({ llmModel, ...(total_tokens === undefined ? {} : { llmUsage: { total_tokens } }) });
const project = { plan: { output: output('main', 10) }, rounds: [{ code: { output: output('main', 20) } }, { code: { output: output('main', 30) } }] } as StudioProject;

it.each(['tester', 'main'])('maps the Tester plan and review using %s', (model) => {
  const plans = [{ id: 'plan', projectId: 'project', previewFile: 'index.html', jobId: 'job', status: 'ready', result: { status: 'success', output: { ...output(model, 5), checks: [], limitations: [] } } }] as StudioTestPlan[];
  const events = [
    { seq: 1, at: '', type: 'test_plan_ready', data: output(model, 5) },
    { seq: 1, at: '', type: 'test_plan_ready', data: { review: true, ...output(model, 7) } },
  ] as StudioEvent[];
  expect(agentUsage(project, plans, events)).toEqual([
    { agent: 'Manager', models: ['main'], tokens: 10 },
    { agent: 'Coder', models: ['main'], tokens: 50 },
    { agent: 'Tester', models: [model], tokens: 12 },
  ]);
});
it('keeps review-only models and missing usage distinct from zero', () => {
  const events = [{ seq: 1, at: '', type: 'test_plan_ready', data: { review: true, llmModel: 'review' } }] as StudioEvent[];
  expect(agentUsage({ rounds: [{ code: { output: output('main', 0) } }] } as StudioProject, [], events)).toEqual([
    { agent: 'Manager', models: [], tokens: null },
    { agent: 'Coder', models: ['main'], tokens: 0 },
    { agent: 'Tester', models: ['review'], tokens: null },
  ]);
});
