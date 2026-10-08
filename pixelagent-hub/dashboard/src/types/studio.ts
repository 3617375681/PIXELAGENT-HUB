export type StudioStatus = 'queued' | 'running' | 'ready_for_review' | 'failed' | 'cancelled';
import type { BrowserCheck, BrowserCheckResult } from '../lib/studioChecks';
export type StudioDiagnostic = { id: string; savedAt: string; source: 'browser-client'; previewFile: string; loaded: boolean; errors: string[]; testPlanId?: string; checks?: BrowserCheckResult[] };
export type StudioTestPlan = { id: string; projectId: string; previewFile: string; jobId: string; status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'; error?: string; result?: { status: string; output: { checks: BrowserCheck[]; limitations: string[]; llmProvider?: string; llmModel?: string } } };
export type StudioChanges = { projectId: string; parentProjectId: string; fromPreview: string; toPreview: string; unchanged: number; files: { path: string; status: 'added' | 'removed' | 'modified'; before?: string; after?: string }[] };
export type StudioSummary = { projectId: string; description: string; status: StudioStatus; startedAt: string; phase?: string; jobId?: string; repair?: { parentProjectId: string; diagnosticId: string; previewFile: string; errors: string[] }; revision?: { parentProjectId: string; previewFile: string; changeRequest: string } };
export type StudioVersions = { rootProjectId: string; selectedProjectId: string; versions: StudioSummary[] };
export type StudioProject = StudioSummary & {
  finishedAt?: string; error?: string;
  plan?: { status: string; output: { projectName?: string; goal?: string; phases?: { id: string; name: string; tasks: string[] }[]; llmProvider?: string; llmModel?: string }; reasoning?: string };
  rounds: { round: number; code: { status: string; output?: { files?: { path: string; content: string }[]; llmProvider?: string; llmModel?: string }; reasoning?: string }; build?: { status: 'passed' | 'failed'; errors: string[]; checkedFiles: string[]; browserVerified: boolean } }[];
  previewFile?: string; archiveFile?: string;
};
