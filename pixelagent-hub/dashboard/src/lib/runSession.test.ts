import { describe, expect, it } from 'vitest';
import { resolveRunSession } from './runSession';
import { sessionJsonToWorkflow } from './sessionToWorkflow';

const session = {
  sessionId: 'session-1', mode: 'company', status: 'success', task: { description: 'Test' },
  plan: { output: { goal: 'Build' } }, research: { output: { summary: 'Evidence' } },
  drafts: [{ output: { title: 'Draft', content: 'Content' } }],
  reviews: [{ output: { verdict: 'approved' }, reasoning: 'Review' }],
  finalReview: { output: { verdict: 'approved_for_delivery' } },
};

describe('full session resolution', () => {
  it('retains mock provenance from output metadata when mapping restored sessions', () => {
    const workflow = sessionJsonToWorkflow({ ...session, drafts: [{ output: { content: 'Synthetic', llmProvider: 'mock' } }] });
    expect(workflow.source).toBe('mock');
    expect(workflow.id).toBe(session.sessionId);
  });

  it('does not classify quoted provider text as mock execution metadata', () => {
    expect(sessionJsonToWorkflow({ ...session, task: { description: 'Discuss "llmProvider":"mock"' } }).source).toBe('records-api');
  });

  it('sync response and async runResult map to the same complete workflow', async () => {
    const result = { status: 'success', artifacts: { sessionId: session.sessionId }, final: { content: 'summary only' } };
    const job = { status: 'succeeded', runResult: result };
    const getSession = async (id: string) => { expect(id).toBe(session.sessionId); return { session }; };
    const sync = sessionJsonToWorkflow(await resolveRunSession(result, getSession));
    const asyncWorkflow = sessionJsonToWorkflow(await resolveRunSession(job.runResult, getSession));
    expect(sync.rounds.map((round) => round.agents.map((agent) => agent.id)))
      .toEqual(asyncWorkflow.rounds.map((round) => round.agents.map((agent) => agent.id)));
    expect(sync.rounds.flatMap((round) => round.agents.map((agent) => agent.id)))
      .toEqual(['manager', 'researcher', 'writer', 'senior_editor', 'director']);
  });

  it('accepts embedded raw sessions without inventing a job ID', async () => {
    expect(await resolveRunSession({ raw: session }, async () => { throw new Error('Unexpected request'); })).toBe(session);
  });

  it('propagates HTTP failures and rejects malformed responses', async () => {
    await expect(resolveRunSession({ artifacts: { sessionId: 's' } }, async () => { throw new Error('HTTP 401'); })).rejects.toThrow('HTTP 401');
    await expect(resolveRunSession({}, async () => ({ session }))).rejects.toThrow('no session');
  });

  it('restores failed stages and rejected reviews without displaying success', () => {
    const workflow = sessionJsonToWorkflow({
      ...session,
      status: 'failed',
      research: { status: 'failed', reasoning: 'Search unavailable', output: null },
      reviews: [{ status: 'partial', output: { verdict: 'rejected' }, reasoning: 'Missing evidence' }],
      finalReview: { status: 'failed', output: { verdict: 'rejected' }, reasoning: 'Round limit reached' },
    });
    const agents = workflow.rounds.flatMap((round) => round.agents);
    expect(agents.find((agent) => agent.id === 'manager')?.status).toBe('done');
    const research = agents.find((agent) => agent.id === 'researcher');
    expect(research?.status).toBe('error');
    expect(research?.statusMessage).toBe('Search unavailable');
    expect(research?.outputs[0].type).toBe('error');
    expect(agents.find((agent) => agent.id === 'senior_editor')?.statusMessage).toContain('revision required');
    expect(agents.find((agent) => agent.id === 'director')?.status).toBe('error');
    expect(workflow.rounds.every((round) => round.status === 'error')).toBe(true);
  });

  it('does not invent a completed researcher when a session stopped before any stage', () => {
    const workflow = sessionJsonToWorkflow({ sessionId: 'stopped', status: 'cancelled', error: 'JOB_CANCELLED' });
    expect(workflow.rounds[0].agents).toEqual([]);
    expect(workflow.rounds[0].status).toBe('error');
    expect(workflow.rounds[0].messages[0]).toMatchObject({ agentId: 'system', type: 'error', content: 'JOB_CANCELLED' });
  });

  it('keeps original source URLs and excerpts visible in research output', () => {
    const workflow = sessionJsonToWorkflow({ ...session, research: { status: 'success', output: {
      summary: 'Evidence summary', keyPoints: ['A fact'],
      sources: [{ title: 'Retrieved document', url: 'https://source.test/document', excerpt: 'Original tool excerpt' }],
    } } });
    const research = workflow.rounds[0].agents.find((agent) => agent.id === 'researcher')!;
    expect(research.outputs[0].content).toContain('https://source.test/document');
    expect(research.outputs[0].content).toContain('Original tool excerpt');
  });
});
