import { expect, it } from 'vitest';
import { describeEvent, reducePipeline } from './studioPipeline';
import type { StudioEvent, StudioEventType } from '../types/studio';

let seq = 0;
const ev = (type: StudioEventType, round?: number, data?: Record<string, unknown>): StudioEvent => ({ seq: ++seq, at: '2026-10-14T00:00:00.000Z', type, round, data });
const states = (events: StudioEvent[]) => reducePipeline(events).stages.map((stage) => `${stage.id}:${stage.state}`);

it('describes a reverted repair without changing the event', () => {
  const event = Object.freeze({ ...ev('ready_for_review', undefined, Object.freeze({ repairReverted: true })) });
  expect(describeEvent(event)).toBe('Repair made it worse; kept the earlier build');
  expect(describeEvent(ev('ready_for_review'))).toBe('Built. Ready to play');
});

const repairRun = [
  ev('queued'), ev('phase', undefined, { phase: 'planning' }), ev('plan_ready', undefined, { projectName: 'Counter' }),
  ev('phase', 1, { phase: 'coding' }), ev('code_ready', 1, { files: 4 }), ev('phase', 1, { phase: 'building' }),
  ev('build_failed', 1, { errors: ['Build failed with 1 error:\napp.js:3:103: ERROR: Expected ")" but found ";"'] }),
];

it('lights the active stage and keeps finished stages done', () => {
  expect(states(repairRun.slice(0, 2))).toEqual(['manager:active', 'coder:idle', 'builder:idle', 'tester:idle']);
  expect(states(repairRun.slice(0, 5))).toEqual(['manager:done', 'coder:done', 'builder:idle', 'tester:idle']);
});

it('sends the real compiler error back to the Coder until a later build passes', () => {
  const failed = reducePipeline(repairRun);
  expect(failed.stages[2].state).toBe('failed');
  expect(failed.feedback).toEqual({ from: 'builder', round: 1, message: 'app.js:3:103: ERROR: Expected ")" but found ";"' });
  const retrying = reducePipeline([...repairRun, ev('phase', 2, { phase: 'coding' })]);
  expect(retrying.round).toBe(2);
  expect(retrying.stages.map((stage) => stage.state)).toEqual(['done', 'active', 'idle', 'idle']);
  expect(retrying.feedback?.from).toBe('builder');
  const passed = reducePipeline([...repairRun, ev('phase', 2, { phase: 'coding' }), ev('code_ready', 2, { files: 4 }), ev('phase', 2, { phase: 'building' }), ev('build_passed', 2), ev('ready_for_review', 2)]);
  expect(passed.feedback).toBeNull();
  expect(passed.terminal).toBe('ready_for_review');
  expect(states([...repairRun, ev('phase', 2, { phase: 'coding' }), ev('code_ready', 2), ev('phase', 2, { phase: 'building' }), ev('build_passed', 2)])).toEqual(['manager:done', 'coder:done', 'builder:done', 'tester:idle']);
});

it('marks the interrupted stage when a run is cancelled or fails', () => {
  const cancelled = reducePipeline([...repairRun.slice(0, 4), ev('cancelled', undefined, { stoppedPhase: 'coding' })]);
  expect(cancelled.terminal).toBe('cancelled');
  expect(cancelled.stages[1]).toMatchObject({ state: 'failed', label: 'Cancelled' });
  const interrupted = reducePipeline([ev('queued'), ev('failed', undefined, { stoppedPhase: 'planning', interrupted: true })]);
  expect(interrupted.stages[0]).toMatchObject({ state: 'failed', label: 'Interrupted' });
});

it('shows coder-only runs without inventing a Manager plan', () => {
  expect(states([ev('queued'), ev('phase', 1, { phase: 'coding' })])).toEqual(['manager:skipped', 'coder:active', 'builder:idle', 'tester:idle']);
});

it('follows Tester planning and browser checks, sending a failed check back as feedback', () => {
  const ready = [...repairRun, ev('build_passed', 1), ev('ready_for_review', 1)];
  const checking = reducePipeline([...ready, ev('test_plan_started'), ev('test_plan_ready', undefined, { checks: 2 }), ev('browser_run_started', undefined, { checks: 2 }), ev('browser_check', undefined, { name: 'Increment', passed: false, actual: '2' })]);
  expect(checking.stages[3]).toMatchObject({ state: 'active', label: 'Testing 1/2' });
  expect(checking.feedback).toEqual({ from: 'tester', message: 'Increment: got "2"' });
  const finished = reducePipeline([...ready, ev('browser_run_started', undefined, { checks: 2 }), ev('browser_check', undefined, { name: 'A', passed: true }), ev('browser_check', undefined, { name: 'B', passed: true }), ev('browser_run_finished', undefined, { status: 'passed', passed: 2, failed: 0 })]);
  expect(finished.stages[3]).toMatchObject({ state: 'done', label: 'All checks passed 2/2' });
  expect(finished.feedback).toBeNull();
});

