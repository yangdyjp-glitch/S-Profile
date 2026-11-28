import {
  choices,
  currentClosure,
  type Phase,
  type Service,
  type Student,
  type Workspace,
} from "./model";
import { compareStudentNames, type StudentSort } from "./student-list";
export { compareStudentNames };
export const serviceSortLabels = {
  updated: "更新时间", name: "姓名", target: "目标时间", status: "学生状况",
  project: "合同项目", teacher: "教务", manager: "学管", progress: "申请进度",
} as const;
export type ServiceSortField = keyof typeof serviceSortLabels;
type Direction = StudentSort["direction"];
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
  sort: ServiceSortField;
  sortDirection?: Direction;
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
export function showsWorkbenchProgress(phase: Phase) {
  return phase === "progress" || phase === "paused";
}
export function activeWorkbenchFilters(filters: Filters) {
  const showProgress = showsWorkbenchProgress(filters.phase);
  const sort = Object.hasOwn(serviceSortLabels, filters.sort) && (showProgress || filters.sort !== "progress")
    ? filters.sort : "updated";
  const explicit = sort === filters.sort ? filters.sortDirection : undefined;
  const sortDirection: Direction = explicit === "ascending" || explicit === "descending"
    ? explicit : sort === "updated" ? "descending" : "ascending";
  return { ...filters, sort, sortDirection, progress: showProgress ? filters.progress : "", risk: showProgress ? filters.risk : "" };
}

const statuses = [...choices.status, "暂停中"];
function choiceRank(value: string, order: readonly string[]) {
  const index = order.indexOf(value);
  return index < 0 ? value : index;
}
function sortValue(field: ServiceSortField, s: Service, student: Student, names: Map<string, string>): string | number {
  switch (field) {
    case "name": return student.name;
    case "status": return choiceRank(s.status, statuses);
    case "progress": return choiceRank(s.progress, choices.progress);
    case "target": return [...s.targets].sort().join(" / ");
    case "project": return s.projects.map((id) => names.get(id)).filter(Boolean).join("、");
    case "teacher": return names.get(s.teacher) || "";
    case "manager": return names.get(student.manager) || "";
    case "updated": {
      const time = Date.parse(s.updatedAt);
      return Number.isFinite(time) ? time : "";
    }
  }
}
function compareValues(a: string | number, b: string | number, sign: number) {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return sign * (a - b);
  // Keep unrecognized historical choices after the configured workflow steps.
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return sign * compareStudentNames(a, b);
}
export function serviceRows(w: Workspace, filters: Filters): Service[] {
  const f = activeWorkbenchFilters(filters);
  const students = new Map(w.students.map((s) => [s.id, s])),
    term = f.q.toLowerCase().trim();
  const usesCatalog = f.sort === "teacher" || f.sort === "manager" || f.sort === "project";
  const names = new Map(usesCatalog ? w.catalogs.map((c) => [c.id, c.name]) : []);
  const sign = f.sortDirection === "ascending" ? 1 : -1;
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
    .map((service) => {
      const student = students.get(service.studentId)!;
      return { service, name: student.name, value: sortValue(f.sort, service, student, names) };
    })
    .sort((a, b) => compareValues(a.value, b.value, sign) || compareStudentNames(a.name, b.name) || a.service.id.localeCompare(b.service.id))
    .map(({ service }) => service);
}
