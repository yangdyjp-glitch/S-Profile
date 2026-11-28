"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileClock,
  GraduationCap,
  Pencil,
  Plus,
} from "lucide-react";
import {
  closureKinds,
  currentClosure,
  labelOf,
  labels,
  newestEntries,
  orderedApps,
  phases,
  timeLabel,
  type EntryKind,
  type Revision,
  type Service,
  type Student,
} from "../../lib/profile/model";
import {
  ActionEditor,
  EntryEditor,
  SchoolEditor,
  ServiceEditor,
  StudentEditor,
} from "./editors";
import {
  displayField,
  Empty,
  ErrorBox,
  Facts,
  request,
  Section,
  studentPath,
  useSite,
} from "./ui";
import { PageHead } from "./workbench";
import { ProjectNames } from "./project-names";
import { DetailFields, DetailValue, detailControlId, editableFact } from "./detail-fields";
function intakeMonths(months: string[], fallback = "待补") {
  return months.length ? months.map((month, i) => (
    <span className="intake-month" key={i}>{month}{i + 1 < months.length && "、"}</span>
  )) : fallback;
}
const timelinePageSize = 12;
function Timeline({
  st,
  kind,
  nested = false,
}: {
  st: Student;
  kind: EntryKind;
  nested?: boolean;
}) {
  const { w, open } = useSite(),
    [filter, setFilter] = useState(""),
    [limit, setLimit] = useState(timelinePageSize);
  const moreButton = useRef<HTMLButtonElement>(null);
  const title = kind === "progress" ? "学生跟进" : "出愿跟进";
  const addLabel = kind === "progress" ? "新增跟进" : "新增出愿跟进";
  const entries = useMemo(() => newestEntries(
    w.entries.filter((e) => e.studentId === st.id && e.kind === kind && !e.voided),
  ), [w.entries, st.id, kind]);
  const months = useMemo(() =>
    [...new Set(entries.map((e) => e.date.slice(0, 7) || "unknown"))].sort().reverse(),
  [entries]);
  const shown = useMemo(() => filter
    ? entries.filter((e) => (e.date.slice(0, 7) || "unknown") === filter)
    : entries, [entries, filter]);
  useEffect(() => {
    const button = moreButton.current;
    if (!button || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit((n) => n + timelinePageSize);
    }, { root: button.parentElement, rootMargin: "80px" });
    observer.observe(button);
    return () => observer.disconnect();
  }, [limit, shown]);
  return (
    <Section
      title={title}
      nested={nested}
      action={
        <select
          className="compact"
          aria-label={"按" + title + "年月筛选"}
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setLimit(timelinePageSize); }}
        >
          <option value="">全部年月</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m === "unknown" ? "日期待确认" : m}
            </option>
          ))}
        </select>
      }
    >
      <div className="section-pad">
        <button
          className="btn"
          onClick={() =>
            open(
              addLabel,
              <EntryEditor kind={kind} studentId={st.id} />,
            )
          }
        >
          <Plus size={15} />
          {addLabel}
        </button>
      </div>
      {shown.length ? (
        <div className="timeline">
          {shown.slice(0, limit).map((e) => (
            <article key={e.id}>
              <div className="timeline-meta">
                <strong>{e.date || e.rawDate || "日期待确认"}</strong>
                <span>第 {e.version} 版</span>
              </div>
              {e.body && <p>{e.body}</p>}
              <div className="actions end">
                <button
                  className="row-action edit"
                  onClick={() =>
                    open(
                      "修改跟进记录",
                      <EntryEditor kind={kind} studentId={st.id} old={e} />,
                    )
                  }
                >
                  编辑
                </button>
                <button
                  className="row-action deactivate"
                  onClick={() =>
                    open(
                      "作废跟进记录",
                      <EntryEditor
                        kind={kind}
                        studentId={st.id}
                        old={e}
                        voiding
                      />,
                    )
                  }
                >
                  作废
                </button>
              </div>
            </article>
          ))}
          {shown.length > limit && (
            <button className="btn" ref={moreButton} onClick={() => setLimit((n) => n + timelinePageSize)}>
              载入更早的{title}
            </button>
          )}
        </div>
      ) : (
        <Empty title="暂无此类记录" />
      )}
    </Section>
  );
}
function History({ type, id }: { type: "students" | "services"; id: string }) {
  const { w } = useSite(),
    [rows, setRows] = useState<Revision[]>([]),
    [has, setHas] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let valid = true;
    setBusy(true);
    setError("");
    request<Revision[]>("history/" + type + "/" + id)
      .then((r) => {
        if (valid) {
          setRows(r);
          setHas(r.length === 50);
        }
      })
      .catch((e) => {
        if (valid) setError(e.message);
      })
      .finally(() => {
        if (valid) setBusy(false);
      });
    return () => {
      valid = false;
    };
  }, [type, id, w]);
  async function more() {
    setBusy(true);
    try {
      const r = await request<Revision[]>(
        "history/" + type + "/" + id + "?before=" + rows.at(-1)?.seq,
      );
      setRows([...rows, ...r]);
      setHas(r.length === 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-pad history-list" aria-busy={busy}>
      <ErrorBox message={error} />
      {rows.map((r) => {
        const before = r.before ? JSON.parse(r.before) : {},
          after = JSON.parse(r.after),
          keys = Object.keys(after).filter(
            (k) =>
              labels[k] &&
              JSON.stringify(before[k]) !== JSON.stringify(after[k]),
          );
        return (
          <details key={r.seq}>
            <summary>
              <span className="history-icon">
                <FileClock size={16} />
              </span>
              <div>
                <strong>{r.action}</strong>
                <small>
                  {r.actor} · {timeLabel(r.at)} · 第 {r.version} 版
                </small>
              </div>
              <ChevronDown size={16} />
            </summary>
            <div className="history-content">
              {r.entity !== "students" && <small>{r.entityId}</small>}
              {keys.map((k) => (
                <div className="history-diff" key={k}>
                  <b>{labels[k]}</b>
                  {r.before && (
                    <span>原值 {displayField(k, before[k], w.catalogs)}</span>
                  )}
                  <span>现值 {displayField(k, after[k], w.catalogs)}</span>
                </div>
              ))}
              {!keys.length && <p>关联记录已更新。</p>}
            </div>
          </details>
        );
      })}
      {!rows.length && !busy && <p className="subtle">暂无变更记录</p>}
      {busy && <p className="subtle">正在加载…</p>}
      {has && !busy && rows.length > 0 && (
        <button className="btn" onClick={more}>
          载入更早记录
        </button>
      )}
    </div>
  );
}
function HistoryPanel({ studentId, serviceId }: { studentId: string; serviceId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState("student");
  const scopedService = scope === "service" ? serviceId : undefined;
  return (
    <section className="panel detail-history" aria-labelledby="history-heading">
      <h2 id="history-heading">
        <button type="button" aria-expanded={expanded} aria-controls="student-history-content"
          onClick={() => setExpanded(!expanded)}>
          变更历史 <ChevronDown size={18} aria-hidden="true" />
        </button>
      </h2>
      <div id="student-history-content" hidden={!expanded}>
        {expanded && <>
          {serviceId && (
            <label className="history-scope">
              历史范围
              <select className="compact" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="student">该生全部记录</option>
                <option value="service">仅当前服务</option>
              </select>
            </label>
          )}
          <History key={scopedService || studentId}
            type={scopedService ? "services" : "students"} id={scopedService || studentId} />
        </>}
      </div>
    </section>
  );
}
function Applications({ s }: { s: Service }) {
  const { w, open } = useSite(),
    cat = (v: string) => labelOf(w.catalogs, v),
    apps = orderedApps(
      w.applications.filter((a) => a.serviceId === s.id && !a.voided),
    );
  return (
    <Section
      title={"学校申请 · " + apps.length}
      nested
      action={
        <button
          className="btn"
          onClick={() => open("登记学校申请", <SchoolEditor s={s} />, true)}
        >
          <Plus size={16} />
          登记学校申请
        </button>
      }
    >
      {apps.length ? (
        <div className="record-list">
          {apps.map((a) => (
            <article key={a.id}>
              <div className="record-title">
                <span className="record-icon">
                  <GraduationCap size={20} />
                </span>
                <div>
                  <h4>{cat(a.school)}</h4>
                  <small>
                    <ProjectNames names={cat(a.project)} />
                    {a.program ? " · " + a.program : ""}
                  </small>
                </div>
                <span className={"tag " + (a.admitted ? "positive" : "")}>
                  {a.admitted ? "正式合格" : "未登记合格"}
                </span>
                {a.final && <span className="tag amber">最终选择</span>}
              </div>
              <Facts
                values={[
                  ["学校入学时间", a.intake || "待定"],
                  ["出愿截止日", a.deadline || "待定"],
                  ["工作开始月", a.workMonth || "待定"],
                  ...(a.admitted
                    ? ([["收到合格日期", a.received || "历史待补"]] as [
                        string,
                        string,
                      ][])
                    : []),
                  ...(a.final
                    ? ([
                        [
                          "内诺",
                          a.needsOffer ? a.offer || "历史待补" : "无需内诺",
                        ],
                      ] as [string, string][])
                    : []),
                ]}
              />
              <div className="actions end">
                <button
                  className="row-action edit"
                  onClick={() =>
                    open("编辑学校申请", <SchoolEditor old={a} s={s} />, true)
                  }
                >
                  编辑申请
                </button>
                <button
                  className="row-action deactivate"
                  onClick={() =>
                    open("作废学校申请", <SchoolEditor old={a} s={s} voiding />)
                  }
                >
                  作废
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="暂无已递交的学校申请">
          准备中的学校可以先写入出愿跟进。
        </Empty>
      )}
    </Section>
  );
}
function StageActions({ s }: { s: Service }) {
  const { open } = useSite();
  const actions: Record<string, string> = {
    apply: "进入出愿",
    pause: "暂停服务",
    resume: "恢复服务",
    return: "退回进行中",
    close: "办理结案",
    reopen: "撤回误结案",
  };
  const ops =
    s.phase === "progress"
      ? ["apply", "pause", "close"]
      : s.phase === "paused"
        ? ["resume", "close"]
        : s.phase === "applying"
          ? ["return", "close"]
          : ["reopen"];
  return (
    <div className="stage-actions" role="group" aria-label="服务阶段操作">
      {ops.map((action) => (
        <button type="button" key={action}
          onClick={() => open(actions[action], <ActionEditor s={s} action={action} />)}>
          {actions[action]}
        </button>
      ))}
    </div>
  );
}
function ServiceHistoryPanels({ s }: { s: Service }) {
  const { w } = useSite();
  const cat = (id: string, fallback?: string) => labelOf(w.catalogs, id, fallback);
  const closure = currentClosure(s);
  if (!closure && !s.pauses.length) return null;
  return (
    <div className="detail-grid service-history-panels">
      {closure && (
        <Section title={"完成情况 · " + closureKinds[closure.kind]}>
          <Facts
            values={[
              ["结束时入学目标", intakeMonths(closure.targets)],
              ["结案说明", closure.note || "未填写"],
              ["结案时间", timeLabel(closure.at)],
            ]}
          />
          {closure.kind === "admission" && (
            <details className="section-pad">
              <summary>查看全部合格申请</summary>
              {w.applications
                .filter(
                  (a) => a.serviceId === s.id && a.admitted && !a.voided,
                )
                .map((a) => (
                  <p key={a.id}>
                    {cat(a.school)} · <ProjectNames names={cat(a.project)} /> {a.program}
                  </p>
                ))}
            </details>
          )}
        </Section>
      )}
      {s.pauses.length > 0 && (
        <Section title="暂停历史">
          <div className="section-pad">
            {s.pauses.map((p, i) => (
              <p key={i}>
                {timeLabel(p.start)} 至{" "}
                {p.end
                  ? timeLabel(p.end)
                  : s.phase === "completed"
                    ? "结案时"
                    : "未恢复"}{" "}
                · {p.reason || "未填原因"}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
const servicePriority = { progress: 0, applying: 0, paused: 1, completed: 2 };

export function StudentDetail({ id, serviceId, legacy }: { id: string; serviceId?: string; legacy: boolean }) {
  const { w, open, go } = useSite();
  const st = w.students.find((student) => student.id === id);
  const choices = useMemo(() => {
    const services = w.services.filter((service) => service.studentId === id);
    services.sort((a, b) => servicePriority[a.phase] - servicePriority[b.phase] ||
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return services.map((service) => {
      const projects = service.projects.map((p) => labelOf(w.catalogs, p));
      const label = [
        projects.join("、") || "合同项目待补", service.targets.join("、") || "目标待补",
        phases[service.phase], service.major,
      ].filter(Boolean).join(" · ");
      return { service, projects, label };
    });
  }, [id, w.services, w.catalogs]);
  const selected = serviceId ? choices.find(({ service }) => service.id === serviceId) : choices[0];
  const s = selected?.service;
  const selectedId = s?.id;
  useEffect(() => {
    if (!selectedId || (!legacy && serviceId)) return;
    const original = legacy ? "service/" + selectedId : studentPath(id);
    if (location.hash === "#" + original) {
      location.replace("#" + studentPath(id, selectedId));
    }
  }, [id, serviceId, selectedId, legacy]);
  if (!st) return <Empty title="找不到学生档案" />;
  return (
    <DetailFields scope={st.id + "/" + (selectedId ?? "")}>
      <PageHead
        title={st.name}
        actions={
          <>
            <button
              className="btn"
              onClick={() => open(
                "编辑学生资料",
                selected ? (
                  <ServiceEditor
                    old={selected.service}
                    profile={{ student: st, serviceLabel: choices.length > 1 ? selected.label : undefined }}
                  />
                ) : <StudentEditor old={st} />,
                !!selected,
              )}
            >
              <Pencil size={15} />
              编辑学生资料
            </button>
            <button
              className="btn primary"
              onClick={() =>
                open("为该生新建服务", <ServiceEditor studentId={id} />, true)
              }
            >
              <Plus size={15} />
              新建服务
            </button>
          </>
        }
      />
      <div className="service-overview">
        <section className="panel service-summary-row" aria-labelledby="student-summary-heading">
          <h2 id="student-summary-heading">学生资料</h2>
          <Facts values={[
            editableFact("所在地", { student: st, field: "location" }),
            editableFact("当前学管", { student: st, field: "manager" }),
            ["首次签单", st.orderMonth],
            ["专业方向", choices.length ? (
              <ul className="archive-majors">
                {choices.map(({ service, projects }) => (
                  <li key={service.id}>
                    <DetailValue service={service} field="major" label="专业方向"
                      describedBy={choices.length > 1 ? "major-context-" + service.id : undefined} />
                    {choices.length > 1 && (
                      <small id={"major-context-" + service.id}>
                        {projects.join("、") || "合同项目待补"}
                        {!!service.targets.length && <> · {intakeMonths(service.targets)}</>}
                        {service.id === selectedId && " · 当前服务"}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            ) : "待补", s ? detailControlId(s, "major") : undefined],
            ["历次服务", choices.length + " 份"],
            editableFact("语言情况", { student: st, field: "language" }),
          ]} />
        </section>
        <section className="panel service-summary-row detail-summary" aria-label="当前服务">
          <div className="current-service-heading">
            <h2>当前服务</h2>
            {s && <span className={"stage-pill " + s.phase}>{phases[s.phase]}</span>}
            {(choices.length > 1 || (choices.length > 0 && !selected)) && (
              <label className="btn service-switch">
                <span aria-hidden="true">{s ? "切换服务" : "请选择服务"}（{choices.length} 份）</span>
                <ChevronDown size={14} aria-hidden="true" />
                <select aria-label="切换服务" value={selectedId || ""}
                  onChange={(e) => go(studentPath(id, e.target.value))}>
                  {!s && <option value="" disabled>请选择该生的服务</option>}
                  {choices.map((choice) => (
                    <option key={choice.service.id} value={choice.service.id}>
                      {choice.label}{choices.some((other) => other !== choice && other.label === choice.label)
                        ? " · " + choice.service.id : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {s && (
            <>
              <Facts values={[
                editableFact("合同项目", { service: s, field: "projects" }),
                editableFact("甲方渠道", { service: s, field: "channel" }),
                editableFact("原合同入学目标", { service: s, field: "original" }),
                editableFact("当前入学目标", { service: s, field: "targets" }),
                editableFact("教务老师", { service: s, field: "teacher" }),
              ]} />
              <StageActions s={s} />
            </>
          )}
          {!choices.length && <span className="subtle">暂无服务</span>}
          {serviceId && !s && <small role="status">这份服务不在该生档案中。</small>}
        </section>
        {s && (
          <section className="panel service-summary-row progress-summary" aria-labelledby="work-heading">
            <h2 id="work-heading">工作进度</h2>
            <Facts values={[
              editableFact(s.phase === "completed" ? "结束前状况" : "学生状况", { service: s, field: "status" }),
              editableFact("材料准备", { service: s, field: "collection" }),
              editableFact("材料制作", { service: s, field: "production" }),
              editableFact("申请进度", { service: s, field: "progress" }),
              editableFact("申请风险", { service: s, field: "risk" }),
              editableFact("学校出愿信息", { service: s, field: "publication" }),
            ]} />
          </section>
        )}
      </div>
      <div className="overview-records stack">
        {s && <ServiceHistoryPanels s={s} />}
        <Timeline key={st.id} st={st} kind="progress" />
        <Section title="申请与出愿">
          <div className={s ? "detail-grid application-grid" : undefined}>
            {s && <Applications s={s} />}
            <Timeline key={st.id} st={st} kind="application" nested />
          </div>
        </Section>
        {s && (
          <Section title="特记事项与备注">
            <Facts values={[["特记事项", s.special || "未填写"], ["备注", s.notes || "未填写"]]} />
          </Section>
        )}
        <HistoryPanel studentId={id} serviceId={selectedId} />
      </div>
    </DetailFields>
  );
}
