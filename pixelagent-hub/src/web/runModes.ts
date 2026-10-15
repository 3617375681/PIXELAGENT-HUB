import { createOrchestrator } from '../factory.js';
import { MockProvider } from '../core/llm/mock.js';
import { KnowledgeStore } from '../core/KnowledgeStore.js';
import { RoundtableRunner } from '../core/RoundtableRunner.js';
import type { ModeRunResponse, RunProgressEvent, RunTrace, Task, TaskRunControl } from '../core/types.js';
import type { Retriever } from '../core/retriever.js';
import { safeStringifyObject } from './http/respond.js';
import type { SessionStore } from './sessionStore.js';

type RunControl = { signal: AbortSignal; emit?: (event: RunProgressEvent) => void };
type UsagePoint = { prompt_tokens: number; completion_tokens: number; total_tokens: number; model?: string };

export function buildTask(input: any): Task {
  return {
    id: input?.id || `task-${Date.now()}`,
    type: input?.type || 'content',
    description: input?.description || '请生成一份结构化分析内容',
    context: input?.context || {},
  };
}

const createBaseTrace = (mode: string): RunTrace => ({ mode, startedAt: new Date().toISOString(), actions: [] });
const finishTrace = (trace: RunTrace, rounds?: number, converged?: boolean): RunTrace => ({ ...trace, rounds, converged, finishedAt: new Date().toISOString() });

function buildRunResponse(mode: string, task: Task, final: unknown, trace: RunTrace, status: 'success' | 'failed', raw?: unknown, artifacts?: unknown): ModeRunResponse {
  const { _exec: _drop, ...safeTask } = task;
  const toSerializable = (value: any) => (value === undefined || value === null || typeof value !== 'object' ? value : JSON.parse(safeStringifyObject(value)));
  return { mode, task: toSerializable(safeTask), status, final: toSerializable(final), trace: toSerializable(trace), raw: toSerializable(raw), artifacts: toSerializable(artifacts) };
}

function collectUsagePoints(input: unknown, points: UsagePoint[] = [], seen = new WeakSet<object>()): UsagePoint[] {
  if (!input || typeof input !== 'object') return points;
  const node = input as Record<string, unknown>;
  if (seen.has(node)) return points;
  seen.add(node);
  const llmUsage = node.llmUsage as Record<string, unknown> | undefined;
  if (llmUsage) {
    points.push({
      prompt_tokens: Number(llmUsage.prompt_tokens || 0),
      completion_tokens: Number(llmUsage.completion_tokens || 0),
      total_tokens: Number(llmUsage.total_tokens || 0),
      model: typeof node.llmModel === 'string' ? node.llmModel : undefined,
    });
  }
  Object.values(node).forEach((child) => collectUsagePoints(child, points, seen));
  return points;
}

