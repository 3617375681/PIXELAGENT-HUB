import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export class StudioRequestConflict extends Error {}
const pending = new Map<string, Promise<unknown>>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// Reserve before starting paid work. An incomplete reservation fails closed after a crash.
export async function createStudioRequest<T>(root: string, key: string, description: string, start: (projectId: string) => Promise<T>): Promise<T | { projectId: string; jobId: string; projectUrl: string }> {
  const directory = join(resolve(root), '.requests', hash(key));
  const previous = pending.get(directory);
  const work = (async () => {
    if (previous) await previous.catch(() => undefined);
    await mkdir(join(resolve(root), '.requests'), { recursive: true });
    try { await mkdir(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let saved: { projectId: string; descriptionHash: string };
      try {
        saved = JSON.parse(await readFile(join(directory, 'request.json'), 'utf8'));
        if (saved.descriptionHash !== hash(description)) throw new StudioRequestConflict('Idempotency-Key was already used with a different description');
        await access(join(root, saved.projectId, 'project.json'));
      } catch (error) {
        if (error instanceof StudioRequestConflict) throw error;
        throw new StudioRequestConflict('Creation reservation is incomplete; inspect project records before starting a new request');
      }
      return { projectId: saved.projectId, jobId: `studio-${saved.projectId}`, projectUrl: `/api/studio/projects/${saved.projectId}` };
    }
    const projectId = randomUUID();
    await writeFile(join(directory, 'request.json'), JSON.stringify({ projectId, descriptionHash: hash(description) }), { flag: 'wx' });
    return start(projectId);
  })();
  pending.set(directory, work);
  try { return await work; }
  finally { if (pending.get(directory) === work) pending.delete(directory); }
}
