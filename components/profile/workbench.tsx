"use client";
import { useState } from "react";
import exportWorkerUrl from "../../lib/profile/export.worker.ts?worker&url";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Download,
  ListFilter,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  choices,
  closureKinds,
  currentClosure,
  labelOf,
  newestEntries,
  phases,
  timeLabel,
  tokyoDay,
  type Entry,
  type Phase,
} from "../../lib/profile/model";
import {
  defaultFilters,
  serviceRows,
  type Filters,
} from "../../lib/profile/list";
import { Empty, ErrorBox, Field, request, useSite } from "./ui";
import { ServiceEditor, StudentEditor } from "./editors";
const phaseIcons = {
  progress: CirclePlay,
  paused: CirclePause,
  applying: Send,
  completed: CheckCheck,
};
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}
export function PageNav({
  page,
  total,
  size,
  change,
}: {
  page: number;
  total: number;
  size: number;
  change: (n: number) => void;
}) {
  return (
    <div className="page-nav">
      <span>
        {total
          ? (page - 1) * size +
            1 +
            "–" +
            Math.min(page * size, total) +
            " / " +
            total +
            " 条"
          : "共 0 条"}
      </span>
      <div>
        <button
          className="icon"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(total / size))}
        </span>
        <button
          className="icon"
          aria-label="下一页"
          disabled={page * size >= total}
          onClick={() => change(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function ExportDialog({ filters }: { filters: Filters }) {
  const { close, notice } = useSite(),
    [scope, setScope] = useState("filtered"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    let worker: Worker | undefined;
    try {
      const data = await request("exports", "POST", { scope, filters });
      const workerPath = new URL(exportWorkerUrl, window.location.origin)
        .pathname;
      worker = new Worker(workerPath, { type: "module" });
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker!.onmessage = (e) =>
          e.data.ok
            ? resolve(e.data.buffer)
            : reject(new Error(e.data.message));
        worker!.onerror = () => reject(new Error("Excel 导出线程未能启动"));
        worker!.postMessage(data);
      });
      const url = URL.createObjectURL(
          new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "S-Profile_" +
        (scope === "full" ? "完整资料" : phases[filters.phase]) +
        "_" +
        tokyoDay() +
        ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      close();
      notice("Excel 文件已生成");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      worker?.terminate();
      setBusy(false);
    }
  };
  return (
    <>
      <div className="dialog-body form-stack">
        {[
          [
            "filtered",
            "当前筛选列表",
            "保留当前阶段、筛选条件及服务列表信息。",
          ],
          [
            "full",
            "完整资料",
            "含四阶段服务、学生档案、学校、两类记录、历史及来源明细。",
          ],
        ].map(([id, title, desc]) => (
          <label className="radio-card" key={id}>
            <input
              type="radio"
              name="scope"
              checked={scope === id}
              onChange={() => setScope(id)}
            />
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
          </label>
        ))}
        <ErrorBox message={error} />
      </div>
      <footer className="dialog-foot">
        <button className="btn" onClick={close}>
          取消
        </button>
        <button className="btn primary" disabled={busy} onClick={run}>
          <Download size={16} />
          {busy ? "正在生成…" : "下载 Excel"}
        </button>
      </footer>
    </>
  );
}
function SearchBox({
  value,
  change,
  placeholder,
}: {
  value: string;
  change: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="input-icon search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
      {value && (
        <button
          className="eye"
          aria-label="清除搜索"
          onClick={() => change("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function Workbench({
  filters: f,
  setFilters,
}: {
  filters: Filters;
  setFilters: (v: Filters) => void;
}) {
  const { w, open, go } = useSite(),
    [more, setMore] = useState(false),
    [page, setPage] = useState(1);
  const set = (k: keyof Filters, v: string) => {
    setFilters({ ...f, [k]: v });
    setPage(1);
  };
  const rows = serviceRows(w, f),
    maxPage = Math.max(1, Math.ceil(rows.length / 18)),
    current = Math.min(page, maxPage);
  const latest = new Map<string, Entry>();
  for (const e of newestEntries(w.entries.filter((e) => !e.voided))) {
    const k = e.studentId + "|" + e.kind;
    if (!latest.has(k)) latest.set(k, e);
  }
  const cat = (v: string, blank?: string) => labelOf(w.catalogs, v, blank),
    nFilters = Object.entries(f).filter(
      ([k, v]) => !["phase", "q", "sort"].includes(k) && v,
    ).length;
  const filters: {
    k: keyof Filters;
    title: string;
    items: (string | string[])[];
  }[] = [
    ...(["teacher", "manager", "channel", "project"] as const).map((k, i) => ({
      k,
      title: ["教务", "学管", "甲方渠道", "合同项目"][i],
      items: [
        ...(["teacher", "manager"].includes(k) ? [["none", "待分配"]] : []),
        ...w.catalogs.filter((c) => c.kind === k).map((c) => [c.id, c.name]),
      ],
    })),
    { k: "status", title: "学生状况", items: [...choices.status, "暂停中"] },
    { k: "risk", title: "申请风险", items: choices.risk },
    { k: "progress", title: "申请进度", items: choices.progress },
    { k: "location", title: "所在地", items: choices.location },
    {
      k: "intake",
      title: "入学目标",
      items: [...new Set(w.services.flatMap((s) => s.targets))].sort(),
    },
    ...(f.phase === "completed"
      ? [
          {
            k: "closure" as const,
            title: "完成情况",
            items: Object.entries(closureKinds),
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHead
        title="服务工作台"
        subtitle="按服务阶段查看学生档案与最新跟进。"
        actions={
          <>
            <button
              className="btn"
              onClick={() => open("导出 Excel", <ExportDialog filters={f} />)}
            >
              <Download size={16} />
              导出
            </button>
            <button
              className="btn primary"
              onClick={() => open("新建服务", <ServiceEditor />, true)}
            >
              <Plus size={17} />
              新建服务
            </button>
          </>
        }
      />
      <div className="phase-grid">
        {(Object.keys(phases) as Phase[]).map((k) => {
          const Icon = phaseIcons[k];
          return (
            <button
              className={"phase-card " + k + (f.phase === k ? " selected" : "")}
              key={k}
              aria-pressed={f.phase === k}
              onClick={() => {
                setFilters({
                  ...f,
                  phase: k,
                  closure: k === "completed" ? f.closure : "",
                });
                setPage(1);
              }}
            >
              <span className="phase-label">{phases[k]}</span>
              <strong>{w.services.filter((s) => s.phase === k).length}</strong>
              <span className="phase-icon"><Icon size={20} /></span>
            </button>
          );
        })}
      </div>
      <section className="panel list-panel">
        <div className="list-title">
          <h2>
            {phases[f.phase]}服务 <span>{rows.length}</span>
          </h2>
        </div>
        <div className="toolbar">
          <SearchBox
            value={f.q}
            change={(v) => set("q", v)}
            placeholder="搜索学生姓名或记录正文"
          />
          <button
            className={"btn " + (more || nFilters ? "highlight" : "")}
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            <ListFilter size={16} />
            筛选{nFilters || ""}
          </button>
          <select
            className="sort"
            aria-label="服务排序"
            value={f.sort}
            onChange={(e) => set("sort", e.target.value)}
          >
            <option value="updated">最近更新</option>
            <option value="name">姓名排序</option>
            <option value="target">入学目标</option>
          </select>
        </div>
        {more && (
          <div className="filter-box">
            {filters.map(({ k, title, items }) => (
              <Field label={title} key={k}>
                <select value={f[k]} onChange={(e) => set(k, e.target.value)}>
                  <option value="">全部</option>
                  {items.map((o) => {
                    const [v, label] = typeof o === "string" ? [o, o] : o;
                    return (
                      <option value={v} key={v}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>
            ))}
            <button
              className="link"
              onClick={() => {
                setFilters({ ...defaultFilters, phase: f.phase });
                setPage(1);
              }}
            >
              清空条件
            </button>
          </div>
        )}
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table sticky services-table">
              <thead>
                <tr>
                  {[
                    "学生姓名",
                    "合同项目 / 目标",
                    "教务 / 学管",
                    f.phase === "completed" ? "完成情况" : "申请进度",
                    "最新跟进",
                    "最近更新",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice((current - 1) * 18, current * 18).map((s) => {
                  const st = w.students.find((t) => t.id === s.studentId)!,
                    c = currentClosure(s),
                    log = latest.get(
                      st.id +
                        "|" +
                        (s.phase === "applying" ? "application" : "progress"),
                    );
                  return (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="row-name"
                          onClick={() => go("service/" + s.id)}
                        >
                          {st.name}
                        </button>
                        <small>{s.major || "专业待补"}</small>
                      </td>
                      <td>
                        {s.projects.map((p) => cat(p)).join("、") || "待补"}
                        <small>{s.targets.join(" / ") || "目标待补"}</small>
                      </td>
                      <td>
                        {cat(s.teacher, "教务待分配")}
                        <small>{cat(st.manager, "学管待分配")}</small>
                      </td>
                      <td>
                        <span className="tag">
                          {s.phase === "completed" && c
                            ? closureKinds[c.kind]
                            : s.progress || "待补"}
                        </span>
                        <small>
                          {s.phase === "completed"
                            ? c?.targets.join("、")
                            : s.risk || "风险待补"}
                        </small>
                      </td>
                      <td className="excerpt" title={log?.body}>
                        {log?.body || "暂无记录"}
                      </td>
                      <td className="tabular">{timeLabel(s.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              f.q || nFilters
                ? "没有符合条件的服务"
                : "暂无" + phases[f.phase] + "服务"
            }
            action={
              f.q || nFilters ? (
                <button
                  className="btn"
                  onClick={() =>
                    setFilters({ ...defaultFilters, phase: f.phase })
                  }
                >
                  清除筛选
                </button>
              ) : f.phase === "progress" ? (
                <button
                  className="btn"
                  onClick={() => open("新建服务", <ServiceEditor />, true)}
                >
                  <Plus size={15} />
                  新建首份服务
                </button>
              ) : undefined
            }
          >
            {f.q || nFilters
              ? "调整搜索词或筛选条件后再试。"
              : f.phase === "progress"
                ? "建立学生档案与首份服务，或从已有 Excel 工作簿导入。"
                : "进入此阶段的服务会显示在这里。"}
          </Empty>
        )}
        <PageNav
          page={current}
          total={rows.length}
          size={18}
          change={setPage}
        />
      </section>
    </>
  );
}
export function Students() {
  const { w, go, open } = useSite(),
    [q, search] = useState(""),
    [page, setPage] = useState(1);
  const rows = w.students
      .filter(
        (s) =>
          s.name.includes(q) ||
          w.entries.some(
            (e) => !e.voided && e.studentId === s.id && e.body.includes(q),
          ),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    current = Math.min(page, Math.max(1, Math.ceil(rows.length / 24)));
  return (
    <>
      <PageHead
        title="学生档案"
        subtitle="查阅学生的共有资料、历次服务和两类跟进记录。"
        actions={
          <button
            className="btn primary"
            onClick={() => open("新建学生档案", <StudentEditor />)}
          >
            <Plus size={16} />
            新建档案
          </button>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <SearchBox
            value={q}
            change={(v) => {
              search(v);
              setPage(1);
            }}
            placeholder="搜索姓名或记录正文"
          />
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table sticky students-table">
              <thead>
                <tr>
                  {[
                    "学生姓名",
                    "首次签单",
                    "所在地",
                    "语言成绩",
                    "学管",
                    "服务数",
                  ].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice((current - 1) * 24, current * 24).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button
                        className="row-name"
                        onClick={() => go("student/" + s.id)}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td>{s.orderMonth || "待补"}</td>
                    <td>{s.location || "待补"}</td>
                    <td>{s.declaration || "资料待补"}</td>
                    <td>{labelOf(w.catalogs, s.manager, "学管待分配")}</td>
                    <td>
                      {w.services.filter((v) => v.studentId === s.id).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={q ? "没有匹配的学生" : "还没有学生档案"} />
        )}
        <PageNav
          page={current}
          total={rows.length}
          size={24}
          change={setPage}
        />
      </section>
    </>
  );
}
