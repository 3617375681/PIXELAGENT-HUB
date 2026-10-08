import type { SourceFile } from './workspace.js';

export type SourceChange = { path: string; status: 'added' | 'removed' | 'modified'; before?: string; after?: string };

export function compareSources(before: SourceFile[], after: SourceFile[]): { files: SourceChange[]; unchanged: number } {
  const oldFiles = new Map(before.map((file) => [file.path, file.content]));
  const newFiles = new Map(after.map((file) => [file.path, file.content]));
  const files: SourceChange[] = [];
  let unchanged = 0;
  for (const path of [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort()) {
    const previous = oldFiles.get(path);
    const current = newFiles.get(path);
    if (previous === current) { unchanged++; continue; }
    files.push({ path, status: previous === undefined ? 'added' : current === undefined ? 'removed' : 'modified', before: previous, after: current });
  }
  return { files, unchanged };
}
