import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import ExcelJS from "exceljs";
import { Miniflare } from "miniflare";

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
const origin = "http://127.0.0.1",
  pass = randomBytes(20).toString("hex");
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
  const res = await mf.dispatchFetch(origin + "/api/" + path, {
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
  const db = await mf.getD1Database("DB");
  const migrations = (await readdir("drizzle"))
    .filter((s) => /\.sql$/.test(s))
    .sort();
  for (const file of migrations) {
    const sql = await readFile("drizzle/" + file, "utf8");
    for (const stmt of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(stmt).run();
  }
  await call("workspace", "GET", undefined, { status: 401 });
  await call("exports", "POST", { scope: "full" }, { status: 401 });
  await call("imports/example/original", "GET", undefined, { status: 401 });
  await call("auth/sign-up/email", "POST", {}, { status: 404 });
  const { ticket } = await call("setup/ticket", "POST", {});
  await call("setup/complete", "POST", {
    ticket,
    name: "验收管理员",
    username: "qa.owner",
    password: pass,
  });
  await call("setup/ticket", "POST", {}, { status: 403 });
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
  const staff = await call("admin/users", "POST", {
    username: "qa.member",
    name: "验收成员",
    password: pass,
    role: "user",
  });
  await call(
    "auth/sign-in/username",
    "POST",
    { username: "qa.member", password: pass },
    { login: true },
  );
  await call("admin/users", "GET", undefined, { status: 403 });
  const memberCookie = cookie;
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
        mf.dispatchFetch(origin + "/api/services/" + vid, {
          method: "PATCH",
          headers: {
            origin,
            cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
          body: JSON.stringify({ notes, expectedVersion: version }),
        }),
      ),
    );
  assert.deepEqual(updates.map((x) => x.status).sort(), [200, 409]);
  for (const r of updates) await r.arrayBuffer();
  assert.equal((await svc()).version, version + 1);
  await act("close", { kind: "admission" });
  await call("students/" + sid, "PATCH", {
    expectedVersion: 1,
    name: "验收新姓名",
    location: "日本",
  });
  const second = await call("students/" + sid + "/services", "POST", {
    service: { ...service, status: "当期申请" },
  });
  assert.notEqual(second.id, vid);
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
  sheet.getCell("C1").value = "签单时间";
  sheet.getCell("R1").value = "2024-04";
  sheet.getCell("S1").value = "4月";
  sheet.getCell("A2").value = "独立历史档案";
  sheet.getCell("C2").value = "2024-04";
  sheet.getCell("R2").value = "早期进度";
  sheet.getCell("A3").value = "跨表同名";
  sheet.getCell("S3").value = "缺年份";
  sheet.getRow(3).hidden = true;
  const pause = wb.addWorksheet("暂停中");
  pause.getCell("A1").value = "姓名";
  pause.getCell("A2").value = "跨表同名";
  pause.getCell("L2").value = "人员待核";
  pause.mergeCells("Q2:Q3");
  pause.getCell("Q2").value = "合并文字";
  const applying = wb.addWorksheet("出愿中（学生管理）");
  applying.getCell("A1").value = "姓名";
  applying.getCell("A2").value = "学校候选";
  applying.getCell("P2").value = "仅内诺";
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
  const batch = await call("imports", "POST", bytes, uploadOpts);
  assert.deepEqual(await call("imports", "POST", bytes, uploadOpts), batch);
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
  const confirm = await call("imports/" + batch.id + "/resolve", "POST", {
    mode: "new",
    rowId: raw.id,
  });
  assert.ok(confirm.studentId);
  const revisit = await call("imports/" + batch.id + "/review/" + raw.id);
  assert.equal(revisit.state, "linked");
  const original = await call(
    "imports/" + batch.id + "/original",
    "GET",
    undefined,
    { binary: true },
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
  const frontendFiles = await readdir("dist/client", { recursive: true }),
    workerName = frontendFiles.find((x) => /export\.worker-.*\.js$/.test(x));
  assert.ok(workerName);
  const worker = new Worker(
    `const {parentPort}=require("node:worker_threads");globalThis.self=globalThis;globalThis.postMessage=(value)=>parentPort.postMessage(value);import(${JSON.stringify(pathToFileURL(resolve("dist/client", workerName)).href)}).then(()=>parentPort.on("message",data=>self.onmessage({data})));`,
    { eval: true },
  );
  try {
    const response = await new Promise((res, rej) => {
      worker.once("message", res);
      worker.once("error", rej);
      worker.postMessage(exp);
    });
    assert.equal(response.ok, true);
    const output = new ExcelJS.Workbook();
    await output.xlsx.load(response.buffer);
    const logs = output.getWorksheet("常规进度");
    const headers = logs.getRow(1).values;
    assert.ok(
      headers.includes("2024-04") &&
        headers.includes("2025-04") &&
        headers.includes("日期待确认"),
    );
    let text = "";
    logs.eachRow((row, n) => {
      if (n > 1 && row.getCell(1).text === sid) {
        const c = row.getCell(headers.indexOf("2024-04"));
        text += c.text;
        assert.notEqual(c.type, ExcelJS.ValueType.Formula);
        assert.ok(c.text.length <= 32767);
      }
    });
    assert.ok(text.includes(long + "末尾"));
    assert.ok(output.getWorksheet("来源单元格").rowCount > 10);
    assert.ok(output.getWorksheet("历史变更").rowCount > 10);
  } finally {
    await worker.terminate();
  }
  cookie = adminCookie;
  await call("admin/users/" + staff.id, "PATCH", {
    action: "reset",
    password: pass + "new",
  });
  await call("workspace", "GET", undefined, {
    cookie: memberCookie,
    status: 401,
  });
  await call(
    "auth/sign-in/username",
    "POST",
    { username: "qa.member", password: pass + "new" },
    { login: true },
  );
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
  await mf.dispose();
}
