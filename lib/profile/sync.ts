import type { Row, Workspace } from "./model";

export interface WorkspaceUpdate {
  cursor: number;
  full: boolean;
  data: Workspace;
}

function mergeRows<T extends Row>(current: T[], changed: T[]): T[] {
  if (!changed.length) return current;
  const pending = new Map(changed.map((row) => [row.id, row]));
  const merged = current.map((row) => {
    const next = pending.get(row.id);
    pending.delete(row.id);
    return next && next.version > row.version ? next : row;
  });
  return merged.concat([...pending.values()]);
}

export function mergeWorkspace(current: Workspace, update: WorkspaceUpdate): Workspace {
  if (update.full) return update.data;
  const delta = update.data;
  return {
    students: mergeRows(current.students, delta.students),
    services: mergeRows(current.services, delta.services),
    applications: mergeRows(current.applications, delta.applications),
    entries: mergeRows(current.entries, delta.entries),
    catalogs: mergeRows(current.catalogs, delta.catalogs),
  };
}
