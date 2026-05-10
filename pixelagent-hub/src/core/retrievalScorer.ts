import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ScorerWeights = {
  version: 1;
  bias: number;
  cos: number;
  logChunkLen: number;
};

export function defaultScorerWeights(): ScorerWeights {
  return { version: 1, bias: 0, cos: 1, logChunkLen: 0.02 };
}

export function scoreChunk(w: ScorerWeights, cosine: number, chunkTextLen: number): number {
  return w.bias + w.cos * cosine + w.logChunkLen * Math.log(1 + Math.max(0, chunkTextLen));
}

export async function loadScorerWeights(path: string): Promise<ScorerWeights> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ScorerWeights>;
    return { ...defaultScorerWeights(), ...parsed, version: 1 };
  } catch {
    return defaultScorerWeights();
  }
}

export async function saveScorerWeights(path: string, w: ScorerWeights): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(w, null, 2), 'utf-8');
}

/** Lightweight gradient-free nudge from eval metric in [0,1]. */
export function bumpWeightsFromMetric(w: ScorerWeights, metric: number): ScorerWeights {
  const next: ScorerWeights = { ...w, version: 1 };
  if (metric < 0.5) {
    next.logChunkLen = Math.min(0.15, next.logChunkLen + 0.015);
    next.bias -= 0.012;
  } else if (metric >= 0.85) {
    next.cos = Math.min(1.15, next.cos + 0.008);
  } else {
    next.bias += 0.004 * (metric - 0.65);
  }
  return next;
}
