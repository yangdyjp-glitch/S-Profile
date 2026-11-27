import {
  catalogs,
  closureKinds,
  currentClosure,
  emptyApplication,
  emptyService,
  emptyStudent,
  entryKinds,
  phases,
  roles,
  tokyoDay,
} from "./model";
import type {
  Account,
  Application,
  Catalog,
  ClosureKind,
  Entry,
  EntryKind,
  Kind,
  Service,
  Student,
} from "./model";
import {
  activeAdmission,
  day,
  fail,
  fields,
  id,
  month,
  Problem,
  reference,
  required,
  stamp,
  string,
  strings,
  updateExceptions,
  validateApplication,
  validateService,
  validateStudent,
} from "./validation";
import { all, bump, catalogItem, expect, meta, one, record, serviceEditContext, type Input } from "./store";
export interface Plan {
  sql: D1PreparedStatement[];
  result: { id: string; studentId?: string; serviceId?: string };
}
const object = (v: unknown): Input =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Input) : {};
function application(
  input: Input,
  serviceId: string,
  list: Catalog[],
  old?: Application,
): Application {
  const a = {
    ...(old ? bump(old) : meta(id("A"))),
    ...fields(emptyApplication, input, old),
    serviceId,
    voided: old?.voided || false,
  } as Application;
  if (!a.admitted) {
    a.received = "";
    a.final = false;
  }
  if (!a.final || !a.needsOffer) a.offer = "";
  updateExceptions(a, input);
  validateApplication(a, list, old);
  return a;
}
function targetStatus(s: Service) {
  if (s.status === "未开始" || s.status === "当期申请")
    s.targets = [...s.original];
}
export function transition(
  s: Service,
  action: string,
  input: Input,
  apps: Application[],
  actor: Account,
): string {
  const at = stamp();
  switch (action) {
    case "pause":
      if (s.phase !== "progress") fail("phase", "只有进行中的服务可以暂停");
      s.pauses = [
        ...s.pauses,
        {
          from: s.phase,
          status: s.status,
          reason: string(input.reason),
          start: at,
          end: "",
        },
      ];
      s.phase = "paused";
      s.status = "暂停中";
      return "暂停服务";
    case "resume": {
      if (s.phase !== "paused") fail("phase", "只有暂停中的服务可以恢复");
      const target = string(input.phase) || "progress";
      if (target !== "progress" && target !== "applying")
        fail("phase", "请确认恢复阶段");
      const status = string(input.status);
      if (!["未开始", "当期申请", "延期"].includes(status))
        fail("status", "恢复时请选择学生状况");
      s.pauses = s.pauses.map((p, i) =>
        !p.end && i === s.pauses.length - 1 ? { ...p, end: at } : p,
      );
      s.phase = target;
      s.status = status;
      s.targets = strings(input.targets);
      targetStatus(s);
      return "恢复服务";
    }
    case "apply":
      if (s.phase !== "progress") fail("phase", "请从进行中进入出愿");
      s.phase = "applying";
      return "进入出愿";
    case "return":
      if (s.phase !== "applying") fail("phase", "只有出愿中的服务可以退回");
      s.phase = "progress";
      return "退回进行中";
    case "close": {
      if (s.phase === "completed") fail("phase", "服务已经结案");
      const kind = string(input.kind) as ClosureKind,
        note = string(input.note);
      if (!Object.hasOwn(closureKinds, kind)) fail("kind", "请选择完成情况");
      if (kind === "admission" && !apps.some((a) => a.admitted && !a.voided))
        fail("kind", "学校结果结案需要至少一条正式合格申请");
      if (kind === "refund" && (!note || input.confirmed !== true))
        fail("note", "请确认已全部退清，并填写退款说明");
      if (kind === "abandoned" && input.confirmed !== true)
        fail("confirmed", "请确认学生或渠道明确终止且不退款");
      s.closures = [
        ...s.closures,
        {
          kind,
          note,
          targets: [...s.targets],
          phase: s.phase,
          status: s.status,
          at,
          undone: "",
          actor: actor.name,
        },
      ];
      s.phase = "completed";
      return "结案 · " + closureKinds[kind];
    }
    case "reopen": {
      const c = currentClosure(s);
      if (s.phase !== "completed" || !c) fail("phase", "没有可撤回的结案");
      s.phase = c.phase || "progress";
      s.status = c.status || (s.phase === "paused" ? "暂停中" : "");
      if (!s.status) s.missing = [...new Set([...(s.missing || []), "status"])];
      s.closures = s.closures.map((v) => (v === c ? { ...c, undone: at } : v));
      return "撤回误结案";
    }
    default:
      throw new Problem(404, "未知阶段操作");
  }
}
export async function business(
  db: D1Database,
  actor: Account,
  method: string,
  p: string[],
  input: Input,
): Promise<Plan> {
  const [section, key, child, arg] = p;
  let sql: D1PreparedStatement[] = [];
  if (section === "catalogs" && Object.hasOwn(catalogs, key)) {
    const creating = method === "POST" && p.length === 2;
    const changing = (method === "PATCH" || method === "DELETE") && p.length === 3;
    if (!creating && !changing) throw new Problem(404, "名册操作不存在");
    const old = child ? await catalogItem(db, key, child) : null;
    if (old) {
      expect(old, input.expectedVersion);
      if (method === "DELETE") {
        const removed = { ...bump(old), active: false, deleted: true };
        return {
          sql: record(db, "catalogs", old, removed, actor, "删除" + catalogs[old.kind]),
          result: { id: old.id },
        };
      }
    }
    const c: Catalog = {
      ...(old ? bump(old) : meta(id("C"))),
      kind: key as Kind,
      name: string(input.name ?? old?.name),
      active:
        input.active === undefined
          ? (old?.active ?? true)
          : input.active === true,
      aliases: key === "school" ? strings(input.aliases ?? old?.aliases) : [],
    };
    required(c, ["name"]);
    sql = record(db, "catalogs", old, c, actor, old ? "修改名册" : "新增名册");
    return { sql, result: { id: c.id } };
  }
  if (
    section === "students" &&
    !child &&
    (method === "POST" || method === "PATCH")
  ) {
    const [old, list] = await Promise.all([
      key ? one<Student>(db, "students", key) : null,
      all<Catalog>(db, "catalogs", "WHERE kind='manager'"),
    ]);
    if (old) expect(old, input.expectedVersion);
    const s = {
      ...(old ? bump(old) : meta(id("ST"))),
      ...fields(emptyStudent, input, old ?? undefined),
    } as Student;
    updateExceptions(s, input);
    validateStudent(s, list, old ?? undefined);
    sql = record(
      db,
      "students",
      old,
      s,
      actor,
      old ? "修改学生档案" : "建立学生档案",
      s.id,
    );
    return { sql, result: { id: s.id, studentId: s.id } };
  }
  if (
    (section === "services" && !key && method === "POST") ||
    (section === "students" && child === "services" && method === "POST")
  ) {
    const studentId = section === "students" ? key : string(input.studentId);
    const [existing, list] = await Promise.all([
      studentId ? one<Student>(db, "students", studentId) : null,
      all<Catalog>(db, "catalogs"),
    ]);
    let st: Student;
    if (existing) {
      st = existing;
    } else {
      st = {
        ...meta(id("ST")),
        ...fields(emptyStudent, object(input.student)),
      };
      validateStudent(st, list);
      sql.push(
        ...record(db, "students", null, st, actor, "建立学生档案", st.id),
      );
    }
    const payload = object(input.service ?? input);
    const s: Service = {
      ...meta(id("SV")),
      studentId: st.id,
      ...fields(emptyService, payload),
      phase: "progress",
      pauses: [],
      closures: [],
      rewards: {},
    };
    targetStatus(s);
    const apps = (
      Array.isArray(input.applications) ? input.applications : []
    ).map((raw) => application(object(raw), s.id, list));
    validateService(s, list, apps);
    const phase = string(input.phase) || "progress";
    if (!Object.hasOwn(phases, phase)) fail("phase", "阶段无效");
    if (phase === "paused") transition(s, "pause", input, apps, actor);
    if (phase === "applying") transition(s, "apply", input, apps, actor);
    if (phase === "completed")
      transition(s, "close", object(input.closure), apps, actor);
    sql.push(
      ...record(
        db,
        "services",
        null,
        s,
        actor,
        "建立服务 · " + phases[s.phase],
        st.id,
        s.id,
      ),
    );
    for (const a of apps)
      sql.push(
        ...record(
          db,
          "applications",
          null,
          a,
          actor,
          "登记已递交申请",
          st.id,
          s.id,
        ),
      );
    return { sql, result: { id: s.id, studentId: st.id, serviceId: s.id } };
  }
  if ((section === "services" && key) || section === "applications") {
    const oldApp =
      section === "applications"
        ? await one<Application>(db, "applications", key)
        : undefined;
    const serviceId = oldApp?.serviceId || key;
    const { service: old, apps, catalogs: list } =
      await serviceEditContext(db, serviceId, !!oldApp || child === "applications");
    expect(old, oldApp ? input.serviceVersion : input.expectedVersion);
    const s = bump(old);
    let action = "";
    if ((section === "services" && child === "applications") || oldApp) {
      if (oldApp) {
        expect(oldApp, input.expectedVersion);
        if (oldApp.voided) fail("voided", "申请已作废");
      }
      const a =
        child === "void" && oldApp
          ? { ...bump(oldApp), voided: true }
          : application(input, s.id, list, oldApp);
      const next = [...apps.filter((v) => v.id !== a.id), a];
      activeAdmission(s, next);
      validateService(s, list, next, old);
      action = a.voided
        ? "作废学校申请"
        : oldApp
          ? "修改学校申请"
          : "登记已递交申请";
      sql.push(
        ...record(db, "services", old, s, actor, action, s.studentId, s.id),
        ...record(
          db,
          "applications",
          oldApp || null,
          a,
          actor,
          action,
          s.studentId,
          s.id,
        ),
      );
      return { sql, result: { id: a.id, serviceId: s.id } };
    }
    if (child === "actions") {
      action = transition(s, arg, input, apps, actor);
    } else if (child === "rewards") {
      if (!Object.hasOwn(roles, arg)) fail("role", "无效的奖励角色");
      const role = arg as keyof typeof roles,
        recipient = string(input.recipient),
        payroll = string(input.month);
      if (!recipient) fail("recipient", "请选择要确认的奖励归属人");
      reference(list, role, recipient, role, s.rewards[role]?.recipient);
      if (payroll && !month(payroll)) fail("month", "请填写有效的工资年月");
      s.rewards = {
        ...s.rewards,
        [role]: { recipient, month: payroll, confirmed: true },
      };
      action = "确认" + roles[role] + "奖励归属";
    } else if (!child && method === "PATCH") {
      Object.assign(s, fields(emptyService, input, old), {
        version: old.version + 1,
        updatedAt: stamp(),
      });
      if (
        old.original.length &&
        JSON.stringify(s.original) !== JSON.stringify(old.original)
      )
        fail("original", "原合同入学目标已留档，延期请修改当前目标");
      if (
        (old.phase === "paused" || old.phase === "completed") &&
        s.status !== old.status
      )
        fail("status", "请先恢复服务或撤回结案再修改学生状况");
      if (
        s.status !== old.status ||
        (old.phase !== "completed" && old.phase !== "paused")
      )
        targetStatus(s);
      updateExceptions(s, input);
      action = "修改服务资料";
    } else throw new Problem(404, "此服务操作不存在");
    validateService(s, list, apps, old);
    sql = record(db, "services", old, s, actor, action, s.studentId, s.id);
    return { sql, result: { id: s.id, serviceId: s.id } };
  }
  if (
    (section === "students" && child === "entries") ||
    section === "entries"
  ) {
    const old =
      section === "entries" ? await one<Entry>(db, "entries", key) : null;
    if (old) {
      expect(old, input.expectedVersion);
      if (old.voided) fail("voided", "记录已作废");
    }
    const sid = old?.studentId || key;
    if (!old) await one<Student>(db, "students", sid);
    const e: Entry = old
      ? bump(old)
      : {
          ...meta(id("EN")),
          studentId: sid,
          kind: input.kind as EntryKind,
          body: "",
          date: tokyoDay(),
          precision: "date",
          rawDate: "",
          recorded: stamp(),
          voided: false,
          source: "",
        };
    if (child === "void" && old) e.voided = true;
    else {
      e.body = string(input.body ?? e.body);
      if (!e.body) fail("body", "请填写记录正文");
      if (!Object.hasOwn(entryKinds, e.kind)) fail("kind", "请选择记录分类");
      if (!old || (Object.hasOwn(input, "date") && input.date !== old.date)) {
        e.date = string(input.date) || (!old ? tokyoDay() : "");
        if (!day(e.date) || e.date > tokyoDay())
          fail("date", "请选择今天或过去的有效日期");
        e.precision = "date";
      }
    }
    sql = record(
      db,
      "entries",
      old,
      e,
      actor,
      e.voided ? "作废记录" : old ? "修改记录" : "新增" + entryKinds[e.kind],
      sid,
    );
    return { sql, result: { id: e.id, studentId: sid } };
  }
  throw new Problem(404, "接口不存在");
}
