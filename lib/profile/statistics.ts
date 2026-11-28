import {
  catalogOptionLabel, currentClosure, phases, roles,
  type Catalog, type Phase, type Service, type Student, type Workspace,
} from "./model.ts";
import { compareStudentNames } from "./student-list.ts";

export const statisticsScopes = { active: "当前在服", completed: "已完成", all: "全部" } as const;
export type StatisticsScope = keyof typeof statisticsScopes;
export type StaffRole = keyof typeof roles;
const statusLabels = ["当期申请", "延期", "暂停中", "未开始", "状况待补"] as const;

export type StudentMatches = { student: Student; services: Service[] };
export type Metric = { key: string; title: string; members: Map<string, StudentMatches> };
type AxisItem = { id: string; name: string };
type TargetGroup = { label: string; total: Metric; applying: Metric; submitted: Metric };

export function targetCombination(targets: string[]) {
  return [...new Set(targets.map((month) => month.trim()).filter(Boolean))].sort().join(" / ");
}

function catalogAxis(catalogs: Catalog[], kind: StaffRole | "project", used: Set<string>, missing: string) {
  const items: AxisItem[] = catalogs
    .filter((c) => c.kind === kind && ((c.active && !c.deleted) || used.has(c.id)))
    .map((c) => ({ id: c.id, name: catalogOptionLabel(c) }))
    .sort((a, b) => compareStudentNames(a.name, b.name) || a.id.localeCompare(b.id));
  if (used.has("") || kind !== "project") items.push({ id: "", name: missing });
  return items;
}

function addMember(metric: Metric, student: Student, service: Service) {
  const existing = metric.members.get(student.id);
  if (existing) existing.services.push(service);
  else metric.members.set(student.id, { student, services: [service] });
}

export function studentStatistics(
  data: Pick<Workspace, "students" | "services" | "applications" | "catalogs">,
  scope: StatisticsScope, role: StaffRole,
) {
  const students = new Map(data.students.map((s) => [s.id, s]));
  const catalogs = new Map(data.catalogs.map((c) => [c.id, c]));
  const submittedServices = new Set(data.applications.filter((a) => !a.voided && a.school.trim()).map((a) => a.serviceId));
  const usedStaff = new Set<string>(), usedProjects = new Set<string>();
  const records = data.services.flatMap((service) => {
    const student = students.get(service.studentId);
    const completed = service.phase === "completed";
    if (!student || (scope === "active" && completed) || (scope === "completed" && !completed)) return [];
    const assigned = role === "teacher" ? service.teacher : student.manager;
    const staffId = catalogs.get(assigned)?.kind === role ? assigned : "";
    const projects = new Set(service.projects.map((id) => catalogs.get(id)?.kind === "project" ? id : ""));
    if (!projects.size) projects.add("");
    usedStaff.add(staffId);
    for (const id of projects) usedProjects.add(id);
    return [{ service, student, staffId, projects }];
  });

  const metrics = new Map<string, Metric>();
  function metric(title: string, ...parts: string[]): Metric {
    const key = parts.map((part) => encodeURIComponent(part) || "_").join("/");
    const result: Metric = { key, title, members: new Map() };
    metrics.set(key, result);
    return result;
  }
  const totalLabel = { active: "在服总人数", completed: "已完成人数", all: "学生总人数" }[scope];
  const total = metric(totalLabel, "total");
  const statuses = new Map(statusLabels.map((label) => [label, metric(label, "status", label)] as const));
  const targets = new Map<string, TargetGroup>();
  const phaseColumns = (Object.keys(phases) as Phase[]).filter((phase) =>
    scope === "all" || (scope === "completed" ? phase === "completed" : phase !== "completed"));
  const projectItems = catalogAxis(data.catalogs, "project", usedProjects, "项目待补");
  const projects = projectItems.map((p) => ({ ...p, total: metric(p.name + " · 项目总人数", "project", p.id) }));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const staff = catalogAxis(data.catalogs, role, usedStaff, "未分配" + roles[role]).map((person) => {
    const name = person.name;
    return {
      ...person, total: metric(name + " · 负责学生", "staff", person.id, "total"),
      phases: new Map(phaseColumns.map((phase) => [phase, metric(name + " · " + phases[phase], "staff", person.id, phase)])),
      projects: new Map(projects.map((p) => [p.id, metric(name + " · " + p.name, "staff-project", person.id, p.id)])),
    };
  });
  const personById = new Map(staff.map((person) => [person.id, person]));

  for (const { service, student, staffId, projects: projectIds } of records) {
    const add = (group: Metric) => addMember(group, student, service);
    add(total);
    const closure = service.phase === "completed" ? currentClosure(service) : undefined;
    const status = service.phase === "paused" || closure?.phase === "paused" ? "暂停中" : closure?.status || service.status;
    add(statuses.get(status as (typeof statusLabels)[number]) ?? statuses.get("状况待补")!);

    const key = targetCombination(service.targets);
    let target = targets.get(key);
    if (!target) {
      const label = key || "目标待补";
      target = {
        label, total: metric(label + " · 目标学生", "target", key, "total"),
        applying: metric(label + " · 当前出愿中", "target", key, "applying"),
        submitted: metric(label + " · 已正式递交", "target", key, "submitted"),
      };
      targets.set(key, target);
    }
    add(target.total);
    if (service.phase === "applying") add(target.applying);
    if (submittedServices.has(service.id)) add(target.submitted);

    const person = personById.get(staffId)!;
    add(person.total);
    add(person.phases.get(service.phase)!);
    for (const id of projectIds) {
      add(projectById.get(id)!.total);
      add(person.projects.get(id)!);
    }
  }
  const orderedTargets = [...targets].sort(([a], [b]) => Number(!a) - Number(!b) || a.localeCompare(b));
  return { total, statuses, targets: orderedTargets.map(([, group]) => group), staff, projects, phaseColumns, metrics };
}