it('flags timelines rebuilt from old records and describes every event', () => {
  expect(reducePipeline([ev('failed', undefined, { derived: true })]).derived).toBe(true);
  expect(describeEvent(repairRun[6])).toBe('R1 · Build failed: app.js:3:103: ERROR: Expected ")" but found ";"');
  expect(describeEvent(ev('browser_check', undefined, { name: 'B', passed: false, actual: 'x' }))).toBe('FAIL B (got "x")');
});

it('a live run that checks before its terminal event keeps the Tester result and shows the browser repair edge', () => {
  const live = [
    ev('queued'), ev('phase', undefined, { phase: 'planning' }), ev('plan_ready'),
    ev('phase', 1, { phase: 'coding' }), ev('code_ready', 1, { files: 3 }), ev('phase', 1, { phase: 'building' }), ev('build_passed', 1),
    ev('test_plan_started'), ev('test_plan_ready', undefined, { checks: 2 }),
    ev('browser_run_started', undefined, { checks: 2 }), ev('browser_check', undefined, { name: 'Adds one', passed: false, actual: '2' }), ev('browser_check', undefined, { name: 'Resets', passed: true, actual: '0' }),
    ev('browser_run_finished', undefined, { status: 'failed', passed: 1, failed: 1 }),
  ];
  const failed = reducePipeline(live);
  expect(failed.feedback).toEqual({ from: 'tester', message: 'Adds one: got "2"' });
  const repaired = [...live,
    ev('phase', 2, { phase: 'coding' }), ev('code_ready', 2, { files: 3 }), ev('phase', 2, { phase: 'building' }), ev('build_passed', 2),
    ev('browser_run_started', undefined, { checks: 2 }), ev('browser_check', undefined, { name: 'Adds one', passed: true, actual: '1' }), ev('browser_check', undefined, { name: 'Resets', passed: true, actual: '0' }),
    ev('browser_run_finished', undefined, { status: 'passed', passed: 2, failed: 0 }), ev('ready_for_review', 2),
  ];
  const view = reducePipeline(repaired);
  expect(view.terminal).toBe('ready_for_review');
  expect(view.round).toBe(2);
  expect(view.feedback).toBeNull();
  expect(view.stages.find((stage) => stage.id === 'tester')).toMatchObject({ state: 'done', label: 'All checks passed 2/2' });
});

it('a Tester review that revises its checks clears the feedback edge; one that stands keeps it', () => {
  const failed = [ev('browser_run_started', undefined, { checks: 1 }), ev('browser_check', undefined, { name: 'Adds one', passed: false, actual: '0' }), ev('browser_run_finished', undefined, { status: 'failed', passed: 0, failed: 1 }), ev('test_plan_started', undefined, { review: true })];
  expect(reducePipeline(failed).stages.find((stage) => stage.id === 'tester')?.label).toBe('Reviewing its checks…');
  const revised = reducePipeline([...failed, ev('test_plan_ready', undefined, { review: true, revised: 1 })]);
  expect(revised.feedback).toBeNull();
  expect(revised.stages.find((stage) => stage.id === 'tester')?.label).toBe('1 check revised');
  expect(reducePipeline([...failed, ev('test_plan_ready', undefined, { review: true, revised: 0 })]).feedback?.from).toBe('tester');
  expect(describeEvent(ev('test_plan_ready', undefined, { review: true, revised: 2 }))).toBe('Tester corrected 2 of its own checks');
});

it('reports dropped checks and clears feedback only when a review changed the plan', () => {
  const failed = [ev('browser_check', undefined, { name: 'Canvas', passed: false, actual: '' })];
  for (const revised of [0, 1]) {
    const event = ev('test_plan_ready', undefined, { review: true, revised, dropped: 1 });
    const view = reducePipeline([...failed, event]);
    expect(view.feedback).toBeNull();
    expect(view.stages.find((stage) => stage.id === 'tester')?.label).toBe(revised ? '1 check revised, 1 dropped as uncheckable' : '1 dropped as uncheckable');
    expect(describeEvent(event)).toBe(`Tester corrected ${revised} and dropped 1 uncheckable check`);
  }
  expect(reducePipeline([...failed, ev('test_plan_ready', undefined, { review: true, revised: 0, dropped: 0 })]).feedback?.from).toBe('tester');
});
