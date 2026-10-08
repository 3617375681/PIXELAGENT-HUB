import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const reviewInput = z.object({
  previewFile: z.string().regex(/^v[1-3]\/dist\/index.html$/),
  diagnosticId: z.string().uuid(),
  decision: z.enum(['approved', 'changes_requested']),
  operator: z.string().trim().min(1).max(80),
  note: z.string().trim().min(1).max(2000),
  manuallyReviewed: z.literal(true),
}).strict();

export type StudioReview = z.infer<typeof reviewInput> & {
  id: string; savedAt: string; source: 'manual-review';
};

export async function saveReview(root: string, projectId: string, input: z.infer<typeof reviewInput>): Promise<StudioReview> {
  const directory = join(root, projectId, 'reviews');
  await mkdir(directory, { recursive: true });
  const review: StudioReview = { ...input, id: randomUUID(), savedAt: new Date().toISOString(), source: 'manual-review' };
  const temporary = join(directory, `${review.id}.tmp`);
  await writeFile(temporary, JSON.stringify(review, null, 2), { flag: 'wx' });
  await rename(temporary, join(directory, `${review.id}.json`));
  return review;
}

export async function listReviews(root: string, projectId: string): Promise<StudioReview[]> {
  const directory = join(root, projectId, 'reviews');
  let entries: string[];
  try { entries = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const reviews = await Promise.all(entries.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8')) as StudioReview));
  return reviews.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
}
