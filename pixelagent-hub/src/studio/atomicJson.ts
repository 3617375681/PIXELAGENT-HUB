import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const pendingWrites = new Map<string, Promise<void>>();

// Snapshot before awaiting: caller mutations must not change a queued progress record.
export async function writeJsonSnapshot(file: string, value: unknown): Promise<void> {
  const snapshot = JSON.stringify(value, null, 2);
  const pending = (pendingWrites.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, snapshot);
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); break; }
      catch (error) {
        // Windows readers can briefly hold the destination open during replacement.
        if (process.platform !== 'win32' || attempt >= 5
          || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  });
  pendingWrites.set(file, pending);
  try { await pending; }
  finally { if (pendingWrites.get(file) === pending) pendingWrites.delete(file); }
}
