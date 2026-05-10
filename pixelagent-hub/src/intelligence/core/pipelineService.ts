import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { WorkflowConfigService } from './workflowConfig.js';
import { IntelligenceRunStore } from './runStore.js';
import { ActionProviderRegistry } from './actionAdapter.js';
import { MockActionProvider } from './mockAdapter.js';
import { HybridLocalActionProvider, createLocalToolProviderFromEnv } from './localToolProvider.js';
import { createIntelligenceOrchestrator } from './intelligenceOrchestrator.js';
import { ApprovalRecord, PipelineRunRecord, RunStatus, WorkflowDefinition } from './intelTypes.js';
import { Task } from '../../core/types.js';
import type { Retriever } from '../../core/retriever.js';
import {
  bumpWeightsFromMetric,
  defaultScorerWeights,
  loadScorerWeights,
  saveScorerWeights,
  type ScorerWeights,
} from '../../core/retrievalScorer.js';

function nowIso(): string {
  return new Date().toISOString();
}

function mkId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type IntelligencePipelineOptions = {
  /** Default from `INTELLIGENCE_PROVIDER` env when unset. */
  actionProvider?: 'mock' | 'local';
  recordsRoot?: string;
  retriever?: Retriever;
  evalDatasetPath?: string;
  scorerWeightsPath?: string;
  env?: NodeJS.ProcessEnv;
};

type EvalItem = { query: string; mustContain: string[] };

