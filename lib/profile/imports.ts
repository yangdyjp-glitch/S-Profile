import {
  catalogs,
  closureKinds,
  emptyApplication,
  emptyService,
  emptyStudent,
  entryKinds,
  phases,
  type Account,
  type Application,
  type Catalog,
  type Entry,
  type Kind,
  type Phase,
  type Service,
  type Student,
} from "./model";
import type { Batch, Proposal, Source } from "./excel-model";
import {
  all,
  bump,
  commit,
  digest,
  expect,
  guard,
  meta,
  one,
  record,
  type Input,
} from "./store";
import {
  day,
  fail,
  fields,
  id,
  month,
  Problem,
  stamp,
  string,
  updateExceptions,
  validateApplication,
  validateService,
  validateStudent,
} from "./validation";
import { activeAdmission } from "./validation";

const batchQuery = `SELECT i.*, count(s.id) total,
  count(CASE WHEN s.state='pending' THEN 1 END) pending,
  count(CASE WHEN s.state='linked' THEN 1 END) linked,
  count(CASE WHEN s.state='source' THEN 1 END) saved
  FROM imports i LEFT JOIN sources s ON i.id=s.batch_id`;
export async function batches(db: D1Database) {
  return (
    await db
      .prepare(batchQuery + " GROUP BY i.id ORDER BY i.at DESC")
      .all<Batch>()
  ).results;
}
async function getBatch(db: D1Database, key: string) {
  const b = await db
    .prepare("SELECT * FROM imports WHERE id=?")
    .bind(key)
    .first<Batch & { object_key: string }>();
  if (!b) throw new Problem(404, "找不到导入批次");
  return b;
}
export async function upload(
  request: Request,
  db: D1Database,
  bucket: R2Bucket,
  actor: Account,
) {
  const name = decodeURIComponent(
    request.headers.get("x-file-name") || "学生资料.xlsx",
  );
  if (!/\.xlsx$/i.test(name)) fail("file", "请选择 .xlsx 工作簿");
  const buf = await request.arrayBuffer();
  if (new Uint8Array(buf)[0] !== 80 || new Uint8Array(buf)[1] !== 75)
    fail("file", "文件不是有效的 Excel 工作簿");
  const key = await digest(buf),
    objectKey = "workbooks/" + key + ".xlsx";
  if (
    !(await db.prepare("SELECT id FROM imports WHERE id=?").bind(key).first())
  ) {
    await bucket.put(objectKey, buf, {
      httpMetadata: {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    await db
      .prepare(
        "INSERT INTO imports(id,name,actor,at,state,metadata,object_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(key, name, actor.name, stamp(), "uploaded", "[]", objectKey)
      .run();
  }
  return { id: key };
}
export async function prepare(db: D1Database, bucket: R2Bucket, key: string) {
  const b = await getBatch(db, key);
  if (b.state === "ready") return { ok: true };
  const original = await bucket.get(b.object_key);
  if (!original) throw new Problem(404, "原工作簿不可用");
  const { parseBook } = await import("./parse-book");
  let parsed: Awaited<ReturnType<typeof parseBook>>;
  try {
    parsed = await parseBook(await original.arrayBuffer(), key);
  } catch {
    throw new Problem(422, "工作簿解析失败。可下载原件，检查是否加密或损坏。");
  }
  const existing = new Set(
    (
      await db
        .prepare("SELECT identity FROM students")
        .all<{ identity: string }>()
    ).results.map((s) => s.identity),
  );
  const statements: D1PreparedStatement[] = [];
  let size = 0;
  const flush = async () => {
    if (statements.length) await db.batch(statements.splice(0));
    size = 0;
  };
  for (const r of parsed.rows) {
    if (r.state === "pending" && existing.has(r.identity))
      r.issues.push("已有同名档案，需确认是同一学生或不同服务");
    let raw = JSON.stringify(r.raw);
    if (new TextEncoder().encode(raw).length > 90000) {
      const object = "sources/" + r.id + ".json";
      await bucket.put(object, raw);
      raw = JSON.stringify({ object });
    }
    const proposal = JSON.stringify(r.proposal),
      issues = JSON.stringify(r.issues);
    statements.push(
      db
        .prepare(
          "INSERT INTO sources(id,batch_id,sheet,row,phase,name,identity,raw,proposal,issues,state) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          r.id,
          key,
          r.sheet,
          r.row,
          r.phase,
          r.name,
          r.identity,
          raw,
          proposal,
          issues,
          r.state,
        ),
    );
    size += raw.length + proposal.length;
    if (statements.length >= 40 || size > 240000) await flush();
  }
  await flush();
  await db
    .prepare("UPDATE imports SET state='ready',metadata=? WHERE id=?")
    .bind(JSON.stringify(parsed.metadata), key)
    .run();
  return { ok: true };
}
type Stored = Omit<Source, "raw" | "proposal" | "issues"> & {
  raw: string;
  proposal: string;
  issues: string;
};
export async function sourceRow(
  db: D1Database,
  bucket: R2Bucket,
  key: string,
  rid: string,
): Promise<Source> {
  const r = await db
    .prepare("SELECT * FROM sources WHERE batch_id=? AND id=?")
    .bind(key, rid)
    .first<Stored>();
  if (!r) throw new Problem(404, "来源行不存在");
  let raw = JSON.parse(r.raw);
  if (raw.object) {
    const blob = await bucket.get(raw.object);
    if (!blob) throw new Problem(404, "找不到来源内容");
    raw = JSON.parse(await blob.text());
  }
  return {
    ...r,
    raw,
    proposal: JSON.parse(r.proposal),
    issues: JSON.parse(r.issues),
  };
}
export async function review(
  db: D1Database,
  key: string,
  state: string,
  offset: number,
) {
  const where = state === "all" ? "" : " AND state=?";
  const args = state === "all" ? [key] : [key, state];
  const [rows, total] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT id,sheet,row,phase,name,state,issues,student_id,service_id,reviewer FROM sources WHERE batch_id=?" +
          where +
          " ORDER BY sheet,row LIMIT 30 OFFSET ?",
      )
      .bind(...args, offset),
    db
      .prepare("SELECT count(*) c FROM sources WHERE batch_id=?" + where)
      .bind(...args),
  ]);
  return {
    rows: rows.results.map((r) => ({
      ...r,
      issues: JSON.parse(r.issues as string),
    })),
    total: total.results[0].c,
  };
}
const missingKeys = (obj: object, keys: string[]) =>
  keys.filter((k) => {
    const v = (obj as Record<string, unknown>)[k];
    return !v || (Array.isArray(v) && !v.length);
  });
export async function resolve(
  db: D1Database,
  bucket: R2Bucket,
  actor: Account,
  key: string,
  input: Input,
  auto = false,
) {
  if ((await getBatch(db, key)).state !== "ready")
    throw new Problem(409, "请先完成原表解析");
  const row = await sourceRow(db, bucket, key, string(input.rowId));
  if (row.state !== "pending")
    throw new Problem(409, "此来源已经核对，刷新查看结果");
  const sql = [
    guard(
      db,
      "EXISTS(SELECT 1 FROM sources WHERE id=? AND state='pending')",
      row.id,
    ),
  ];
  const mappings: { entity: string; id: string }[] = [];
  const finish = (state: string, sid: string | null, vid: string | null) =>
    sql.push(
      db
        .prepare(
          "UPDATE sources SET state=?,student_id=?,service_id=?,reviewer=?,reviewed_at=?,resolution=? WHERE id=?",
        )
        .bind(
          state,
          sid,
          vid,
          actor.name,
          stamp(),
          JSON.stringify({
            mode: input.mode,
            note: string(input.note),
            automatic: auto,
            proposal: input.proposal || row.proposal,
            mappings,
          }),
          row.id,
        ),
    );
  if (input.mode === "source") {
    finish("source", null, null);
    return { sql, result: { id: row.id } };
  }
  if (!["new", "existing", "link"].includes(string(input.mode)))
    fail("mode", "请选择处理方式");
  if (input.mode !== "new" && !input.studentId)
    fail("studentId", "请选择已有学生档案");
  if (input.mode === "link" && !input.serviceId)
    fail("serviceId", "请选择要关联的服务");
  const p = {
    ...row.proposal,
    ...(input.proposal && typeof input.proposal === "object"
      ? input.proposal
      : {}),
  } as Proposal;
  const phase = string(input.phase || row.phase) as Phase;
  if (!Object.hasOwn(phases, phase)) fail("phase", "请选择真实阶段");
  const list = await all<Catalog>(db, "catalogs");
  const mapped = (kind: Kind, name: string) => {
    if (!name) return "";
    const matches = (c: Catalog) => c.kind === kind &&
      (c.name === name || c.id === name || c.aliases.includes(name));
    const hit = list.find((c) => !c.deleted && matches(c));
    if (hit) return hit.id;
    const deleted = list.find(matches);
    if (deleted && (auto || deleted.id === name))
      fail(kind, `「${deleted.name}」已从${catalogs[kind]}名册删除，请核对原表名称`);
    const c: Catalog = {
      ...meta(id("C")),
      kind,
      name,
      active: true,
      aliases: [],
    };
    list.push(c);
    sql.push(
      ...record(db, "catalogs", null, c, actor, "从原表确认" + catalogs[kind]),
    );
    return c.id;
  };
  let st: Student;
  if (input.studentId) {
    st = await one<Student>(db, "students", string(input.studentId));
    if (input.fillMissing === true) {
      const prior = st,
        patch: Input = {};
      for (const k of Object.keys(
        emptyStudent,
      ) as (keyof typeof emptyStudent)[]) {
        if (k !== "name" && !prior[k] && p[k])
          patch[k] = k === "manager" ? mapped("manager", p[k]) : p[k];
      }
      if (Object.keys(patch).length) {
        st = { ...bump(prior), ...fields(emptyStudent, patch, prior) };
        updateExceptions(st, patch);
        validateStudent(st, list, prior);
        sql.push(
          ...record(
            db,
            "students",
            prior,
            st,
            actor,
            "核对并补齐学生档案",
            st.id,
          ),
        );
      }
    }
  } else {
    st = {
      ...meta(id("ST")),
      ...fields(emptyStudent, p as unknown as Input),
      manager: mapped("manager", string(p.manager)),
    };
    st.missing = missingKeys(st, ["orderMonth", "location", "declaration"]);
    if (
      st.declaration === "已有成绩" &&
      ![st.toefl, st.ielts, st.toeic].some(Boolean) &&
      !/^N[1-5]/.test(st.jlpt)
    )
      st.missing.push("scores");
    validateStudent(st, list);
    sql.push(
      ...record(
        db,
        "students",
        null,
        st,
        actor,
        "由 Excel 建立学生档案",
        st.id,
      ),
    );
  }
  let s: Service,
    previous: Service | null = null;
  if (input.serviceId) {
    previous = await one<Service>(db, "services", string(input.serviceId));
    expect(previous, input.serviceVersion);
    s = bump(previous);
    if (s.studentId !== st.id) fail("serviceId", "所选服务不属于这名学生");
    if (input.fillMissing === true) {
      const patch: Input = {};
      for (const k of Object.keys(
        emptyService,
      ) as (keyof typeof emptyService)[]) {
        const old = s[k],
          candidate = p[k];
        if (
          (Array.isArray(old) ? old.length : old) ||
          !(Array.isArray(candidate) ? candidate.length : candidate)
        )
          continue;
        if (k === "channel" || k === "teacher")
          patch[k] = mapped(k, string(candidate));
        else if (k === "projects")
          patch[k] = p.projects.map((n) => mapped("project", n));
        else patch[k] = candidate;
      }
      Object.assign(s, patch);
      updateExceptions(s, patch);
    }
  } else {
    const base = fields(emptyService, p as unknown as Input);
    s = {
      ...meta(id("SV")),
      ...base,
      studentId: st.id,
      phase,
      channel: mapped("channel", p.channel),
      teacher: mapped("teacher", p.teacher),
      projects: base.projects.map((v) => mapped("project", v)),
      pauses: [],
      closures: [],
      rewards: {},
    };
    s.missing = missingKeys(s, [
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
      "targets",
    ]);
    if (phase === "paused") {
      s.status = "暂停中";
      s.pauses = [
        {
          from: "",
          status: "",
          reason: string(p.pauseReason),
          start: "",
          end: "",
        },
      ];
    }
    if (phase === "completed") {
      if (!p.closureKind || !Object.hasOwn(closureKinds, p.closureKind))
        fail("closureKind", "请核对结案类型");
      if (p.closureKind === "refund" && !string(p.closureNote))
        s.missing.push("closureNote");
      s.closures = [
        {
          kind: p.closureKind,
          note: string(p.closureNote),
          targets: [...s.targets],
          phase: "",
          status: s.status,
          at: "",
          undone: "",
          actor: "",
        },
      ];
    }
    for (const role of ["teacher", "manager"] as const) {
      const r = p.rewards?.[role];
      if (r?.name) {
        if (r.month && !month(r.month)) fail("month", "请核对奖励工资年月");
        s.rewards[role] = {
          recipient: mapped(role, string(r.name)),
          month: string(r.month),
          confirmed: true,
        };
      }
    }
  }
  const apps: Application[] = [];
  for (const proposed of p.schools || []) {
    if (!proposed.submitted) continue;
    const a: Application = {
      ...meta(id("A")),
      ...fields(emptyApplication, proposed as unknown as Input),
      serviceId: s.id,
      school: mapped("school", string(proposed.name)),
      project: mapped("project", string(proposed.project)),
      voided: false,
    };
    if (!a.school) fail("school", "请核对已递交学校名称");
    a.missing = missingKeys(a, [
      "project",
      ...(a.admitted ? ["received"] : []),
      ...(a.final && a.needsOffer ? ["offer"] : []),
    ]);
    if (!a.admitted) a.received = "";
    if (!a.final || !a.needsOffer) a.offer = "";
    validateApplication(a, list);
    apps.push(a);
  }
  const allApps = previous
    ? [
        ...(await all<Application>(db, "applications", "WHERE service_id=?", [
          s.id,
        ])),
        ...apps,
      ]
    : apps;
  if (
    !previous &&
    s.progress === "完成申请" &&
    !allApps.some((a) => a.admitted && !a.voided)
  )
    s.missing?.push("admission");
  validateService(s, list, allApps, previous || undefined);
  if (s.phase === "completed" && s.closures.at(-1)?.kind === "admission")
    activeAdmission(s, allApps);
  sql.push(
    ...record(
      db,
      "services",
      previous,
      s,
      actor,
      previous ? "核对并关联 Excel 来源" : "由 Excel 建立服务",
      st.id,
      s.id,
    ),
  );
  for (const a of apps) {
    sql.push(
      ...record(
        db,
        "applications",
        null,
        a,
        actor,
        "核对学校申请",
        st.id,
        s.id,
      ),
    );
    mappings.push({ entity: "applications", id: a.id });
  }
  for (const e of p.entries || []) {
    if (!string(e.body)) continue;
    if (!Object.hasOwn(entryKinds, e.kind)) fail("kind", "请选择日志分类");
    if (e.date && !(day(e.date) || month(e.date)))
      fail("date", "旧记录使用完整日期、年月或留空");
    const n: Entry = {
      ...meta(id("EN")),
      studentId: st.id,
      kind: e.kind,
      body: e.body,
      date: e.date || "",
      precision: e.date ? (e.date.length === 10 ? "date" : "month") : "unknown",
      rawDate: string(e.rawDate),
      recorded: stamp(),
      voided: false,
      source: row.sheet + "!" + string(e.cell) + " · " + key,
    };
    sql.push(
      ...record(
        db,
        "entries",
        null,
        n,
        actor,
        "整理历史" + entryKinds[e.kind],
        st.id,
      ),
    );
    mappings.push({ entity: "entries", id: n.id });
  }
  finish("linked", st.id, s.id);
  return { sql, result: { id: row.id, studentId: st.id, serviceId: s.id } };
}
export async function automatic(
  db: D1Database,
  bucket: R2Bucket,
  actor: Account,
  key: string,
) {
  const rows = await db
    .prepare(
      "SELECT id FROM sources WHERE batch_id=? AND state='pending' AND issues='[]' ORDER BY row LIMIT 12",
    )
    .bind(key)
    .all<{ id: string }>();
  for (const r of rows.results) {
    const input = { rowId: r.id, mode: "new" };
    try {
      await commit(
        db,
        actor,
        "import-" + r.id.replaceAll(".", "-"),
        "import/auto",
        input,
        () => resolve(db, bucket, actor, key, input, true),
      );
    } catch (e) {
      if (!(e instanceof Problem)) throw e;
      await db
        .prepare(
          "UPDATE sources SET issues=? WHERE id=? AND state='pending' AND issues='[]'",
        )
        .bind(JSON.stringify([e.message]), r.id)
        .run();
    }
  }
  return { more: rows.results.length === 12 };
}
export async function original(db: D1Database, bucket: R2Bucket, key: string) {
  const b = await getBatch(db, key),
    r = await bucket.get(b.object_key);
  if (!r) throw new Problem(404, "原文件不可用");
  return new Response(r.body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename*=UTF-8''" + encodeURIComponent(b.name),
      "Cache-Control": "private, no-store",
    },
  });
}