/** Runs the six collaboration modes and records company/roundtable sessions. */
export function createModeRunner(deps: { retriever: Retriever; store: SessionStore; usdPer1kTokens: number }) {
  const { retriever, store } = deps;

  function buildObservability(raw: unknown) {
    const points = collectUsagePoints(raw);
    const byModel: Record<string, number> = {};
    const summary = points.reduce((acc, p) => {
      acc.totalPromptTokens += p.prompt_tokens;
      acc.totalCompletionTokens += p.completion_tokens;
      acc.totalTokens += p.total_tokens;
      if (p.model) byModel[p.model] = (byModel[p.model] || 0) + 1;
      return acc;
    }, { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0 });
    return { llmCalls: points.length, ...summary, estimatedCostUsd: Number(((summary.totalTokens / 1000) * deps.usdPer1kTokens).toFixed(6)), byModel };
  }

  async function runCompanyMode(input: any, control?: TaskRunControl, allocatedSessionId?: string): Promise<ModeRunResponse> {
    const orchestrator = createOrchestrator('OnePersonCompanyAPI', input?.demo === true ? new MockProvider() : undefined);
    const memory = new KnowledgeStore(input?.description || 'company-mode-task');
    const task = buildTask({ ...input, type: input?.type || 'content_delivery' });
    const trace = createBaseTrace('company');
    const sessionId = allocatedSessionId || `${new Date().toISOString().replace(/[:.]/g, '-')}_${task.id}`;
    const record: any = { sessionId, mode: 'company', startedAt: new Date().toISOString(), status: 'running', task, drafts: [], reviews: [], notes: [] };
    await store.write(record);

    try {
      if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
      control?.emit?.({ type: 'company_step', step: 'plan', agentId: 'manager' });
      const plan = await orchestrator.runTask(task, 'manager', control);
      record.plan = plan;
      if (plan.status !== 'success') throw new Error(plan.reasoning || 'Planning failed');
      trace.actions.push({ agentId: 'manager', action: 'plan', reasoning: plan.reasoning });
      if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
      control?.emit?.({ type: 'company_step', step: 'research', agentId: 'researcher' });
      const research = await orchestrator.runTask({ ...task, id: `research-${task.id}` }, 'researcher', control);
      record.research = research;
      if (research.status !== 'success') throw new Error(research.reasoning || 'Research failed');
      trace.actions.push({ agentId: 'researcher', action: 'research', reasoning: research.reasoning });
      record.notes.push('manager_planning_done', 'research_done');
      const researchEvidence = research.output?.citations || [];
      memory.updateFromTurn({
        turnId: 'company-research', round: 0, speakerId: 'researcher', speakerRole: 'researcher',
        message: String(research.output?.summary || ''), action: 'analysis',
        evidence: { query: task.description, citations: researchEvidence }, timestamp: new Date().toISOString(),
      });

      let round = 1;
      let approved = false;
      let currentDraft: any = null;
      const reviewHistory: any[] = [];
      while (!approved && round <= 5) {
        if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
        control?.emit?.({ type: 'company_step', step: `draft_${round}`, agentId: 'writer' });
        const draft = await orchestrator.runTask({
          ...task,
          id: `draft-${round}-${task.id}`,
          context: {
            ...(task.context || {}),
            researchData: research.output,
            groundedEvidence: researchEvidence,
            memorySummary: memory.getSummaryPrompt(),
            revisionNotes: round > 1 ? (reviewHistory[reviewHistory.length - 1]?.output?.requiredChanges || []) : [],
          },
        }, 'writer', control);
        record.drafts.push(draft);
        if (draft.status !== 'success') throw new Error(draft.reasoning || 'Drafting failed');
        currentDraft = draft.output;
        record.finalDraft = currentDraft;
        trace.actions.push({ agentId: 'writer', action: 'draft', reasoning: draft.reasoning, payload: { round } });

        control?.emit?.({ type: 'company_step', step: `review_${round}`, agentId: 'senior_editor' });
        const review = await orchestrator.runTask({ ...task, id: `review-${round}-${task.id}`, context: { ...(task.context || {}), draft: currentDraft, round } }, 'senior_editor', control);
        record.reviews.push(review);
        if (review.status === 'failed') throw new Error(review.reasoning || 'Review failed');
        reviewHistory.push(review);
        trace.actions.push({ agentId: 'senior_editor', action: 'review', reasoning: review.reasoning, payload: { round, status: review.status } });
        memory.updateFromTurn({
          turnId: `company-review-${round}`, round, speakerId: 'senior_editor', speakerRole: 'senior_editor',
          message: String(review.reasoning || ''), action: 'review',
          evidence: { query: `${task.description} review ${round}`, citations: researchEvidence }, timestamp: new Date().toISOString(),
        });
        approved = review.output?.verdict === 'approved';
        round += approved ? 0 : 1;
      }

      if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
      if (approved) control?.emit?.({ type: 'company_step', step: 'final', agentId: 'director' });
      const final = approved ? await orchestrator.runTask({ ...task, id: `final-${task.id}`, context: { ...(task.context || {}), draft: currentDraft, reviewHistory } }, 'director', control) : {
        taskId: `final-${task.id}`,
        agentId: 'director',
        status: 'failed' as const,
        output: { verdict: 'rejected', mustFixBeforeDelivery: ['Review round limit reached'] },
        reasoning: 'Review round limit reached without approval; final review was not run',
      };

      record.finalReview = final;
      trace.actions.push({ agentId: 'director', action: 'final_review', reasoning: final.reasoning, payload: { status: final.status } });
      record.status = approved && final.status === 'success' && final.output?.verdict === 'approved_for_delivery' ? 'success' : 'failed';
      record.finishedAt = new Date().toISOString();
      record.notes.push(record.status === 'success' ? 'final_approved' : 'final_rejected');
      record.trace = finishTrace(trace, reviewHistory.length, approved);
      record.memory = memory.snapshot();
      record.observability = buildObservability(record);
      await store.write(record);

      return buildRunResponse('company', task, {
        title: record.finalDraft?.title,
        content: record.finalDraft?.content,
        qualityScore: record.finalReview?.output?.qualityScore || null,
        totalRounds: reviewHistory.length,
      }, record.trace, record.status, record, {
        sessionId,
        memorySnapshot: record.memory,
        citations: researchEvidence,
        files: [`${sessionId}/session.json`, `${sessionId}/output.md`],
        observability: record.observability,
      });
    } catch (error) {
      record.status = control?.signal?.aborted && !String(control.signal.reason).includes('_RUN_TIMEOUT_') ? 'cancelled' : 'failed';
      record.finishedAt = new Date().toISOString();
      record.error = error instanceof Error ? error.message : String(error);
      record.trace = trace;
      await store.write(record);
      throw error;
    }
  }

  async function runRoundtableMode(input: any, control?: TaskRunControl): Promise<ModeRunResponse> {
    const orchestrator = createOrchestrator('RoundtableAPI');
    const task = buildTask(input);
    const participants = Array.isArray(input?.agentIds) && input.agentIds.length > 0 ? input.agentIds : ['researcher', 'writer', 'reviewer'];
    const result = await new RoundtableRunner(orchestrator, retriever, participants, Number(input?.rounds || 4)).run(task.description, control);
    const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${task.id}`;
    const record: any = {
      sessionId, mode: 'roundtable', startedAt: result.trace.startedAt, finishedAt: result.trace.finishedAt, status: 'success',
      task, notes: ['roundtable_completed'], trace: result.trace, memory: result.memory, final: result.final,
    };
    record.observability = buildObservability(record);
    await store.write(record);
    return buildRunResponse('roundtable', task, result.final, result.trace, 'success', record, {
      sessionId,
      memorySnapshot: result.memory,
      citations: result.trace.conversation?.flatMap((x) => x.evidence?.citations || []) || [],
      files: [`${sessionId}/session.json`, `${sessionId}/output.md`],
      observability: record.observability,
    });
  }

  /** One execution of a mode; throws UNSUPPORTED_MODE_<mode> for unknown modes. */
  async function run(mode: string, input: any, task: Task, timeoutMs: number, sessionId: string | undefined, control?: RunControl): Promise<ModeRunResponse> {
    const orchestrator = createOrchestrator('WebRun');
    const agents = (fallback: string[]): string[] => (Array.isArray(input?.agentIds) && input.agentIds.length > 0 ? input.agentIds : fallback);
    const trace = (name: string, actions: RunTrace['actions'], rounds: number, converged: boolean) => finishTrace({ mode: name, startedAt: new Date().toISOString(), actions }, rounds, converged);
    if (mode === 'pipeline') {
      const result = await orchestrator.runPipeline('content-creation', task, timeoutMs, control);
      const citations = await retriever.retrieve(`${task.description} pipeline evidence`, 3);
      return buildRunResponse('pipeline', task, result.finalOutput,
        trace('pipeline', result.results.map((x) => ({ agentId: x.agentId, action: 'pipeline_step', reasoning: x.reasoning })), result.results.length, true),
        'success', result, { citations, observability: buildObservability(result) });
    }
    if (mode === 'parallel') {
      const agentIds = agents(['researcher', 'coder']);
      const result = await orchestrator.runParallel(task, agentIds, control);
      const succeeded = result.every((item) => item.status !== 'failed');
      return buildRunResponse('parallel', task, result,
        trace('parallel', result.map((x) => ({ agentId: x.agentId, action: 'parallel_task', reasoning: x.reasoning })), 1, succeeded),
        succeeded ? 'success' : 'failed', { agentIds, result }, { observability: buildObservability(result) });
    }
    if (mode === 'debate') {
      const agentIds = agents(['researcher', 'writer']);
      const rounds = Number(input?.rounds || 3);
      const result = await orchestrator.runDebate(task.description, agentIds, rounds, control);
      const debateSummary = result.map((r) => ({
        round: r.round,
        results: r.results.map((x) => ({
          agentId: x.agentId,
          status: x.status,
          reasoning: x.reasoning,
          outputSummary: typeof x.output === 'string' ? x.output.slice(0, 200) : (x.output?.summary || x.output?.position || safeStringifyObject(x.output || {}).slice(0, 200)),
        })),
      }));
      return buildRunResponse('debate', task, debateSummary,
        trace('debate', result.flatMap((r) => r.results.map((x) => ({ agentId: x.agentId, action: `debate_round_${r.round}`, reasoning: x.reasoning }))), rounds, true),
        'success', { agentIds, rounds, result: debateSummary }, { observability: buildObservability(result) });
    }
    if (mode === 'vote') {
      const agentIds = agents(['researcher', 'writer', 'reviewer']);
      const threshold = Number(input?.threshold || 0.6);
      const tieBreakBy = input?.tieBreakBy === 'agent_order' ? 'agent_order' : 'highest_score';
      const weights = input?.weights && typeof input.weights === 'object' ? input.weights : undefined;
      const result = await orchestrator.runVote(task.description, agentIds, { threshold, tieBreakBy, weights, control });
      return buildRunResponse('vote', task, result,
        trace('vote', result.candidates.map((x) => ({ agentId: x.agentId, action: 'vote_candidate', reasoning: x.rationale, payload: { score: x.score } })), 1, true),
        'success', { agentIds, threshold, tieBreakBy, result }, { observability: buildObservability(result) });
    }
    if (mode === 'roundtable') return runRoundtableMode(input, control);
    if (mode === 'company') return runCompanyMode(input, control, sessionId);
    throw new Error(`UNSUPPORTED_MODE_${mode}`);
  }

  return { run };
}

export type ModeRunner = ReturnType<typeof createModeRunner>;
