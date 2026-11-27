import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import ExcelJS from "exceljs";
import { Miniflare } from "miniflare";
import { mergeWorkspace } from "../lib/profile/sync.ts";
import { cleanStoredEntry, withoutRepeatedEntryDate } from "../lib/profile/entry-text.mjs";

async function createSitesRuntime() {
  const root = resolve("dist/server");
  const files = (await readdir(root, { recursive: true })).filter(
    (f) => f.endsWith(".js") && f !== "index.js",
  );
  const mf = new Miniflare({
    modulesRoot: root,
    modules: await Promise.all(
      ["index.js", ...files].map(async (f) => ({
        type: "ESModule",
        path: join(root, f),
        contents: await readFile(join(root, f), "utf8"),
      })),
    ),
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
    bindings: {
      BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
      LOCAL_SETUP: "loopback",
    },
  });
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("drizzle")).filter((s) => s.endsWith(".sql")).sort()) {
    const sql = await readFile("drizzle/" + file, "utf8");
    for (const stmt of sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
  return mf;
}
const railway = process.argv.includes("--railway");
const runtime = railway
  ? await (await import("./test-railway-runtime.mjs")).createRailwayTestRuntime()
  : await createSitesRuntime();
const clientDirectory = railway ? "dist/railway/client" : "dist/client";
const origin = "http://127.0.0.1",
  pass = randomInt(100000, 1000000).toString();
let cookie = "",
  checks = 0;
async function call(path, method = "GET", data, opts = {}) {
  const headers = {
    origin,
    "Idempotency-Key": opts.key || randomUUID(),
    cookie: opts.cookie ?? cookie,
    ...opts.headers,
  };
  if (data !== undefined && !opts.raw)
    headers["content-type"] = "application/json";
  const res = await runtime.dispatchFetch(origin + "/api/" + path, {
    method,
    headers,
    body: opts.raw
      ? data
      : data === undefined
        ? undefined
        : JSON.stringify(data),
  });
  if (opts.binary) return res;
  const value = await res.json();
  assert.equal(
    res.status,
    opts.status ?? 200,
    method + " " + path + " · " + (value.message || "unexpected response"),
  );
  checks++;
  if (opts.login)
    cookie = res.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
  return value;
}
async function run() {
  for (const label of ["09.29：", "9/29 ", "９．２９：", "2026年9月29日：", "09.29. "]) {
    assert.equal(withoutRepeatedEntryDate(label + "约在10.03跟进（程）", "2026-09-29"), "约在10.03跟进（程）");
  }
  for (const body of ["09.29至10.03放假", "09.29 至 10.03 放假", "09.29 是截止日", "2025.09.29：原文", "09.28：待确认"]) {
    assert.equal(withoutRepeatedEntryDate(body, "2026-09-29"), body);
  }
  assert.equal(withoutRepeatedEntryDate("09.29：待确认", ""), "09.29：待确认");
  assert.equal(withoutRepeatedEntryDate("09.29：待确认", "2026-09"), "09.29：待确认");
  assert.equal(withoutRepeatedEntryDate("2026年9月：约在10月", "2026-09"), "约在10月");
  assert.equal(withoutRepeatedEntryDate("09.29：", "2026-09-29"), "");
  assert.deepEqual(cleanStoredEntry({ date: "2026-09-29", body: "09.29：手动记录", author: "旧作者" }),
    { date: "2026-09-29", body: "09.29：手动记录" });
  const undated = { source: "出愿中!N3", date: "", rawDate: "年份待核" };
  const multiline = "08.05：已联系\r\n　０８２６：等9月3日回复（程）\n09.09: 约在10.01见面";
  const cleaned = cleanStoredEntry({ ...undated, body: multiline });
  assert.deepEqual(cleaned, { ...undated, body: "已联系\r\n等9月3日回复（程）\n约在10.01见面" });
  assert.strictEqual(cleanStoredEntry(cleaned), cleaned);
  for (const body of ["09.29 前递交", "09.29 至 10.03 放假", "2.5 分", "2026：年度计划", "0230：编号", "2025.02.29：日期不详"]) {
    assert.equal(cleanStoredEntry({ ...undated, body }).body, body);
  }
  assert.equal(cleanStoredEntry({ ...undated, body: "02.29：待补" }).body, "待补");
  assert.equal(cleanStoredEntry({ ...undated, source: "", body: multiline }).body, multiline);
  const setup = railway ? { headers: { "X-S-Profile-Setup": runtime.key } } : {};
  if (railway) {
    const health = await runtime.dispatchFetch(origin + "/healthz");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");
    const page = await runtime.dispatchFetch(origin + "/");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-cache");
    const html = await page.text();
    assert.match(html, /S-Profile · 学生服务管理/);
    for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      const asset = await runtime.dispatchFetch(origin + path, { headers: { "Accept-Encoding": "br" } });
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get("cache-control"), /immutable/);
      assert.equal(asset.headers.get("content-encoding"), "br");
      assert.deepEqual(Buffer.from(await asset.arrayBuffer()), await readFile(join(clientDirectory, path)));
    }
    assert.equal((await call("access")).canSetup, false);
    await call("setup/ticket", "POST", {}, { status: 403 });
    assert.equal((await call("access", "GET", undefined, setup)).canSetup, true);
  }
  await call("workspace", "GET", undefined, { status: 401 });
  assert.equal((await call("access?workspace=1")).workspace, undefined);
  await call("workspace?since=0", "GET", undefined, { status: 401 });
  await call("exports", "POST", { scope: "full" }, { status: 401 });
  await call("imports/example/original", "GET", undefined, { status: 401 });
  await call("auth/sign-up/email", "POST", {}, { status: 404 });
  const { ticket } = await call("setup/ticket", "POST", {}, setup);
  const owner = {
    ticket,
    name: "验收管理员",
    username: "qa.owner",
    password: pass,
  };
  const tooShort = pass.slice(1);
  await call("setup/complete", "POST", { ...owner, password: tooShort }, { ...setup, status: 422 });
  await call("setup/complete", "POST", owner, setup);
  await call("setup/ticket", "POST", {}, { ...setup, status: 403 });
  await call(
    "auth/sign-in/username",
    "POST",
    { username: "qa.owner", password: pass },
    { login: true },
  );
  assert.ok(cookie);
  const adminCookie = cookie;
  let w = await call("workspace");
  assert.equal(w.catalogs.length, 34);
  const cat = (kind, n = 0) => w.catalogs.filter((c) => c.kind === kind)[n].id;
  const memberAccount = {
    username: "qa.member",
    name: "验收成员",
    password: pass,
    role: "user",
  };
  for (const password of [tooShort, "x".repeat(129)]) {
    await call("admin/users", "POST", { ...memberAccount, password }, { status: 422 });
  }
  const staff = await call("admin/users", "POST", memberAccount);
  await call(
    "auth/sign-in/username",
    "POST",
    { username: "qa.member", password: pass },
    { login: true },
  );
  await call("admin/users", "GET", undefined, { status: 403 });
  const memberCookie = cookie;
  const sessionWorkspace = await call("access?workspace=1");
  assert.equal(sessionWorkspace.user.id, staff.id);
  const initial = sessionWorkspace.workspace;
  assert.equal(initial.full, true);
  assert.equal(initial.data.catalogs.length, 34);
  const syncHeaders = (cursor) => ({ "X-Workspace-Since": String(cursor) });
  await call("workspace?since=-1", "GET", undefined, { status: 422 });
  assert.equal((await call("workspace?since=9007199254740991")).full, true);
  const student = {
    name: "验收⭐️ 学生",
    orderMonth: "2025-11",
    manager: cat("manager"),
    location: "中国",
    declaration: "暂无语言成绩",
  };
  const service = {
    channel: cat("channel"),
    teacher: cat("teacher"),
    projects: [cat("project"), cat("project", 1)],
    major: "信息工程",
    original: ["2027-04", "2027-10"],
    status: "未开始",
    collection: "收集中",
    production: "制作中",
    progress: "研究计划",
    risk: "暂无风险",
    publication: "未发布",
  };
  const key = randomUUID(),
    payload = { student, service };
  const created = await call("services", "POST", payload, { key });
  assert.deepEqual(await call("services", "POST", payload, { key }), created);
  const replay = await call("services", "POST", payload, { key, headers: syncHeaders(initial.cursor) });
  assert.equal(replay.workspace.full, false);
  assert.equal(replay.workspace.data.students[0].id, created.studentId);
  assert.equal(replay.workspace.data.services[0].id, created.serviceId);
  await call("services", "POST", { ...payload, reason: "变更请求" }, { key, status: 409 });
  const sid = created.studentId,
    vid = created.id;
  await call(
    "students",
    "POST",
    { ...student, name: "验收学生" },
    { status: 409 },
  );
  const svc = () => call("services/" + vid),
    act = async (action, data = {}, status = 200) =>
      call(
        "services/" + vid + "/actions/" + action,
        "POST",
        { expectedVersion: (await svc()).version, ...data },
        { status },
      );
  await call(
    "services/" + vid,
    "PATCH",
    { expectedVersion: 1, progress: "发邮件中" },
    { status: 422 },
  );
  const editService = async (fields, status = 200) =>
    call("services/" + vid, "PATCH", { expectedVersion: (await svc()).version, ...fields }, { status });
  assert.deepEqual((await svc()).targets, service.original);
  await editService({ targets: ["2027-10"] });
  assert.equal((await svc()).status, "未开始");
  await editService({ status: "当期申请" });
  assert.deepEqual((await svc()).targets, ["2027-10"]);
  await editService({ targets: ["2028-10", "2028-04"] });
  await editService({ notes: "已核对目标" });
  const editedService = await svc();
  assert.equal(editedService.status, "当期申请");
  assert.deepEqual(editedService.targets, ["2028-04", "2028-10"]);
  assert.deepEqual(editedService.original, service.original);
  await editService({ targets: ["2028-06"] }, 422);
  await editService({ original: ["2028-04"] }, 422);
  assert.equal((await svc()).version, editedService.version);
  await act("close", { kind: "admission" }, 422);
  await act("pause", { reason: "等待补件" });
  await act("resume", { status: "延期", targets: ["2027-04"] }, 422);
  await act("resume", {
    phase: "applying",
    status: "延期",
    targets: ["2028-04"],
  });
  assert.equal((await svc()).phase, "applying");
  await act("return");
  await act("apply");
  await act("pause", {}, 422);
  const S = await call("catalogs/school", "POST", {
    name: "合成大学",
    aliases: ["合大"],
  });
  const add = async (name) =>
    call("services/" + vid + "/applications", "POST", {
      expectedVersion: (await svc()).version,
      school: S.id,
      project: cat("project"),
      program: name,
      intake: "2027-04",
      admitted: true,
      received: "2025-11-12",
      final: true,
      needsOffer: true,
      offer: "2025-06",
    });
  const a1 = await add("研究科甲"),
    a2 = await add("研究科乙");
  await call(
    "applications/" + a1.id,
    "PATCH",
    { expectedVersion: 1, serviceVersion: (await svc()).version, offer: "" },
    { status: 422 },
  );
  const before = await svc();
  await call("services/" + vid + "/rewards/teacher", "PUT", {
    recipient: before.teacher,
    month: "",
    expectedVersion: before.version,
  });
  await call("services/" + vid, "PATCH", {
    expectedVersion: (await svc()).version,
    teacher: cat("teacher", 1),
  });
  assert.equal((await svc()).rewards.teacher.recipient, before.teacher);
  const version = (await svc()).version,
    updates = await Promise.all(
      ["甲", "乙"].map((notes) =>
        runtime.dispatchFetch(origin + "/api/services/" + vid, {
          method: "PATCH",
          headers: {
            origin,
            cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
            ...syncHeaders(replay.workspace.cursor),
          },
          body: JSON.stringify({ notes, expectedVersion: version }),
        }),
      ),
    );
  assert.deepEqual(updates.map((x) => x.status).sort(), [200, 409]);
  const saved = await updates.find((r) => r.ok).json();
  await updates.find((r) => !r.ok).arrayBuffer();
  assert.equal(saved.workspace.data.services.length, 1);
  assert.equal(saved.workspace.data.services[0].version, version + 1);
  assert.equal(saved.workspace.data.applications.length, 2);
  const unchanged = await call("workspace?since=" + saved.workspace.cursor);
  assert.equal(unchanged.full, false);
  assert.ok(Object.values(unchanged.data).every((records) => records.length === 0));
  assert.equal((await svc()).version, version + 1);
  await act("close", { kind: "admission" });
  await editService({ targets: ["2029-04"] });
  assert.deepEqual((await svc()).closures.at(-1).targets, ["2028-04"]);
  await call("students/" + sid, "PATCH", {
    expectedVersion: 1,
    name: "验收新姓名",
    location: "日本",
  });
  const second = await call("students/" + sid + "/services", "POST", {
    service: { ...service, status: "当期申请", targets: ["2027-10"] },
  });
  assert.notEqual(second.id, vid);
  assert.deepEqual((await call("services/" + second.id)).targets, ["2027-10"]);
  await act("reopen");
  assert.equal((await svc()).phase, "applying");
  assert.equal((await call("students/" + sid)).name, "验收新姓名");
  await act(
    "close",
    { kind: "refund", note: "退款完成", confirmed: false },
    422,
  );
  await act("close", { kind: "refund", note: "已全部退清", confirmed: true });
  await act("reopen");
  await act("close", { kind: "abandoned", confirmed: true });
  await act("reopen");
  await act("close", { kind: "closed_other", note: "全部交付" });
  await act("reopen");
  await act("return");
  await act("pause");
  await act("close", { kind: "closed_other" });
  await act("reopen");
  assert.equal((await svc()).status, "暂停中");
  await act("resume", { status: "当期申请" });
  assert.deepEqual((await svc()).targets, ["2029-04"]);
  const long = "=原样公式文本 " + "文字🌿".repeat(10000) + "\n".repeat(280);
  const first = await call("students/" + sid + "/entries", "POST", {
    kind: "progress",
    date: "2024-04-15",
    body: long + "末尾",
  });
  await call("students/" + sid + "/entries", "POST", {
    kind: "progress",
    date: "2025-04-15",
    body: "年度记录",
  });
  const log = await call("students/" + sid + "/entries", "POST", {
    kind: "application",
    date: "2025-04-16",
    body: "原文待核",
  });
  await call("entries/" + log.id, "PATCH", {
    expectedVersion: 1,
    body: "现文",
  });
  await call("entries/" + log.id + "/void", "POST", { expectedVersion: 2 });
  assert.ok(
    (await call("history/students/" + sid)).some((r) =>
      r.before?.includes("原文待核"),
    ),
  );
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("进行中");
  sheet.getCell("A1").value = "学生姓名";
  sheet.dataValidations.add("Q2:Q1048576", {
    type: "list",
    allowBlank: true,
    formulae: ['"选项一,选项二"'],
  });
  sheet.getCell("C1").value = "签单时间";
  sheet.getCell("R1").value = "2024-04";
  sheet.getCell("S1").value = "4月";
  sheet.getCell("A2").value = "独立历史档案";
  sheet.getCell("C2").value = "2024-04";
  sheet.getCell("R2").value = "04.15：早期进度（程）\n第二行补充\n04.16: 5月底前补材料";
  sheet.getCell("A3").value = "跨表同名";
  sheet.getCell("S3").value = "04.18：缺年份\n04.19：仍待确认";
  sheet.getCell("R3").value = "05.18：与列头月份冲突";
  sheet.getRow(3).hidden = true;
  const pause = wb.addWorksheet("暂停中");
  pause.getCell("A1").value = "姓名";
  pause.getCell("A2").value = "跨表同名";
  pause.getCell("L2").value = "人员待核";
  pause.mergeCells("Q2:Q3");
  pause.getCell("Q2").value = "合并文字";
  pause.mergeCells("M2:N2");
  const applying = wb.addWorksheet("出愿中（学生管理）");
  applying.getCell("A1").value = "姓名";
  applying.getCell("A2").value = "学校候选";
  applying.getCell("P2").value = "仅内诺";
  applying.getCell("A3").value = "出愿跟进示例";
  applying.getCell("N3").value = "2026.09.29：10.03前交材料";
  const finished = wb.addWorksheet("已完成");
  finished.state = "hidden";
  finished.getCell("C1").value = "学生姓名";
  finished.getCell("C2").value = "旧结案";
  finished.getCell("L2").value = "已结单";
  finished.getCell("A2").value = "2023年4月";
  const bytes = await wb.xlsx.writeBuffer(),
    uploadOpts = {
      raw: true,
      headers: { "x-file-name": encodeURIComponent("合成验收.xlsx") },
    };
  await call("imports", "GET", undefined, { status: 403 });
  await call("imports", "POST", bytes, { ...uploadOpts, status: 403 });
  cookie = adminCookie;
  const batch = await call("imports", "POST", bytes, uploadOpts);
  assert.deepEqual(await call("imports", "POST", bytes, uploadOpts), batch);
  assert.ok((await call("imports")).some((b) => b.id === batch.id));
  await call("imports/" + batch.id + "/prepare", "POST", {});
  await call("imports/" + batch.id + "/advance", "POST", {});
  const pending = await call("imports/" + batch.id + "/review"),
    linked = await call("imports/" + batch.id + "/review?state=linked");
  assert.ok(linked.rows.some((r) => r.name === "独立历史档案"));
  assert.ok(pending.rows.filter((r) => r.name === "跨表同名").length === 2);
  const raw = await call(
    "imports/" +
      batch.id +
      "/review/" +
      pending.rows.find((r) => r.name === "跨表同名" && r.sheet === "进行中")
        .id,
  );
  assert.ok(raw.raw.hidden);
  assert.equal(raw.proposal.entries[0].precision, "unknown");
  assert.deepEqual(raw.proposal.entries.map(({ date, body }) => [date, body]),
    [["", "05.18：与列头月份冲突"], ["", "04.18：缺年份\n04.19：仍待确认"]]);
  const confirm = await call("imports/" + batch.id + "/resolve", "POST", {
    mode: "new",
    rowId: raw.id,
  });
  assert.ok(confirm.studentId);
  const revisit = await call("imports/" + batch.id + "/review/" + raw.id);
  assert.equal(revisit.state, "linked");

  cookie = memberCookie;
  for (const action of ["review", "review/" + raw.id, "original"]) {
    await call("imports/" + batch.id + "/" + action, "GET", undefined, { status: 403 });
  }
  for (const action of ["prepare", "advance", "resolve"]) {
    await call("imports/" + batch.id + "/" + action, "POST", {}, { status: 403 });
  }
  const catalogSnapshot = (await call("workspace")).catalogs;
  const deletedItems = [
    service.channel, before.teacher, student.manager, service.projects[0], S.id,
  ].map((id) => catalogSnapshot.find((c) => c.id === id));
  await call("catalogs/teacher/" + S.id, "DELETE", { expectedVersion: 1 }, { status: 404 });
  await call("catalogs/school", "DELETE", {}, { status: 404 });
  await call("catalogs/school/" + S.id, "DELETE", { expectedVersion: 0 }, { status: 409 });
  await call("catalogs/school/" + S.id, "DELETE", { expectedVersion: 1 }, { cookie: "", status: 401 });
  for (const item of deletedItems) {
    const path = "catalogs/" + item.kind, removeKey = randomUUID();
    const remove = () => call(path + "/" + item.id, "DELETE",
      { expectedVersion: item.version }, { key: removeKey });
    assert.deepEqual(await remove(), { id: item.id });
    assert.deepEqual(await remove(), { id: item.id });
    assert.ok(!(await call(path)).some((c) => c.id === item.id));
    await call(path + "/" + item.id, "GET", undefined, { status: 404 });
    const history = await call("history/catalogs/" + item.id);
    assert.equal(history.filter((r) => JSON.parse(r.after).deleted).length, 1);
  }
  await call("catalogs/school/" + S.id, "PATCH", { active: true, expectedVersion: 2 }, { status: 404 });
  const replacement = await call("catalogs/school", "POST", { name: "合成大学", aliases: ["合大"] });
  assert.notEqual(replacement.id, S.id);
  await call("services/" + vid + "/applications", "POST", {
    expectedVersion: (await svc()).version, school: S.id, project: service.projects[1],
  }, { status: 422 });
  await call("applications/" + a1.id, "PATCH", {
    expectedVersion: 1, serviceVersion: (await svc()).version, program: "保留历史校名",
  });
  assert.equal((await svc()).rewards.teacher.recipient, before.teacher);

  const remaining = pending.rows.find((r) => r.name === "跨表同名" && r.sheet === "暂停中");
  const liveProject = catalogSnapshot.find((c) => c.id === service.projects[1]);
  const imported = await call("imports/" + batch.id + "/resolve", "POST", {
    rowId: remaining.id,
    mode: "existing",
    studentId: confirm.studentId,
    proposal: { schools: [{ name: "合大", project: liveProject.name, submitted: true }] },
  }, { cookie: adminCookie });
  assert.equal((await call("services/" + imported.serviceId + "/applications"))[0].school, replacement.id);
  const later = await call("workspace?since=" + replay.workspace.cursor);
  const merged = mergeWorkspace(mergeWorkspace(initial.data, replay.workspace), later);
  const current = await call("workspace");
  const april = current.entries.filter((e) => e.source.startsWith("进行中!R2 ")).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(april.map(({ date, body }) => [date, body]),
    [["2024-04-15", "早期进度（程）\n第二行补充"], ["2024-04-16", "5月底前补材料"]]);
  const yearMissing = current.entries.find((e) => e.source.startsWith("进行中!S3 "));
  assert.equal(yearMissing.date, "");
  assert.equal(yearMissing.rawDate, "4月");
  assert.equal(yearMissing.body, "缺年份\n仍待确认");
  assert.ok(current.entries.some((e) => e.kind === "application" && e.date === "2026-09-29" && e.body === "10.03前交材料"));
  assert.ok(current.entries.every((e) => !Object.hasOwn(e, "author")));
  for (const table of Object.keys(current)) {
    const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(merged[table]), byId(current[table]), "synchronized " + table);
  }
  assert.deepEqual(mergeWorkspace(merged, replay.workspace), merged, "overlapping changes cannot roll back data");
  if (railway) {
    for (const [entry, originalBody] of [[yearMissing, sheet.getCell("S3").text], [april[0], "04.15：" + april[0].body]]) {
      const seq = await runtime.restartWithLegacyEntry(entry.id, originalBody);
      const delta = await call("workspace?since=" + (seq - 1));
      assert.equal(delta.full, false);
      assert.deepEqual(delta.data.entries.find((e) => e.id === entry.id), entry);
    }
  }
  const original = await call(
    "imports/" + batch.id + "/original",
    "GET",
    undefined,
    { binary: true, cookie: adminCookie },
  );
  assert.deepEqual(
    Buffer.from(await original.arrayBuffer()),
    Buffer.from(bytes),
  );
  const exp = await call("exports", "POST", { scope: "full" });
  assert.equal(exp.entries.filter((e) => e.id === first.id).length, 1);
  assert.ok(!("users" in exp));
  assert.equal(exp.imports.length, 1);
  const filtered = await call("exports", "POST", {
    scope: "filtered",
    filters: { phase: "progress", q: "年度记录" },
  });
  assert.equal(filtered.services.length, 2);
  const frontendFiles = await readdir(clientDirectory, { recursive: true }),
    workerName = frontendFiles.find((x) => /export\.worker-.*\.js$/.test(x));
  assert.ok(workerName);
  const worker = new Worker(
    `const {parentPort}=require("node:worker_threads");globalThis.self=globalThis;globalThis.postMessage=(value)=>parentPort.postMessage(value);import(${JSON.stringify(pathToFileURL(resolve(clientDirectory, workerName)).href)}).then(()=>parentPort.on("message",data=>self.onmessage({data})));`,
    { eval: true },
  );
  try {
    async function renderReport(data) {
      const response = await new Promise((res, rej) => {
        worker.once("error", rej);
        worker.once("message", (result) => {
          worker.off("error", rej);
          res(result);
        });
        worker.postMessage(data);
      });
      assert.equal(response.ok, true);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(response.buffer);
      for (const sheet of book.worksheets) {
        assert.ok(!sheet.getRow(1).values.includes("学生编号"));
        sheet.eachRow((row) => row.eachCell((cell) => {
          assert.doesNotMatch(cell.text, /ST-[0-9a-f]{8}-[0-9a-f-]{27}/i);
        }));
      }
      return book;
    }
    const output = await renderReport(exp);
    const filteredReport = await renderReport(filtered);
    assert.equal(filteredReport.getWorksheet("当前筛选").getCell("B2").text, "验收新姓名");
    const roster = output.getWorksheet("业务名册").getSheetValues();
    assert.ok(deletedItems.every((item) => !roster.some((r) => r?.[1] === item.id)));
    assert.ok(roster.some((r) => r?.[1] === replacement.id));
    const schoolRow = output.getWorksheet("学校申请").getSheetValues().find((r) => r?.[1] === a1.id);
    assert.equal(schoolRow[3], "合成大学");
    assert.equal(schoolRow[4], deletedItems.find((c) => c.kind === "project").name);
    const logs = output.getWorksheet("常规进度");
    const headers = logs.getRow(1).values;
    assert.ok(
      headers.includes("2024-04") &&
        headers.includes("2025-04") &&
        headers.includes("日期待确认"),
    );
    let text = "";
    logs.eachRow((row, n) => {
      if (n > 1 && row.getCell(1).text === "验收新姓名") {
        const c = row.getCell(headers.indexOf("2024-04"));
        text += c.text;
        assert.notEqual(c.type, ExcelJS.ValueType.Formula);
        assert.ok(c.text.length <= 32767);
      }
    });
    assert.ok(text.includes(long + "末尾"));
    const details = output.getWorksheet("记录明细");
    const columns = details.getRow(1).values;
    assert.ok(!columns.includes("原录入人"));
    const detail = details.getSheetValues().find((r) => r?.[1] === april[0].id);
    assert.equal(detail[columns.indexOf("学生姓名")], "独立历史档案");
    assert.equal(detail[columns.indexOf("正文")], april[0].body);
    assert.equal(detail[columns.indexOf("业务日期")], april[0].date);
    assert.equal(detail[columns.indexOf("来源")], april[0].source);
    const pendingDetail = details.getSheetValues().find((r) => r?.[1] === yearMissing.id);
    assert.equal(pendingDetail[columns.indexOf("正文")], yearMissing.body);
    const monthly = logs.getSheetValues().find((r) => r?.[1] === "独立历史档案")[headers.indexOf("2024-04")];
    assert.match(monthly, /2024-04-15  早期进度（程）/u);
    assert.doesNotMatch(monthly, /作者未知|04\.15：/u);
    assert.ok(output.getWorksheet("来源单元格").rowCount > 10);
    assert.ok(output.getWorksheet("历史变更").rowCount > 10);
  } finally {
    await worker.terminate();
  }
  const oldChannel = deletedItems.find((c) => c.kind === "channel");
  const deletedNameBook = new ExcelJS.Workbook();
  deletedNameBook.addWorksheet("进行中").addRows([
    ["学生姓名", "甲方"], ["验收旧渠道", oldChannel.name],
  ]);
  cookie = adminCookie;
  const checkBatch = await call("imports", "POST", await deletedNameBook.xlsx.writeBuffer(), uploadOpts);
  const checkPath = "imports/" + checkBatch.id;
  await call(checkPath + "/prepare", "POST", {});
  await call(checkPath + "/advance", "POST", {});
  const unresolved = await call(checkPath + "/review");
  assert.ok(unresolved.rows[0].issues.some((issue) => issue.includes(oldChannel.name) && issue.includes("删除")));
  assert.ok(!(await call("catalogs/channel")).some((c) => c.name === oldChannel.name));
  const resetPassword = "r" + tooShort;
  await call("admin/users/" + staff.id, "PATCH", { action: "reset", password: tooShort }, { status: 422 });
  await call("admin/users/" + staff.id, "PATCH", {
    action: "reset",
    password: resetPassword,
  });
  await call("workspace", "GET", undefined, {
    cookie: memberCookie,
    status: 401,
  });
  await call(
    "auth/sign-in/username",
    "POST",
    { username: "qa.member", password: resetPassword },
    { login: true },
  );
  const newPassword = "s" + tooShort;
  await call("auth/change-password", "POST", { currentPassword: resetPassword, newPassword: tooShort }, { status: 400 });
  await call("auth/change-password", "POST", { currentPassword: resetPassword, newPassword }, { login: true });
  assert.equal((await call("access")).user.id, staff.id);
  const renewed = cookie;
  cookie = adminCookie;
  await call("admin/users/" + staff.id, "PATCH", { action: "disable" });
  await call("workspace", "GET", undefined, { cookie: renewed, status: 401 });
  await call(
    "exports",
    "POST",
    { scope: "full" },
    { headers: { origin: "https://unrelated.invalid" }, status: 403 },
  );
  console.log(
    "S-Profile passed " +
      checks +
      " HTTP checks, transactional concurrency checks and Excel round-trip assertions.",
  );
}
try {
  await run();
} finally {
  await runtime.dispose();
}
