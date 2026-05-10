import { Agent, AgentConfig, OrchestratorConfig, Task, TaskResult, PipelineStep, VoteResult, VoteCandidate, TaskRunControl } from './types.js';
import { MessageBusImpl } from './MessageBus.js';
import { TaskRouter } from './TaskRouter.js';
import { RunQueue } from './RunQueue.js';

export class Orchestrator {
  private bus: MessageBusImpl;
  private router: TaskRouter;
  private agents: Map<string, Agent> = new Map();
  private config: OrchestratorConfig;
  private runQueue: RunQueue | null = null;

  constructor(config: OrchestratorConfig, bus?: MessageBusImpl) {
    this.config = config;
    this.bus = bus || new MessageBusImpl();
    this.router = new TaskRouter(this.bus);
  }

  /** Enable concurrency control for parallel operations. */
  enableQueue(maxConcurrency: number = 5, maxQueueSize: number = 50): this {
    this.runQueue = new RunQueue(maxConcurrency, maxQueueSize);
    return this;
  }

  getQueueSnapshot(): { running: number; queued: number } {
    if (!this.runQueue) return { running: 0, queued: 0 };
    return {
      running: this.runQueue.getRunningCount(),
      queued: this.runQueue.getQueuedCount(),
    };
  }

  getBus(): MessageBusImpl {
    return this.bus;
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.config.id, agent);
  }

  private mergeExec(task: Task, control?: TaskRunControl): Task {
    if (!control?.signal && !control?.emit) return task;
    return { ...task, _exec: { ...task._exec, ...control } };
  }

  // 单任务单 Agent
  async runTask(task: Task, agentId: string, control?: TaskRunControl): Promise<TaskResult> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    const merged = this.mergeExec(task, control);
    const timeoutMs = agent.config.timeout || 60000;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        agent.execute(merged),
        new Promise<TaskResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`AGENT_TIMEOUT_${agentId}_${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'orchestrator.run_task_failed',
        agentId,
        taskId: task.id,
        taskType: task.type,
        timeoutMs,
        error: String(err),
        at: new Date().toISOString(),
      }));
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 流水线模式
  async runPipeline(
    pipelineName: string,
    initialTask: Task,
    stepTimeoutMs: number = 60000,
    control?: TaskRunControl
  ): Promise<{ results: TaskResult[]; finalOutput: any }> {
    const steps = this.config.pipelines[pipelineName];
    if (!steps) throw new Error(`Pipeline not found: ${pipelineName}`);
    const merged = this.mergeExec(initialTask, control);
    return this.router.runPipeline(merged, steps, stepTimeoutMs, control);
  }

  // 并行模式：多 Agent 同时执行同一任务
  async runParallel(task: Task, agentIds: string[], control?: TaskRunControl): Promise<TaskResult[]> {
    const merged = this.mergeExec(task, control);
    const runner = async (id: string) => {
      const r = await this.runTask(merged, id, control);
      control?.emit?.({ type: 'parallel_agent_done', agentId: id, status: r.status });
      return r;
    };
    if (this.runQueue) {
      return Promise.all(agentIds.map((id) => this.runQueue!.push(() => runner(id))));
    }
    return Promise.all(agentIds.map(runner));
  }

  // 辩论模式：多 Agent 互相挑战
  async runDebate(
    topic: string,
    agentIds: string[],
    rounds: number = 3,
    control?: TaskRunControl
  ): Promise<{ round: number; results: TaskResult[] }[]> {
    const history: { round: number; results: TaskResult[] }[] = [];
    let currentContext = { topic, previousRound: [] as TaskResult[] };

    for (let i = 1; i <= rounds; i++) {
      if (control?.signal?.aborted) throw new Error('JOB_CANCELLED');
      control?.emit?.({ type: 'debate_round_start', round: i });
      const runner = (id: string) =>
        this.runTask({
          id: `debate-${i}-${id}`,
          type: 'debate',
          description: topic,
          context: currentContext,
        }, id, control);

      const results = this.runQueue
        ? await Promise.all(agentIds.map((id) => this.runQueue!.push(() => runner(id))))
        : await Promise.all(agentIds.map(runner));
      control?.emit?.({ type: 'debate_round_done', round: i });
      history.push({ round: i, results });
      currentContext.previousRound = results;
    }

    return history;
  }

  async runVote(
    topic: string,
    agentIds: string[],
    options?: {
      weights?: Record<string, number>;
      threshold?: number;
      tieBreakBy?: 'highest_score' | 'agent_order';
      control?: TaskRunControl;
    }
  ): Promise<VoteResult> {
    if (agentIds.length === 0) throw new Error('runVote requires at least one agent');
    const threshold = options?.threshold ?? 0.6;
    const tieBreakBy = options?.tieBreakBy ?? 'highest_score';
    const weights = options?.weights || {};
    const control = options?.control;
    const runner = async (id: string) => {
      const r = await this.runTask(
        {
          id: `vote-${Date.now()}-${id}`,
          type: 'vote',
          description: topic,
          context: { topic },
        },
        id,
        control
      );
      control?.emit?.({ type: 'vote_agent_done', agentId: id, status: r.status });
      return r;
    };
    const results = this.runQueue
      ? await Promise.all(agentIds.map((id) => this.runQueue!.push(() => runner(id))))
      : await Promise.all(agentIds.map(runner));
    const candidates: VoteCandidate[] = results.map((result, index) => {
      const base = this.scoreResult(result);
      const weight = weights[result.agentId] ?? 1;
      return {
        agentId: result.agentId,
        score: Number((base * weight).toFixed(4)),
        rationale: result.reasoning || `Vote generated by ${result.agentId}`,
        output: result.output,
      };
    });
    candidates.sort((a, b) => b.score - a.score);
    const winner = tieBreakBy === 'agent_order' && candidates.length > 1 && candidates[0].score === candidates[1].score
      ? candidates.reduce((acc, cur) => (agentIds.indexOf(cur.agentId) < agentIds.indexOf(acc.agentId) ? cur : acc), candidates[0])
      : candidates[0];
    const scoreBreakdown = Object.fromEntries(candidates.map((x) => [x.agentId, x.score]));
    const maxScore = Math.max(...candidates.map((x) => x.score), 0);
    return {
      topic,
      winner,
      candidates,
      scoreBreakdown,
      confidence: Number(Math.min(1, maxScore).toFixed(4)),
      threshold,
      tieBreakBy,
    };
  }

  private scoreResult(result: TaskResult): number {
    if (typeof result.output?.score === 'number') {
      const normalized = Number(result.output.score);
      if (normalized <= 1) return Math.max(0, normalized);
      return Math.min(1, normalized / 100);
    }
    if (result.status === 'success') return 0.82;
    if (result.status === 'partial') return 0.58;
    return 0.24;
  }

  getAgentList(): AgentConfig[] {
    return Array.from(this.agents.values()).map(a => a.config);
  }
}