export class IntelligencePipelineService {
  private providers = new ActionProviderRegistry();
  private cronTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly configService: WorkflowConfigService,
    private readonly store: IntelligenceRunStore,
    private readonly pipelineOptions: IntelligencePipelineOptions = {}
  ) {
    const env = pipelineOptions.env ?? process.env;
    const provider =
      pipelineOptions.actionProvider ||
      (String(env.INTELLIGENCE_PROVIDER || '').toLowerCase() === 'local' ? 'local' : 'mock');
    const mock = new MockActionProvider();
    if (provider === 'local') {
      const root =
        (env.INTELLIGENCE_LOCAL_ROOT && String(env.INTELLIGENCE_LOCAL_ROOT).trim()) ||
        join(pipelineOptions.recordsRoot || process.cwd(), 'nanoclaw-workspace');
      const local = createLocalToolProviderFromEnv(root, env);
      this.providers.register(new HybridLocalActionProvider(local, mock), true);
    } else {
      this.providers.register(mock, true);
    }
  }

  async init(): Promise<void> {
    await this.store.init();
    const cfg = await this.configService.load();
    this.startCron(cfg.workflows);
  }

  async listWorkflows(): Promise<WorkflowDefinition[]> {
    return (await this.configService.load()).workflows;
  }

  async validateWorkflowConfig(raw: unknown): Promise<{ ok: boolean; error?: string }> {
    return this.configService.validate(raw);
  }

  async triggerWorkflow(workflowId: string, triggeredBy: PipelineRunRecord['triggeredBy'] = 'manual'): Promise<PipelineRunRecord> {
    const workflows = (await this.configService.load()).workflows;
    const workflow = workflows.find((x) => x.id === workflowId && x.enabled);
    if (!workflow) throw new Error(`WORKFLOW_NOT_FOUND_${workflowId}`);

    const runId = mkId('intel-run');
    const traceId = mkId('trace');
    const run: PipelineRunRecord = {
      runId,
      workflowId,
      traceId,
      status: 'running',
      triggeredBy,
      startedAt: nowIso(),
    };
    this.store.upsertRun(run);
    await this.store.persist();

    try {
      const orchestrator = createIntelligenceOrchestrator(this.store, this.providers);
      const task: Task = {
        id: `intel-task-${runId}`,
        type: 'intelligence',
        description: workflow.name,
        context: { workflow, runId, traceId },
      };
      const pipeline = await orchestrator.runPipeline('intelligence-flow', task, 60_000);
      const [collector, analyst, decision, execution, monitor] = pipeline.results;
      run.collectorOutput = collector?.output?.collected || [];
      run.insight = analyst?.output;
      run.decision = decision?.output;
      run.execution = execution?.output || [];
      run.monitor = monitor?.output;
      if (run.decision?.requiresApproval) {
        run.status = 'waiting_approval';
        const approval: ApprovalRecord = {
          approvalId: mkId('approval'),
          runId,
          workflowId,
          status: 'pending',
          requestedAt: nowIso(),
        };
        this.store.upsertApproval(approval);
      } else {
        run.status = 'completed';
        run.finishedAt = nowIso();
      }
    } catch (err) {
      run.status = 'failed';
      run.error = String(err);
      run.finishedAt = nowIso();
    }

    this.store.upsertRun(run);
    await this.store.persist();
    return run;
  }

  async listRuns(limit: number = 50): Promise<PipelineRunRecord[]> {
    return this.store.listRuns(limit);
  }

  async getRun(runId: string): Promise<PipelineRunRecord | undefined> {
    return this.store.getRun(runId);
  }

  async listApprovals(status?: ApprovalRecord['status']): Promise<ApprovalRecord[]> {
    return this.store.listApprovals(status);
  }

  async resolveApproval(approvalId: string, operator: string, decision: 'approved' | 'rejected', reason?: string): Promise<ApprovalRecord> {
    const approval = this.store.getApproval(approvalId);
    if (!approval) throw new Error(`APPROVAL_NOT_FOUND_${approvalId}`);
    if (approval.status !== 'pending') return approval;
    approval.status = decision;
    approval.operator = operator;
    approval.reason = reason;
    approval.resolvedAt = nowIso();
    this.store.upsertApproval(approval);
    const run = this.store.getRun(approval.runId);
    if (run) {
      if (decision === 'rejected') {
        run.status = 'failed';
        run.error = reason || 'Rejected by approver';
        run.finishedAt = nowIso();
        this.store.upsertRun(run);
      } else {
        run.status = 'completed';
        run.finishedAt = nowIso();
        this.store.upsertRun(run);
      }
    }
    await this.store.persist();
    return approval;
  }

  metrics(): Record<string, number> {
    return this.store.metrics();
  }

  /**
   * Runs N eval rounds against `retriever` + optional linear scorer weights (embedding path).
   * Writes `records/.../intelligence/self-improve/round-{n}.json` each round.
   */
  async runSelfImprove(payload?: { rounds?: number }): Promise<{
    rounds: Array<{ round: number; metric: number; path: string; weights?: unknown }>;
  }> {
    const retriever = this.pipelineOptions.retriever;
    const recordsRoot = this.pipelineOptions.recordsRoot;
    if (!retriever || !recordsRoot) {
      throw new Error('SELF_IMPROVE_NOT_CONFIGURED');
    }
    const rounds = Math.min(20, Math.max(1, Number(payload?.rounds ?? 5) || 5));
    const evalPath =
      this.pipelineOptions.evalDatasetPath || join(process.cwd(), 'config', 'eval', 'knowledge-qa.json');
    const raw = await readFile(evalPath, 'utf-8');
    const dataset = JSON.parse(raw) as { items?: EvalItem[] };
    const items = Array.isArray(dataset.items) ? dataset.items : [];
    if (items.length === 0) throw new Error('SELF_IMPROVE_EMPTY_DATASET');

    const outDir = join(recordsRoot, 'intelligence', 'self-improve');
    await mkdir(outDir, { recursive: true });

    const weightsPath = this.pipelineOptions.scorerWeightsPath;
    let weights = weightsPath ? await loadScorerWeights(weightsPath) : defaultScorerWeights();

    const results: Array<{ round: number; metric: number; path: string; weights?: unknown }> = [];
    for (let r = 1; r <= rounds; r++) {
      let hits = 0;
      for (const item of items) {
        const cites = await retriever.retrieve(item.query, 5);
        const blob = cites.map((c) => `${c.snippet} ${c.sourceTitle || ''}`).join(' ').toLowerCase();
        const ok = item.mustContain.every((kw) => blob.includes(String(kw).toLowerCase()));
        if (ok) hits++;
      }
      const metric = hits / items.length;
      if (weightsPath) {
        weights = bumpWeightsFromMetric(weights, metric);
        await saveScorerWeights(weightsPath, weights);
      }
      const path = join(outDir, `round-${r}.json`);
      await writeFile(
        path,
        JSON.stringify(
          {
            round: r,
            metric,
            hits,
            total: items.length,
            weightsPath: weightsPath || null,
            weights: weightsPath ? weights : undefined,
            at: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf-8'
      );
      results.push({ round: r, metric, path, weights: weightsPath ? weights : undefined });
    }
    return { rounds: results };
  }

  /** Current linear rerank weights (defaults if no file). */
  async getRetrievalScorerWeights(): Promise<{ weights: ScorerWeights; path: string | null }> {
    const path = this.pipelineOptions.scorerWeightsPath ?? null;
    if (!path) return { weights: defaultScorerWeights(), path: null };
    return { weights: await loadScorerWeights(path), path };
  }

  /** Parsed `round-*.json` from the last self-improve runs (on-disk). */
  async listSelfImproveHistory(limit: number = 50): Promise<
    Array<{ round: number; metric: number; hits?: number; total?: number; at?: string }>
  > {
    const recordsRoot = this.pipelineOptions.recordsRoot;
    if (!recordsRoot) return [];
    const dir = join(recordsRoot, 'intelligence', 'self-improve');
    try {
      const names = await readdir(dir);
      const files = names.filter((n) => /^round-\d+\.json$/i.test(n));
      const parsed: Array<{ round: number; metric: number; hits?: number; total?: number; at?: string }> = [];
      for (const name of files) {
        try {
          const raw = await readFile(join(dir, name), 'utf-8');
          const j = JSON.parse(raw) as Record<string, unknown>;
          parsed.push({
            round: Number(j.round) || 0,
            metric: Number(j.metric) || 0,
            hits: typeof j.hits === 'number' ? j.hits : undefined,
            total: typeof j.total === 'number' ? j.total : undefined,
            at: typeof j.at === 'string' ? j.at : undefined,
          });
        } catch {
          /* skip corrupt */
        }
      }
      parsed.sort((a, b) => a.round - b.round);
      return parsed.slice(-Math.max(1, limit));
    } catch {
      return [];
    }
  }

  async reloadWorkflows(raw?: unknown): Promise<void> {
    if (raw) {
      const validated = await this.configService.validate(raw);
      if (!validated.ok) throw new Error(validated.error);
      await this.configService.save(raw as any);
    }
    this.stopCron();
    const cfg = await this.configService.load();
    this.startCron(cfg.workflows);
  }

  private startCron(workflows: WorkflowDefinition[]): void {
    // Lightweight cron emulation for MVP: supports "0 9 * * *" as daily HH:mm local time.
    for (const wf of workflows) {
      if (!wf.enabled || wf.trigger.type !== 'cron' || !wf.trigger.cron) continue;
      const m = wf.trigger.cron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
      if (!m) continue;
      const minute = Number(m[1]);
      const hour = Number(m[2]);
      const timer = setInterval(() => {
        const now = new Date();
        if (now.getHours() === hour && now.getMinutes() === minute) {
          void this.triggerWorkflow(wf.id, 'cron');
        }
      }, 30_000);
      (timer as NodeJS.Timeout).unref?.();
      this.cronTimers.push(timer);
    }
  }

  private stopCron(): void {
    this.cronTimers.forEach((x) => clearInterval(x));
    this.cronTimers = [];
  }
}

