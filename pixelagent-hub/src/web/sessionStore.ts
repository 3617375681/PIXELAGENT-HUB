import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export type SessionSummary = {
  sessionId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed';
  taskDescription: string;
  wordCount: number;
};

/** Run sessions on disk: `<root>/<sessionId>/session.json` plus `output.md` and `notes.txt`. */
export function createSessionStore(root: string, logError: (event: string, payload: Record<string, unknown>) => void) {
  const ensureRoot = () => mkdir(root, { recursive: true }).then(() => undefined);
  const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf-8'));
  const summarize = (sessionId: string, data: any): SessionSummary => ({
    sessionId,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    status: data.status,
    taskDescription: data.task?.description || data.final?.topic || '',
    wordCount: Number(data.finalDraft?.wordCount || 0),
  });

  return {
    root,
    ensureRoot,
    readJson,
    sessionDir: (sessionId: string) => join(root, sessionId),

    async listSummaries(): Promise<SessionSummary[]> {
      await ensureRoot();
      const ids = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      const rows: SessionSummary[] = [];
      for (const sessionId of ids) {
        try { rows.push(summarize(sessionId, await readJson(join(root, sessionId, 'session.json')))); }
        catch (err) { logError('sessions.read_failed', { sessionId, error: String(err) }); }
      }
      return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    async readSummary(sessionId: string): Promise<SessionSummary | null> {
      try { return summarize(sessionId, await readJson(join(root, sessionId, 'session.json'))); } catch { return null; }
    },

    /** Atomic replace of session.json; output.md and notes.txt are derived views. */
    async write(record: any): Promise<void> {
      await ensureRoot();
      const sessionDir = join(root, record.sessionId);
      await mkdir(sessionDir, { recursive: true });
      const pendingPath = join(sessionDir, `.session-${randomUUID()}.tmp`);
      await writeFile(pendingPath, JSON.stringify(record, null, 2), 'utf-8');
      await rename(pendingPath, join(sessionDir, 'session.json'));
      if (record.finalDraft?.content) await writeFile(join(sessionDir, 'output.md'), String(record.finalDraft.content), 'utf-8');
      else if (record.final?.summary) await writeFile(join(sessionDir, 'output.md'), String(record.final.summary), 'utf-8');
      if (Array.isArray(record.notes)) await writeFile(join(sessionDir, 'notes.txt'), record.notes.join('\n'), 'utf-8');
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
