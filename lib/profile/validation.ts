import {
  choices, currentClosure, englishExams, hasLanguageScore, hasLaterTargets,
  identity, isExamScore, labels, languageScoreKeys, requiresActiveStatus,
} from "./model";
import type { Application, Catalog, Service, Student } from "./model";
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
    public field = "",
    public latest?: unknown,
  ) {
    super(message);
  }
}
export function fail(field: string, message: string): never {
  throw new Problem(422, message, field);
}
export const id = (prefix: string) => prefix + "-" + crypto.randomUUID();
export const stamp = () => new Date().toISOString();
export const string = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const strings = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(string).filter(Boolean))] : [];
export const month = (v: string) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v);
export const intake = (v: string) => month(v) && /-(04|10)$/.test(v);
export const day = (v: string) =>
  /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
export function required(obj: object, keys: string[], missing: string[] = []) {
  const values = obj as Record<string, unknown>;
  for (const k of keys)
    if (
      !missing.includes(k) &&
      (!values[k] || (Array.isArray(values[k]) && !values[k].length))
    )
      fail(k, "请填写" + (labels[k] || k));
}
function option(
  field: keyof typeof choices,
  value: string,
  extra: string[] = [],
) {
  if (value && !choices[field].includes(value) && !extra.includes(value))
    fail(field, "请选择有效的" + labels[field]);
}
export function reference(
  list: Catalog[],
  field: string,
  value: string,
  kind: Catalog["kind"],
  previous?: string | string[],
) {
  if (!value) return;
  if (
    !list.some(
      (c) =>
        c.id === value &&
        c.kind === kind &&
        (c.active ||
          (Array.isArray(previous)
            ? previous.includes(value)
            : previous === value)),
    )
  )
    fail(field, "请从" + labels[field] + "名册选择有效项目");
}
export function syncStudentLanguage(student: Student, patch?: Record<string, unknown>) {
  if (patch && !languageScoreKeys.some((key) => Object.hasOwn(patch, key))) return;
  student.declaration = hasLanguageScore(student) ? "已有成绩" : "暂无语言成绩";
  if (student.missing) {
    student.missing = student.missing.filter((key) => key !== "declaration" && key !== "scores");
  }
}
export function validateStudent(s: Student, list: Catalog[], old?: Student) {
  required(s, ["name", "orderMonth", "location", "declaration"], s.missing);
  if (!identity(s.name)) fail("name", "姓名需包含星号和空格以外的文字");
  if (s.orderMonth && !month(s.orderMonth))
    fail("orderMonth", "请填写有效年月");
  option("location", s.location);
  option("declaration", s.declaration);
  option("jlpt", s.jlpt);
  reference(list, "manager", s.manager, "manager", old?.manager);
  for (const k of englishExams)
    if (s[k] && !isExamScore(s[k]))
      fail(k, labels[k] + "应为非负数值");
  const has = hasLanguageScore(s);
  if (s.declaration === "已有成绩" && !has && !s.missing?.includes("scores"))
    fail("declaration", "请填写至少一项已取得的考试成绩");
  if (s.declaration === "暂无语言成绩" && has)
    fail("declaration", "已填写考试结果，请选择已有成绩");
}
export function validateService(
  s: Service,
  list: Catalog[],
  apps: Application[],
  old?: Service,
) {
  required(
    s,
    [
      "channel",
      "projects",
      "major",
      "original",
      "status",
      "collection",
      "production",
      "progress",
      "risk",
      "publication",
    ],
    s.missing,
  );
  reference(list, "channel", s.channel, "channel", old?.channel);
  reference(list, "teacher", s.teacher, "teacher", old?.teacher);
  for (const p of s.projects)
    reference(list, "projects", p, "project", old?.projects);
  for (const k of [
    "collection",
    "production",
    "progress",
    "risk",
    "publication",
  ] as const)
    option(k, s[k]);
  option("status", s.status, ["暂停中"]);
  for (const key of ["original", "targets"] as const)
    if (s[key].some((v) => !intake(v)))
      fail(key, labels[key] + "只接受 4 月或 10 月");
  if (
    s.status === "延期" &&
    !s.missing?.includes("targets") &&
    !hasLaterTargets(s.original, s.targets)
  )
    fail("targets", "延期需填写晚于原合同最后一个批次的新目标");
  if (
    s.phase !== "completed" &&
    (s.phase === "paused") !== (s.status === "暂停中")
  )
    fail("status", "请使用暂停或恢复操作调整状况");
  if (
    s.phase !== "completed" &&
    s.status === "未开始" &&
    (requiresActiveStatus(s.progress) || apps.some((a) => !a.voided))
  )
    fail("status", "已经开始联系教授或正式申请，请改选当期申请或延期");
  if (
    s.progress === "完成申请" &&
    old?.progress !== s.progress &&
    !apps.some((a) => !a.voided && a.admitted) &&
    !s.missing?.includes("admission")
  )
    fail("progress", "完成申请需要至少一条正式合格记录");
}
export function validateApplication(
  a: Application,
  list: Catalog[],
  old?: Application,
) {
  required(a, ["school", "project"], a.missing);
  reference(list, "school", a.school, "school", old?.school);
  reference(list, "project", a.project, "project", old?.project);
  if (a.intake && !intake(a.intake))
    fail("intake", "学校入学时间只接受 4 月或 10 月");
  if (a.workMonth && !month(a.workMonth)) fail("workMonth", "请填写有效年月");
  if (a.deadline && !day(a.deadline)) fail("deadline", "请填写有效的截止日期");
  if (
    a.admitted &&
    !day(a.received) &&
    !(a.missing?.includes("received") && !a.received)
  )
    fail("received", "正式合格需要收到消息的具体日期");
  if (a.final && !a.admitted) fail("final", "最终选择必须是已合格的申请");
  if (
    a.final &&
    a.needsOffer &&
    !month(a.offer) &&
    !a.missing?.includes("offer")
  )
    fail("offer", "此项最终选择需要内诺年月");
  if (a.offer && !month(a.offer)) fail("offer", "请填写有效内诺年月");
}
export function activeAdmission(s: Service, apps: Application[]) {
  if (
    s.phase === "completed" &&
    currentClosure(s)?.kind === "admission" &&
    !apps.some((a) => !a.voided && a.admitted)
  )
    fail("admitted", "学校结果结案需要保留至少一条合格申请，请先撤回结案");
}
export function fields<T extends object>(
  template: T,
  input: Record<string, unknown>,
  old?: T,
): T {
  const target = { ...template };
  for (const key of Object.keys(template) as (keyof T)[]) {
    if (old) target[key] = old[key];
    if (!Object.hasOwn(input, key)) continue;
    const v = input[key as string],
      base = template[key];
    const val = Array.isArray(base)
      ? strings(v)
      : typeof base === "boolean"
        ? v === true
        : string(v);
    target[key] = val as T[keyof T];
  }
  return target;
}
export function updateExceptions<T extends { missing?: string[] }>(
  row: T,
  input: Record<string, unknown>,
) {
  if (!row.missing) return;
  row.missing = row.missing.filter(
    (k) =>
      !Object.hasOwn(input, k) ||
      !(row as Record<string, unknown>)[k] ||
      (Array.isArray((row as Record<string, unknown>)[k]) &&
        !((row as Record<string, unknown>)[k] as unknown[]).length),
  );
  if (
    row.missing.includes("scores") &&
    (string(input.declaration) === "暂无语言成绩" || hasLanguageScore(input))
  )
    row.missing = row.missing.filter((k) => k !== "scores");
}
