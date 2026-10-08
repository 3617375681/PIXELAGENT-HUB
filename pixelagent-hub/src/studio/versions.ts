import type { StudioRecord } from './softwareStudio.js';

export function parentVersion(record: StudioRecord): string | undefined {
  return record.repair?.parentProjectId || record.revision?.parentProjectId;
}

export function versionFamily(records: StudioRecord[], projectId: string): { rootProjectId: string; versions: StudioRecord[] } {
  const byId = new Map(records.map((record) => [record.projectId, record]));
  const rootOf = (id: string): string => {
    const seen = new Set<string>();
    while (true) {
      if (seen.has(id)) throw new Error('Version history contains a cycle');
      seen.add(id);
      const record = byId.get(id);
      if (!record) throw new Error('Version history references a missing project');
      const parent = parentVersion(record);
      if (!parent) return id;
      id = parent;
    }
  };
  const rootProjectId = rootOf(projectId);
  return { rootProjectId, versions: records.filter((record) => rootOf(record.projectId) === rootProjectId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
}
