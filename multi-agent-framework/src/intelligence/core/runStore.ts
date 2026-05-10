import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ApprovalRecord, PipelineRunRecord } from './intelTypes.js';

type StoreState = {
  runs: PipelineRunRecord[];
  approvals: ApprovalRecord[];
  idempotency: Record<string, string>;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export class IntelligenceRunStore {
  private state: StoreState = { runs: [], approvals: [], idempotency: {}, updatedAt: nowIso() };

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.state = JSON.parse(raw) as StoreState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.warn(`[IntelligenceRunStore] Could not read state file, starting fresh: ${err}`);
      }
      await this.persist();
    }
  }

  listRuns(limit: number = 50): PipelineRunRecord[] {
    return [...this.state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  getRun(runId: string): PipelineRunRecord | undefined {
    return this.state.runs.find((x) => x.runId === runId);
  }

  upsertRun(run: PipelineRunRecord): void {
    const idx = this.state.runs.findIndex((x) => x.runId === run.runId);
    if (idx >= 0) this.state.runs[idx] = run;
    else this.state.runs.push(run);
    this.state.updatedAt = nowIso();
  }

  listApprovals(status?: ApprovalRecord['status']): ApprovalRecord[] {
    return this.state.approvals
      .filter((x) => (status ? x.status === status : true))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  getApproval(approvalId: string): ApprovalRecord | undefined {
    return this.state.approvals.find((x) => x.approvalId === approvalId);
  }

  upsertApproval(approval: ApprovalRecord): void {
    const idx = this.state.approvals.findIndex((x) => x.approvalId === approval.approvalId);
    if (idx >= 0) this.state.approvals[idx] = approval;
    else this.state.approvals.push(approval);
    this.state.updatedAt = nowIso();
  }

  isActionProcessed(fingerprint: string): boolean {
    return Boolean(this.state.idempotency[fingerprint]);
  }

  markActionProcessed(fingerprint: string, runId: string): void {
    this.state.idempotency[fingerprint] = runId;
    this.state.updatedAt = nowIso();
  }

  metrics(): Record<string, number> {
    const runs = this.state.runs;
    const completed = runs.filter((x) => x.status === 'completed').length;
    const failed = runs.filter((x) => x.status === 'failed').length;
    const waitingApproval = runs.filter((x) => x.status === 'waiting_approval').length;
    const total = runs.length;
    return {
      totalRuns: total,
      completedRuns: completed,
      failedRuns: failed,
      waitingApprovalRuns: waitingApproval,
      successRate: total > 0 ? Number((completed / total).toFixed(4)) : 0,
      pendingApprovals: this.state.approvals.filter((x) => x.status === 'pending').length,
      idempotencyKeys: Object.keys(this.state.idempotency).length,
    };
  }

  async persist(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }
}

