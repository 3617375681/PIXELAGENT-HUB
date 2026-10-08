export type StudioStatus = 'queued' | 'running' | 'ready_for_review' | 'failed' | 'cancelled';
export type StudioGenerationMetrics = { elapsedMs: number | null; buildAttempts: number; failedBuilds: number; agentTasks: number; reportedUsageTasks: number; missingUsageTasks: number; reportedTokens: number; models: string[]; costUsd: null };
export type StudioReview = { id: string; savedAt: string; source: 'manual-review'; previewFile: string; diagnosticId: string; decision: 'approved' | 'changes_requested'; operator: string; note: string; manuallyReviewed: true };
import type { BrowserCheck, BrowserCheckResult } from '../lib/studioChecks';
export type StudioBrowserRun = { id: string; projectId: string; testPlanId: string; source: 'server-browser'; status: 'queued' | 'running' | 'passed' | 'failed' | 'cancelled'; startedAt: string; finishedAt?: string; previewHash: string; planHash: string; browserVersion?: string; error?: string; checks: BrowserCheckResult[]; errors: string[]; blockedRequests: string[]; screenshots: ('initial.png' | 'final.png')[] };
export type StudioDiagnostic = { id: string; savedAt: string; source: 'browser-client'; previewFile: string; loaded: boolean; errors: string[]; testPlanId?: string; checks?: BrowserCheckResult[] };
export type StudioTestPlan = { id: string; projectId: string; previewFile: string; jobId: string; status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'; error?: string; result?: { status: string; output: { checks: BrowserCheck[]; limitations: string[]; llmProvider?: string; llmModel?: string } } };
export type StudioChanges = { projectId: string; parentProjectId: string; fromPreview: string; toPreview: string; unchanged: number; files: { path: string; status: 'added' | 'removed' | 'modified'; before?: string; after?: string }[] };
export type StudioSummary = { projectId: string; description: string; status: StudioStatus; startedAt: string; phase?: string; jobId?: string; review?: StudioReview | null; repair?: { parentProjectId: string; diagnosticId: string; previewFile: string; errors: string[] }; revision?: { parentProjectId: string; previewFile: string; changeRequest: string }; retry?: { parentProjectId: string } };
export type StudioVersions = { rootProjectId: string; selectedProjectId: string | null; versions: StudioSummary[] };
export type StudioProject = StudioSummary & {
  generationMetrics?: StudioGenerationMetrics;
  strategy?: 'manager-coder' | 'coder-only';
  finishedAt?: string; error?: string; stoppedPhase?: string;
  plan?: { status: string; output: { projectName?: string; goal?: string; phases?: { id: string; name: string; tasks: string[] }[]; llmProvider?: string; llmModel?: string }; reasoning?: string };
  rounds: { round: number; code: { status: string; output?: { files?: { path: string; content: string }[]; llmProvider?: string; llmModel?: string }; reasoning?: string }; build?: { status: 'passed' | 'failed'; errors: string[]; checkedFiles: string[]; browserVerified: boolean } }[];
  previewFile?: string; archiveFile?: string;
};
