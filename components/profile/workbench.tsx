"use client";
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import exportWorkerUrl from "../../lib/profile/export.worker.ts?worker&url";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Download,
  ListFilter,
  Pencil,
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
  languageStatus,
  phases,
  tokyoDay,
  type Application,
  type Catalog,
  type Entry,
  type Phase,
  type Service,
  type Student,
} from "../../lib/profile/model";
import {
  compareStudentNames,
  defaultFilters,
  serviceRows,
  type Filters,
} from "../../lib/profile/list";
import { Empty, ErrorBox, Field, request, studentPath, useSite } from "./ui";
import { ActionEditor, EntryEditor, SchoolEditor, ServiceEditor, StudentEditor, type EntryDraft, type ServiceListField } from "./editors";
import { projectLevel, ProjectNames } from "./project-names";
import { WorkbenchChoices } from "./workbench-choices";
type ListActions = Pick<ReturnType<typeof useSite>, "open" | "go" | "write" | "refresh" | "notice">;
type ListField = ServiceListField | "name" | "entry";
const fieldNames: Record<ListField, string> = {
  name: "姓名", major: "专业", projects: "合同项目", statusTargets: "学生状况与目标时间",
  entry: "最新跟进",
};
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
export function SearchBox({
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
function AdmittedSchools({ service, admissions, nameOf, open }: {
  service: Service;
  admissions?: Application[];
  nameOf: (id: string, blank: string) => string;
  open: ListActions["open"];
}) {
  if (!admissions?.length) return (
    <button className="cell-edit" aria-haspopup="dialog" aria-label="补录合格学校"
      onClick={() => open("登记学校申请", <SchoolEditor s={service} />, true)}>
      <span className="tag">合格学校待补</span>
    </button>
  );
  return (
    <ul className="admitted-schools" aria-label="合格学校">
      {admissions.map((a) => (
        <li key={a.id}>
          <button className="cell-edit" aria-haspopup="dialog"
            aria-label={"修改学校申请 · " + nameOf(a.school, "学校名称待补")}
            onClick={() => open("编辑学校申请", <SchoolEditor s={service} old={a} />, true)}>
            <span className="tag positive">
              {nameOf(a.school, "学校名称待补")}
            </span>
            <small>
              <ProjectNames names={nameOf(a.project, "项目待补")} />
              {a.program && " · " + a.program}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}
const ServiceRow = memo(function ServiceRow({ service: s, student: st, log, admissions, staff, nameOf, actions }: {
  service: Service;
  student: Student;
  log?: Entry;
  admissions?: Application[];
  staff: Catalog[];
  nameOf: (id: string, blank?: string) => string;
  actions: ListActions;
}) {
  const { open, go } = actions;
  const row = useRef<HTMLTableRowElement>(null);
  const [progressChange, setProgressChange] = useState<{ service: Service; value: string } | null>(null);
  const completed = s.phase === "completed";
  const closure = completed ? currentClosure(s) : undefined;
  const entryKind = s.phase === "applying" ? "application" : "progress";
  const projects = s.projects.map((p) => nameOf(p));
  const status = s.status || "状况待补";
  const targets = s.targets.join(" / ") || "目标待补";
  const updatedAt = Date.parse(s.updatedAt);

  function openEntry(anchor: HTMLButtonElement, entry?: Entry, draft?: EntryDraft) {
    const restoreEdit = !entry && log && draft ? () => openEntry(anchor, log, draft) : undefined;
    open(
      (entry ? "修改最新跟进" : "新建跟进") + " · " + st.name,
      <EntryEditor key={entry?.id ?? "new"} studentId={st.id} kind={entryKind} old={entry}
        draft={entry ? draft : undefined}
        onNew={entry ? (pending) => openEntry(anchor, undefined, pending) : undefined}
        onCancel={restoreEdit} />,
      false, anchor, restoreEdit,
    );
  }
  function edit(field: ListField, anchor: HTMLButtonElement) {
    if (field === "entry") return openEntry(anchor, log);
    let editor;
    if (field === "name") {
      editor = <StudentEditor old={st} field={field} />;
    } else {
      editor = <ServiceEditor old={s} field={field} />;
    }
    open("修改" + fieldNames[field] + " · " + st.name, editor, false, anchor);
  }
  const fieldButton = (
    field: ListField,
    value: string,
    format?: string,
    content: React.ReactNode = value,
  ) => {
    return (
      <button type="button" className="cell-edit" aria-haspopup="dialog"
        aria-label={fieldNames[field] + " · " + st.name + " · " + value}
        title={value} onClick={(e) => edit(field, e.currentTarget)}>
        <span className={format}>{content}</span>
      </button>
    );
  };
  function dismissProgress() {
    setProgressChange((current) => current === progressChange ? null : current);
    row.current?.querySelector<HTMLElement>('select[name="progress"]')?.focus({ preventScroll: true });
  }
  return (
    <>
      <tr ref={row}>
        <td>
          <div className="name-actions">
            <button className="row-name" title={st.name} onClick={() => go(studentPath(st.id, s.id))}>
              {st.name}
            </button>
            <button className="name-edit" title="修改姓名" aria-label={"修改姓名 · " + st.name}
              aria-haspopup="dialog" onClick={(e) => edit("name", e.currentTarget)}>
              <Pencil size={13} aria-hidden="true" />
            </button>
          </div>
        </td>
        <td className="status-target-cell">
          {fieldButton("statusTargets", status + " · " + targets, undefined, <>{status}<small>{targets}</small></>)}
        </td>
        <td>{fieldButton("major", s.major || "专业待补", "two-lines")}</td>
        <td>
          {fieldButton("projects", projects.join("、") || "待补", "project-list", <ProjectNames names={projects} />)}
        </td>
        <WorkbenchChoices service={s} student={st} staff={staff} actions={actions} draftProgress={progressChange?.value}
          setDraftProgress={(value) => setProgressChange(value ? { service: s, value } : null)} />
        {completed && (
          <td>
            {closure?.kind === "admission" ? (
              <AdmittedSchools service={s} admissions={admissions} nameOf={nameOf} open={open} />
            ) : closure ? (
              <button className="cell-edit" aria-haspopup="dialog" title="更正结案情况"
                onClick={(e) => open("撤回误结案 · " + st.name, <ActionEditor s={s} action="reopen" />, false, e.currentTarget)}>
                <span className="tag">{closureKinds[closure.kind]}</span>
              </button>
            ) : (
              <span className="tag">待补</span>
            )}
            {!!closure?.targets.length && <small>{closure.targets.join("、")}</small>}
          </td>
        )}
        <td>{fieldButton("entry", log?.body || "暂无记录", "two-lines")}</td>
        <td className="updated-col tabular">
          {Number.isFinite(updatedAt) ? (
            <time dateTime={s.updatedAt}>{updateMonthDay.format(updatedAt)}</time>
          ) : "待核"}
        </td>
      </tr>
      {progressChange && (
        <tr className="progress-status-row">
          <td colSpan={completed ? 11 : 10}>
            <section className="progress-status-editor" aria-label={st.name + "的申请进度与学生状况"}>
              <strong>申请进度改为「{progressChange.value}」，请确认学生状况</strong>
              <ServiceEditor key={progressChange.value} old={progressChange.service}
                progressChange={{ value: progressChange.value, dismiss: dismissProgress }} />
            </section>
          </td>
        </tr>
      )}
    </>
  );
});

const serviceRowChunk = 16;
function ServiceTableBody({ rows, restoringScroll, renderRow }: {
  rows: Service[];
  restoringScroll: boolean;
  renderRow: (service: Service) => React.ReactNode;
}) {
  // Render the first screen first. On return from a detail page the full scroll range
  // must exist before the parent's layout effect restores the previous position.
  const [limit, setLimit] = useState(() => restoringScroll ? rows.length : serviceRowChunk);
  const pending = limit < rows.length;
  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      startTransition(() => setLimit((count) => count + serviceRowChunk));
    });
    return () => cancelAnimationFrame(frame);
  }, [limit, pending]);
  return <tbody aria-busy={pending}>{rows.slice(0, limit).map(renderRow)}</tbody>;
}

export function Workbench({
  filters: f,
  setFilters,
  scrollPositionRef,
}: {
  filters: Filters;
  setFilters: (v: Filters) => void;
  scrollPositionRef: RefObject<{ top: number; left: number }>;
}) {
  const { w, open, go, write, refresh, notice } = useSite(),
    [more, setMore] = useState(false);
  const actions = useMemo(() => ({ open, go, write, refresh, notice }), [open, go, write, refresh, notice]);
  const viewport = useRef<HTMLDivElement>(null);
  const changeFilters = (next: Filters) => {
    scrollPositionRef.current = { top: 0, left: 0 };
    setFilters(next);
  };
  const set = (k: keyof Filters, v: string) => changeFilters({ ...f, [k]: v });
  const completed = f.phase === "completed";
  const deferred = useDeferredValue(f);
  const listFilters = deferred.phase === f.phase ? deferred : f;
  const rows = useMemo(() => serviceRows(w, listFilters), [w, listFilters]);
  const hasRows = rows.length > 0;
  useLayoutEffect(() => {
    viewport.current?.scrollTo(scrollPositionRef.current);
  }, [f, hasRows, scrollPositionRef]);
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
  const staff = useMemo(() => w.catalogs.filter((c) => c.kind === "teacher" || c.kind === "manager"), [w.catalogs]);
  const counts = useMemo(() => {
    const result = { progress: 0, applying: 0, paused: 0, completed: 0 };
    for (const service of w.services) result[service.phase]++;
    return result;
  }, [w.services]);
  const cat = useCallback((v: string, blank = "待补") => names.get(v) || blank, [names]),
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
              onClick={() =>
                changeFilters({
                  ...f,
                  phase: k,
                  closure: k === "completed" ? f.closure : "",
                })
              }
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
                <select
                  value={f[k]}
                  onChange={(e) => set(k, e.target.value)}
                  data-project-level={k === "project" ? projectLevel(names.get(f[k])) : undefined}
                >
                  <option value="">全部</option>
                  {items.map((o) => {
                    const [v, label] = typeof o === "string" ? [o, o] : o;
                    return (
                      <option value={v} key={v} data-project-level={k === "project" ? projectLevel(label) : undefined}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>
            ))}
            <button
              className="link"
              onClick={() => changeFilters({ ...defaultFilters, phase: f.phase })}
            >
              清空条件
            </button>
          </div>
        )}
        {hasRows ? (
          <div
            ref={viewport}
            className="table-scroll"
            role="region"
            aria-label={phases[f.phase] + "服务表格"}
            tabIndex={0}
            onFocus={(e) => {
              if (e.currentTarget.scrollWidth > e.currentTarget.clientWidth && e.target.matches(":focus-visible")) {
                e.target.closest("td:not(:first-child)")?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            }}
            onScroll={(e) => {
              const { scrollTop, scrollLeft } = e.currentTarget;
              scrollPositionRef.current = { top: scrollTop, left: scrollLeft };
            }}
          >
            <table className={"data-table sticky services-table" + (completed ? " with-closures" : "")}>
              <thead>
                <tr>
                  <th scope="col" className="name-col">姓名</th>
                  <th scope="col" className="status-target-col">学生状况 / 目标时间</th>
                  <th scope="col" className="major-col">专业</th>
                  <th scope="col" className="contract-col">合同项目</th>
                  <th scope="col" className="staff-col">教务</th>
                  <th scope="col" className="staff-col">学管</th>
                  <th scope="col" className="progress-col">申请进度</th>
                  <th scope="col" className="risk-col">潜在风险</th>
                  {completed && <th scope="col" className="closure-col">完成情况</th>}
                  <th scope="col">最新跟进</th>
                  <th scope="col" className="updated-col" aria-label="最近更新" title="最近更新（月/日）">更新</th>
                </tr>
              </thead>
              <ServiceTableBody key={f.phase} rows={rows} restoringScroll={scrollPositionRef.current.top > 0}
                renderRow={(s) => (
                  <ServiceRow key={s.id} service={s} student={students.get(s.studentId)!}
                    log={latest.get(s.studentId + (s.phase === "applying" ? "|application" : "|progress"))}
                    admissions={admissions.get(s.id)} staff={staff} nameOf={cat} actions={actions} />
                )} />
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
                    changeFilters({ ...defaultFilters, phase: f.phase })
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
                ? "新建服务时可选择已有学生，也可以同时建立学生档案。"
                : "进入此阶段的服务会显示在这里。"}
          </Empty>
        )}
      </section>
    </>
  );
}
export function Students({ q, search, page, setPage }: {
  q: string;
  search: (query: string) => void;
  page: number;
  setPage: (page: number) => void;
}) {
  const { w, go, open } = useSite();
  const query = useDeferredValue(q);
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = new Set<string>();
    if (term) {
      for (const entry of w.entries) {
        if (!entry.voided && entry.body.toLowerCase().includes(term)) matches.add(entry.studentId);
      }
    }
    const nameMatches = (name: string) => name.toLowerCase().includes(term);
    return w.students.filter((s) => nameMatches(s.name) || matches.has(s.id))
      .sort((a, b) => Number(nameMatches(b.name)) - Number(nameMatches(a.name)) ||
        compareStudentNames(a.name, b.name) || a.id.localeCompare(b.id));
  }, [w.students, w.entries, query]),
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
                    "语言情况",
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
                        className="row-name one-line"
                        title={s.name}
                        onClick={() => go(studentPath(s.id))}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td>{s.orderMonth || "待补"}</td>
                    <td>{s.location || "待补"}</td>
                    <td>{languageStatus(s)}</td>
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
