import { type Revision, type Workspace } from "./model";
import type { Source } from "./excel-model";
import { type Filters, defaultFilters, serviceRows } from "./list";
import {
  type Input,
  revisionSelect,
  unpackWorkspace,
  workspaceQueries,
} from "./store";
import { Problem, stamp } from "./validation";
export interface ExportData extends Workspace {
  at: string;
  scope: "full" | "filtered";
  filters: Filters;
  revisions: Revision[];
  sources: Source[];
  imports: Record<string, unknown>[];
}
export async function exportData(
  db: D1Database,
  bucket: R2Bucket,
  input: Input,
): Promise<ExportData> {
  const full = input.scope === "full",
    filters = { ...defaultFilters, ...(input.filters as Partial<Filters>) };
  const queries = workspaceQueries(db);
  if (full)
    queries.push(
      db.prepare(revisionSelect + " ORDER BY seq"),
      db.prepare("SELECT * FROM imports ORDER BY at"),
      db.prepare("SELECT * FROM sources ORDER BY batch_id,sheet,row"),
    );
  const rows = await db.batch<Record<string, unknown>>(queries),
    w = unpackWorkspace(rows);
  const data: ExportData = {
    ...w,
    at: stamp(),
    scope: full ? "full" : "filtered",
    filters,
    revisions: full ? (rows[5].results as unknown as Revision[]) : [],
    imports: full ? rows[6].results : [],
    sources: [],
  };
  if (!full) {
    data.services = serviceRows(w, filters);
    const sids = new Set(data.services.map((s) => s.studentId)),
      vids = new Set(data.services.map((s) => s.id));
    data.students = w.students.filter((s) => sids.has(s.id));
    data.applications = w.applications.filter((a) => vids.has(a.serviceId));
    data.entries = w.entries.filter((e) => sids.has(e.studentId));
    return data;
  }
  for (const r of rows[7].results) {
    let raw = JSON.parse(r.raw as string);
    if (raw.object) {
      const b = await bucket.get(raw.object);
      if (!b) throw new Problem(500, "一份来源资料暂不可用，请稍后重试导出");
      raw = JSON.parse(await b.text());
    }
    data.sources.push({
      ...r,
      raw,
      issues: JSON.parse(r.issues as string),
      proposal: JSON.parse(r.proposal as string),
    } as Source);
  }
  return data;
}
