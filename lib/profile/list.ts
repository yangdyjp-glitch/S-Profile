import {
  currentClosure,
  type Phase,
  type Service,
  type Workspace,
} from "./model";
export interface Filters {
  phase: Phase;
  q: string;
  teacher: string;
  manager: string;
  channel: string;
  project: string;
  status: string;
  risk: string;
  progress: string;
  intake: string;
  location: string;
  closure: string;
  sort: string;
}
export const defaultFilters: Filters = {
  phase: "progress",
  q: "",
  teacher: "",
  manager: "",
  channel: "",
  project: "",
  status: "",
  risk: "",
  progress: "",
  intake: "",
  location: "",
  closure: "",
  sort: "updated",
};
export const compareStudentNames = new Intl.Collator("zh-CN").compare;
export function serviceRows(w: Workspace, f: Filters): Service[] {
  const students = new Map(w.students.map((s) => [s.id, s])),
    term = f.q.toLowerCase().trim();
  const matching = new Set<string>();
  if (term) {
    for (const entry of w.entries) {
      if (!entry.voided && entry.body.toLowerCase().includes(term)) matching.add(entry.studentId);
    }
  }
  return w.services
    .filter((s) => {
      const st = students.get(s.studentId);
      if (!st || s.phase !== f.phase) return false;
      if (
        term &&
        !st.name.toLowerCase().includes(term) &&
        !matching.has(st.id)
      )
        return false;
      return (
        (!f.teacher || (s.teacher || "none") === f.teacher) &&
        (!f.manager || (st.manager || "none") === f.manager) &&
        (!f.channel || s.channel === f.channel) &&
        (!f.project || s.projects.includes(f.project)) &&
        (!f.status || s.status === f.status) &&
        (!f.risk || s.risk === f.risk) &&
        (!f.progress || s.progress === f.progress) &&
        (!f.intake || s.targets.includes(f.intake)) &&
        (!f.location || st.location === f.location) &&
        (!f.closure || currentClosure(s)?.kind === f.closure)
      );
    })
    .sort((a, b) =>
      f.sort === "name"
        ? compareStudentNames(students.get(a.studentId)!.name, students.get(b.studentId)!.name)
        : f.sort === "target"
          ? (a.targets[0] || "9999").localeCompare(b.targets[0] || "9999")
          : b.updatedAt.localeCompare(a.updatedAt),
    );
}
