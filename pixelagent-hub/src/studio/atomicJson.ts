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
    await rename(temporary, file);
  });
  pendingWrites.set(file, pending);
  try { await pending; }
  finally { if (pendingWrites.get(file) === pending) pendingWrites.delete(file); }
}
