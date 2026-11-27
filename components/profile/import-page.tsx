"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import {
  choices,
  closureKinds,
  entryKinds,
  labels,
  phases,
  timeLabel,
} from "../../lib/profile/model";
import type { Batch, Source } from "../../lib/profile/excel-model";
import {
  Empty,
  ErrorBox,
  Field,
  FormShell,
  request,
  Select,
  Text,
  useSite,
  useValues,
  type Values,
} from "./ui";
import { PageHead, PageNav } from "./workbench";
const states: Record<string, string> = {
  pending: "待核对",
  linked: "已关联",
  source: "保留来源",
  all: "全部",
};
function Resolve({
  batch,
  rowId,
  done,
}: {
  batch: string;
  rowId: string;
  done: () => void;
}) {
  const [row, setRow] = useState<Source | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    request<Source>("imports/" + batch + "/review/" + rowId)
      .then(setRow)
      .catch((e) => setError(e.message));
  }, [batch, rowId]);
  return row ? (
    <ResolveForm row={row} done={done} />
  ) : (
    <div className="dialog-body">
      <ErrorBox message={error} />
      {!error && "正在读取来源…"}
    </div>
  );
}
function ResolveForm({ row, done }: { row: Source; done: () => void }) {
  const { w } = useSite(),
    matches = w.students.filter(
      (s) => s.name.replace(/[*＊★☆⭐🌟\s\uFE0F]/g, "") === row.identity,
    );
  const b = useValues({
      mode: "",
      studentId: "",
      serviceId: "",
      phase: row.phase,
      note: "",
      fillMissing: false,
    }),
    p = useValues({
      ...row.proposal,
      original: row.proposal.original.join("、"),
      targets: row.proposal.targets.join("、"),
      projects: row.proposal.projects.join("、"),
    }),
    locked = row.state !== "pending";
  const split = (s: string) =>
    s
      .split(/[、，,；;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const selected = w.services.find((s) => s.id === b.v.serviceId);
  const raw = (
    <div className="raw-values">
      {row.raw.cells.map((c) => (
        <details key={c.a}>
          <summary>
            <b>{c.a}</b>
            <span>{c.text || "（空）"}</span>
          </summary>
          <div>
            <small>
              数字格式 {c.format || "常规"}
              {c.master ? " · 合并主格 " + c.master : ""}
              {c.hidden ? " · 隐藏列" : ""}
            </small>
            <pre>{JSON.stringify({ raw: c.raw, style: c.style }, null, 2)}</pre>
          </div>
        </details>
      ))}
    </div>
  );
  const adjust = (
    k: "entries" | "schools",
    i: number,
    field: string,
    value: unknown,
  ) =>
    p.set(
      k,
      p.v[k].map((x: Values, j: number) =>
        j === i ? { ...x, [field]: value } : x,
      ),
    );
  if (locked)
    return (
      <div className="dialog-body">
        <p>
          {row.sheet} · 第 {row.row} 行 · {states[row.state]}{" "}
          {row.reviewer && " · " + row.reviewer}
        </p>
        {raw}
      </div>
    );
  return (
    <FormShell
      sources={
        selected
          ? [
              {
                path: "services/" + selected.id,
                row: selected,
                key: "serviceVersion",
              },
            ]
          : []
      }
      after={done}
      submit="确认处理"
      save={(vs, key, write) =>
        write(
          "imports/" + row.batch_id + "/resolve",
          "POST",
          {
            ...b.v,
            rowId: row.id,
            studentId: b.v.mode === "new" ? "" : b.v.studentId,
            serviceId: b.v.mode === "link" ? b.v.serviceId : "",
            serviceVersion: selected?.version,
            proposal: {
              ...p.v,
              projects: split(p.v.projects),
              original: split(p.v.original),
              targets: split(p.v.targets),
            },
            ...vs,
          },
          key,
        )
      }
    >
      <div className="review-heading">
        <strong>
          {row.sheet} · 第 {row.row} 行
        </strong>
        <small>
          {row.raw.hidden ? "隐藏行" : "原表行"} ·{" "}
          {row.issues.join("；") || "可直接核对"}
        </small>
      </div>
      <div className="review-columns">
        <div>
          <h3>原始单元格</h3>
          {raw}
        </div>
        <div className="form-stack">
          <h3>整理与归属</h3>
          <Select
            b={b}
            k="mode"
            title="处理方式"
            required
            items={[
              ["new", "新建学生及服务"],
              ["existing", "为已有学生建立另一份服务"],
              ["link", "关联已有学生及服务"],
              ["source", "仅保留原始来源"],
            ]}
          />
          {b.v.mode && b.v.mode !== "source" && (
            <>
              <Select b={b} k="phase" items={Object.entries(phases)} required />
              {b.v.mode !== "new" && (
                <Select
                  b={b}
                  k="studentId"
                  title="学生档案"
                  required
                  items={[
                    ...matches,
                    ...w.students.filter((s) => !matches.includes(s)),
                  ].map((s) => [
                    s.id,
                    s.name + (matches.includes(s) ? " · 同名候选" : ""),
                  ])}
                />
              )}
              {b.v.mode === "link" && (
                <>
                  <Select
                    b={b}
                    k="serviceId"
                    title="服务归属"
                    required
                    items={w.services
                      .filter((s) => s.studentId === b.v.studentId)
                      .map((s) => [
                        s.id,
                        phases[s.phase] + " · " + (s.major || s.id),
                      ])}
                  />
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={b.v.fillMissing}
                      onChange={(e) => b.set("fillMissing", e.target.checked)}
                    />
                    将已核对字段补入空缺资料
                  </label>
                </>
              )}
              <details open>
                <summary>学生及服务字段</summary>
                <div className="form-stack nested">
                  {[
                    "name",
                    "orderMonth",
                    "location",
                    "manager",
                    "declaration",
                    "jlpt",
                    "toefl",
                    "ielts",
                    "toeic",
                    "channel",
                    "teacher",
                    "projects",
                    "major",
                    "original",
                    "targets",
                    "status",
                    "collection",
                    "production",
                    "progress",
                    "risk",
                    "publication",
                    "special",
                    "notes",
                    "pauseReason",
                  ].map((k) =>
                    Object.hasOwn(choices, k) ? (
                      <Select
                        key={k}
                        b={p}
                        k={k}
                        items={[
                          ...choices[k as keyof typeof choices],
                          ...(k === "status" && b.v.phase === "paused"
                            ? ["暂停中"]
                            : []),
                        ]}
                        placeholder="历史待补"
                      />
                    ) : (
                      <Text
                        key={k}
                        b={p}
                        k={k}
                        title={labels[k] || "暂停原因"}
                        type={
                          k === "orderMonth"
                            ? "month"
                            : k === "special" || k === "notes"
                              ? "area"
                              : "text"
                        }
                        hint={
                          ["original", "targets", "projects"].includes(k)
                            ? "多项用顿号分隔"
                            : undefined
                        }
                      />
                    ),
                  )}
                </div>
              </details>
              {b.v.phase === "completed" && (
                <>
                  <Select
                    b={p}
                    k="closureKind"
                    title="完成情况"
                    required={b.v.mode !== "link"}
                    items={Object.entries(closureKinds)}
                  />
                  <Text b={p} k="closureNote" title="原结案说明" type="area" />
                </>
              )}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  p.set("schools", [
                    ...p.v.schools,
                    {
                      name: "",
                      project: "",
                      program: "",
                      intake: "",
                      workMonth: "",
                      deadline: "",
                      received: "",
                      offer: "",
                      submitted: false,
                      admitted: false,
                      final: false,
                      needsOffer: false,
                    },
                  ])
                }
              >
                从原文补充学校候选
              </button>
              {p.v.schools.map((s: Values, i: number) => (
                <details key={i} open>
                  <summary>学校候选 · {s.name}</summary>
                  <div className="nested form-stack">
                    {[
                      ["submitted", "确认已实际递交"],
                      ["admitted", "正式合格"],
                      ["final", "最终选择"],
                      ["needsOffer", "此项目需要内诺"],
                    ].map(([k, t]) => (
                      <label className="checkbox-line" key={k}>
                        <input
                          type="checkbox"
                          checked={s[k]}
                          onChange={(e) =>
                            adjust("schools", i, k, e.target.checked)
                          }
                        />
                        {t}
                      </label>
                    ))}
                    {[
                      "name",
                      "project",
                      "program",
                      "intake",
                      "workMonth",
                      "deadline",
                      "received",
                      "offer",
                    ].map((k) => (
                      <Field
                        label={k === "name" ? "学校名称" : labels[k]}
                        key={k}
                      >
                        <input
                          type={
                            ["intake", "workMonth", "offer"].includes(k)
                              ? "month"
                              : ["deadline", "received"].includes(k)
                                ? "date"
                                : "text"
                          }
                          value={s[k]}
                          onChange={(e) =>
                            adjust("schools", i, k, e.target.value)
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </details>
              ))}
              <button
                className="btn"
                type="button"
                onClick={() =>
                  p.set("entries", [
                    ...p.v.entries,
                    {
                      kind: "progress",
                      body: "",
                      date: "",
                      rawDate: "",
                      cell: "第 " + row.row + " 行",
                      precision: "unknown",
                    },
                  ])
                }
              >
                从原文整理跟进记录
              </button>
              {p.v.entries.map((e: Values, i: number) => (
                <details key={i}>
                  <summary>
                    {entryKinds[e.kind as keyof typeof entryKinds]} · {e.cell}
                  </summary>
                  <div className="nested form-stack">
                    <Field label="记录分类">
                      <select
                        value={e.kind}
                        onChange={(v) =>
                          adjust("entries", i, "kind", v.target.value)
                        }
                      >
                        {Object.entries(entryKinds).map(([k, n]) => (
                          <option key={k} value={k}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="日期或年月（未知可空）">
                      <input
                        value={e.date}
                        onChange={(v) =>
                          adjust("entries", i, "date", v.target.value)
                        }
                      />
                    </Field>
                    <Field label="记录正文">
                      <textarea
                        value={e.body}
                        onChange={(v) =>
                          adjust("entries", i, "body", v.target.value)
                        }
                      />
                    </Field>
                  </div>
                </details>
              ))}
              {b.v.phase === "completed" &&
                (["teacher", "manager"] as const).map((role) => {
                  const r = p.v.rewards?.[role] || { name: "", month: "" };
                  return (
                    <details key={role}>
                      <summary>
                        {role === "teacher" ? "教务" : "学管"}奖励归属
                      </summary>
                      <div className="nested form-stack">
                        {(["name", "month"] as const).map((k) => (
                          <Field
                            key={k}
                            label={k === "name" ? "历史归属人" : "计入工资年月"}
                          >
                            <input
                              type={k === "month" ? "month" : "text"}
                              value={r[k]}
                              onChange={(e) =>
                                p.set("rewards", {
                                  ...p.v.rewards,
                                  [role]: { ...r, [k]: e.target.value },
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    </details>
                  );
                })}
            </>
          )}
          <Text b={b} k="note" title="核对说明（选填）" type="area" />
        </div>
      </div>
    </FormShell>
  );
}
export default function ImportPage() {
  const { open, refresh, notice } = useSite(),
    [list, setList] = useState<Batch[]>([]),
    [chosen, setChosen] = useState(""),
    [state, setState] = useState("pending"),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Values[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [rev, bump] = useState(0);
  const ref = useRef<HTMLInputElement>(null),
    batch = list.find((b) => b.id === chosen);
  useEffect(() => {
    const focus = () => bump((v) => v + 1);
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  useEffect(() => {
    let alive = true;
    request<Batch[]>("imports")
      .then((v) => {
        if (alive) {
          setList(v);
          setChosen((old) => old || v[0]?.id || "");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [rev]);
  useEffect(() => {
    if (!chosen) return;
    let live = true;
    request(
      "imports/" +
        chosen +
        "/review?state=" +
        state +
        "&offset=" +
        (page - 1) * 30,
    )
      .then((v) => {
        if (live) {
          setRows(v.rows);
          setTotal(v.total);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [chosen, page, state, rev]);
  async function process(key: string) {
    setChosen(key);
    setBusy("正在解析原表…");
    await request("imports/" + key + "/prepare", "POST", {});
    setBusy("正在整理明确资料…");
    let more = true;
    while (more) {
      const v = await request("imports/" + key + "/advance", "POST", {});
      more = v.more;
    }
    setPage(1);
    setState("pending");
    bump((r) => r + 1);
    await refresh();
    notice("原表已保存，疑点可逐行核对");
  }
  async function load(file?: File) {
    if (!file) return;
    setBusy("正在保存原工作簿…");
    setError("");
    try {
      const r = await fetch("/api/imports", {
          method: "POST",
          headers: {
            "x-file-name": encodeURIComponent(file.name),
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        }),
        v = (await r.json()) as Values;
      if (!r.ok) throw new Error(v.message || "上传失败");
      await process(v.id);
    } catch (e) {
      setError((e as Error).message);
      bump((r) => r + 1);
    } finally {
      setBusy("");
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <>
      <PageHead
        title="导入核对"
        subtitle="保存原始工作簿，逐项确认学生身份、服务归属和历史字段。"
        actions={
          <button
            className="btn primary"
            disabled={!!busy}
            onClick={() => ref.current?.click()}
          >
            <Upload size={16} />
            导入工作簿
          </button>
        }
      />
      <input
        hidden
        ref={ref}
        type="file"
        accept=".xlsx"
        onChange={(e) => void load(e.target.files?.[0])}
      />
      <ErrorBox message={error} />
      {busy && (
        <p className="context-note" role="status">
          {busy}
        </p>
      )}
      {!list.length ? (
        <section className="panel">
          <Empty
            title="暂无导入批次"
            action={
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => ref.current?.click()}
              >
                <FileSpreadsheet size={16} />
                选择 .xlsx 文件
              </button>
            }
          >
            上传包含四阶段资料的 Excel，原件、隐藏行和单元格来源将一并保留。
          </Empty>
        </section>
      ) : (
        <section className="panel">
          <div className="toolbar">
            <Field label="工作簿批次">
              <select
                value={chosen}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setPage(1);
                }}
              >
                {list.map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name} · {timeLabel(b.at)}
                  </option>
                ))}
              </select>
            </Field>
            {chosen && (
              <a
                className="btn"
                href={"/api/imports/" + chosen + "/original"}
                download
              >
                <Download size={16} />
                下载原件
              </a>
            )}
            {batch && (
              <button
                disabled={!!busy}
                className="link"
                onClick={() => {
                  setError("");
                  process(chosen)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(""));
                }}
              >
                继续整理
              </button>
            )}
          </div>
          {batch && (
            <div className="section-pad small-info">
              上传人 {batch.actor} · {batch.total} 行来源 · {batch.pending}{" "}
              行待核 · {batch.linked} 行已关联
            </div>
          )}
          <div className="tabs inset">
            {Object.entries(states).map(([k, v]) => (
              <button
                key={k}
                className={state === k ? "active" : ""}
                onClick={() => {
                  setState(k);
                  setPage(1);
                }}
              >
                {v}
              </button>
            ))}
          </div>
          {rows.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {["工作表 / 行", "学生", "识别结果", "状态", "操作"].map(
                      (k) => (
                        <th key={k}>{k}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.sheet} · {r.row}
                      </td>
                      <td>{r.name || "身份待核"}</td>
                      <td className="excerpt" title={r.issues.join("；")}>
                        {r.issues.join("；") || "来源已保存"}
                      </td>
                      <td>{states[r.state]}</td>
                      <td>
                        <button
                          className={"row-action " + (r.state === "pending" ? "edit" : "view")}
                          onClick={() =>
                            open(
                              r.state === "pending"
                                ? "核对原表资料"
                                : "查看原始来源",
                              <Resolve
                                batch={chosen}
                                rowId={r.id}
                                done={() => bump((x) => x + 1)}
                              />,
                              true,
                            )
                          }
                        >
                          {r.state === "pending" ? "核对" : "查看"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={"暂无" + (state === "all" ? "" : states[state]) + "来源行"}
            />
          )}
          <PageNav page={page} total={total} size={30} change={setPage} />
        </section>
      )}
    </>
  );
}
