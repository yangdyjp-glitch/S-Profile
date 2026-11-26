"use client";
import { useMemo, useState } from "react";
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
  catalogOptionLabel,
  choices,
  closureKinds,
  compareNewestEntry,
  currentClosure,
  labelOf,
  phases,
  tokyoDay,
  type Application,
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
const updateMonthDay = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
});
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
function AdmittedSchools({ admissions, nameOf }: {
  admissions?: Application[];
  nameOf: (id: string, blank: string) => string;
}) {
  if (!admissions?.length) return <span className="tag">合格学校待补</span>;
  return (
    <ul className="admitted-schools" aria-label="合格学校">
      {admissions.map((a) => (
        <li key={a.id}>
          <span className="tag positive">
            {nameOf(a.school, "学校名称待补")}
          </span>
          <small>
            {[nameOf(a.project, "项目待补"), a.program]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </li>
      ))}
    </ul>
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
  const completed = f.phase === "completed";
  const rows = useMemo(() => serviceRows(w, f), [w, f]),
    maxPage = Math.max(1, Math.ceil(rows.length / 18)),
    current = Math.min(page, maxPage);
  const latest = useMemo(() => {
    const index = new Map<string, Entry>();
    for (const entry of w.entries) {
      if (entry.voided) continue;
      const key = entry.studentId + "|" + entry.kind, previous = index.get(key);
      if (!previous || compareNewestEntry(entry, previous) < 0) index.set(key, entry);
    }
    return index;
  }, [w.entries]);
  const admissions = useMemo(() => {
    const grouped = new Map<string, Application[]>();
    for (const app of w.applications) {
      if (!app.admitted || app.voided) continue;
      const items = grouped.get(app.serviceId);
      if (items) items.push(app);
      else grouped.set(app.serviceId, [app]);
    }
    return grouped;
  }, [w.applications]);
  const students = useMemo(() => new Map(w.students.map((s) => [s.id, s])), [w.students]);
  const names = useMemo(() => new Map(w.catalogs.map((c) => [c.id, c.name])), [w.catalogs]);
  const counts = useMemo(() => {
    const result = { progress: 0, applying: 0, paused: 0, completed: 0 };
    for (const service of w.services) result[service.phase]++;
    return result;
  }, [w.services]);
  const cat = (v: string, blank = "待补") => names.get(v) || blank,
    nFilters = Object.entries(f).filter(
      ([k, v]) => !["phase", "q", "sort"].includes(k) && v,
    ).length;
  const filters: {
    k: keyof Filters;
    title: string;
    items: (string | string[])[];
  }[] = !more ? [] : [
    ...(["teacher", "manager", "channel", "project"] as const).map((k, i) => ({
      k,
      title: ["教务", "学管", "甲方渠道", "合同项目"][i],
      items: [
        ...(["teacher", "manager"].includes(k) ? [["none", "待分配"]] : []),
        ...w.catalogs
          .filter((c) => c.kind === k && (!c.deleted || c.id === f[k]))
          .map((c) => [c.id, catalogOptionLabel(c)]),
      ],
    })),
    { k: "status", title: "学生状况", items: [...choices.status, "暂停中"] },
    { k: "risk", title: "潜在风险", items: choices.risk },
    { k: "progress", title: "申请进度", items: choices.progress },
    { k: "location", title: "所在地", items: choices.location },
    {
      k: "intake",
      title: "入学目标",
      items: [...new Set(w.services.flatMap((s) => s.targets))].sort(),
    },
    ...(completed
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
      <div className="phase-grid" role="group" aria-label="服务阶段">
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
              <strong>{counts[k]}</strong>
              <span className="phase-icon"><Icon size={16} /></span>
            </button>
          );
        })}
      </div>
      <section className="panel list-panel" aria-labelledby="service-list-heading">
        <header className="workbench-toolbar">
          <h1 id="service-list-heading">
            {phases[f.phase]}服务 <span>{rows.length}</span>
          </h1>
          <SearchBox
            value={f.q}
            change={(v) => set("q", v)}
            placeholder="搜索学生姓名或记录正文"
          />
          <button
            className={"btn filter-toggle" + (more || nFilters ? " highlight" : "")}
            aria-expanded={more}
            aria-controls={more ? "service-filters" : undefined}
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
          <button
            className="btn primary create-service"
            aria-haspopup="dialog"
            onClick={() => open("新建服务", <ServiceEditor />, true)}
          >
            <Plus size={17} />
            新建服务
          </button>
        </header>
        {more && (
          <div className="filter-box" id="service-filters">
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
            <table className={"data-table sticky services-table" + (completed ? " with-closures" : "")}>
              <thead>
                <tr>
                  <th scope="col" className="name-col">姓名</th>
                  <th scope="col" className="major-col">专业</th>
                  <th scope="col" className="contract-col">合同项目 / 目标</th>
                  <th scope="col" className="staff-col">教务</th>
                  <th scope="col" className="staff-col">学管</th>
                  <th scope="col" className="progress-col">申请进度</th>
                  <th scope="col" className="risk-col">潜在风险</th>
                  {completed && <th scope="col" className="closure-col">完成情况</th>}
                  <th scope="col">最新跟进</th>
                  <th scope="col" className="updated-col" aria-label="最近更新" title="最近更新（月/日）">更新</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((current - 1) * 18, current * 18).map((s) => {
                  const st = students.get(s.studentId)!,
                    closure = completed ? currentClosure(s) : undefined,
                    log = latest.get(
                      st.id +
                        "|" +
                        (s.phase === "applying" ? "application" : "progress"),
                    );
                  const projects = s.projects.map((p) => cat(p)).join("、") || "待补";
                  const targets = s.targets.join(" / ") || "目标待补";
                  const teacher = cat(s.teacher, "待分配");
                  const manager = cat(st.manager, "待分配");
                  const updatedAt = Date.parse(s.updatedAt);
                  return (
                    <tr key={s.id}>
                      <td>
                        <button
                          className="row-name one-line"
                          title={st.name}
                          onClick={() => go("service/" + s.id)}
                        >
                          {st.name}
                        </button>
                      </td>
                      <td>
                        <span className="two-lines" title={s.major || undefined}>
                          {s.major || "专业待补"}
                        </span>
                      </td>
                      <td className="contract-cell">
                        <span className="one-line" title={projects}>{projects}</span>
                        <small className="one-line" title={targets}>{targets}</small>
                      </td>
                      <td className="one-line" title={teacher}>{teacher}</td>
                      <td className="one-line" title={manager}>{manager}</td>
                      <td>
                        <span className="tag one-line" title={s.progress || undefined}>
                          {s.progress || "待补"}
                        </span>
                      </td>
                      <td className="one-line" title={s.risk || undefined}>
                        {s.risk || "风险待补"}
                      </td>
                      {completed && (
                        <td>
                          {closure?.kind === "admission" ? (
                            <AdmittedSchools admissions={admissions.get(s.id)} nameOf={cat} />
                          ) : (
                            <span className="tag">{closure ? closureKinds[closure.kind] : "待补"}</span>
                          )}
                          {!!closure?.targets.length && <small>{closure.targets.join("、")}</small>}
                        </td>
                      )}
                      <td>
                        <span className="two-lines" title={log?.body}>
                          {log?.body || "暂无记录"}
                        </span>
                      </td>
                      <td className="updated-col tabular">
                        {Number.isFinite(updatedAt) ? (
                          <time dateTime={s.updatedAt}>{updateMonthDay.format(updatedAt)}</time>
                        ) : "待核"}
                      </td>
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
  const rows = useMemo(() => {
    const matches = new Set<string>();
    if (q) {
      for (const entry of w.entries) {
        if (!entry.voided && entry.body.includes(q)) matches.add(entry.studentId);
      }
    }
    return w.students.filter((s) => s.name.includes(q) || matches.has(s.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [w.students, w.entries, q]),
    current = Math.min(page, Math.max(1, Math.ceil(rows.length / 24)));
  const serviceCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const s of w.services) result.set(s.studentId, (result.get(s.studentId) || 0) + 1);
    return result;
  }, [w.services]);
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
                      {serviceCounts.get(s.id) || 0}
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
