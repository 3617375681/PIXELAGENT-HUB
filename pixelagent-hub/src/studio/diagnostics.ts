import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const diagnosticInput = z.object({
  previewFile: z.string().regex(/^v[1-3]\/dist\/index.html$/),
  loaded: z.boolean(),
  errors: z.array(z.string().min(1).max(2000)).max(20),
}).strict();

export type StudioDiagnostic = z.infer<typeof diagnosticInput> & {
  id: string; savedAt: string; source: 'browser-client';
};

// Separate immutable observations avoid changing generation state or compiler evidence.
export async function saveDiagnostic(root: string, projectId: string, input: z.infer<typeof diagnosticInput>): Promise<StudioDiagnostic> {
  const directory = join(root, projectId, 'diagnostics');
  await mkdir(directory, { recursive: true });
  const report: StudioDiagnostic = { ...input, id: randomUUID(), savedAt: new Date().toISOString(), source: 'browser-client' };
  const temporary = join(directory, `${report.id}.tmp`);
  await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
  await rename(temporary, join(directory, `${report.id}.json`));
  return report;
}

export async function listDiagnostics(root: string, projectId: string): Promise<StudioDiagnostic[]> {
  const directory = join(root, projectId, 'diagnostics');
  let entries: string[];
  try { entries = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const reports = await Promise.all(entries.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf-8')) as StudioDiagnostic));
  return reports.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
