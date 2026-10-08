export type StudioStatus = 'queued' | 'running' | 'ready_for_review' | 'failed' | 'cancelled';
export type StudioDiagnostic = { id: string; savedAt: string; source: 'browser-client'; previewFile: string; loaded: boolean; errors: string[] };
export type StudioSummary = { projectId: string; description: string; status: StudioStatus; startedAt: string; phase?: string; jobId?: string };
export type StudioProject = StudioSummary & {
  finishedAt?: string; error?: string;
  plan?: { status: string; output: { projectName?: string; goal?: string; phases?: { id: string; name: string; tasks: string[] }[]; llmProvider?: string; llmModel?: string }; reasoning?: string };
  rounds: { round: number; code: { status: string; output?: { files?: { path: string; content: string }[]; llmProvider?: string; llmModel?: string }; reasoning?: string }; build?: { status: 'passed' | 'failed'; errors: string[]; checkedFiles: string[]; browserVerified: boolean } }[];
  previewFile?: string; archiveFile?: string;
};
