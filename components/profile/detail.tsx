"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FileClock,
  GraduationCap,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import {
  closureKinds,
  currentClosure,
  entryKinds,
  labelOf,
  labels,
  newestEntries,
  orderedApps,
  phases,
  roles,
  timeLabel,
  type EntryKind,
  type Revision,
  type Service,
  type Student,
} from "../../lib/profile/model";
import {
  ActionEditor,
  EntryEditor,
  RewardEditor,
  SchoolEditor,
  ServiceEditor,
  StudentEditor,
} from "./editors";
import {
  display,
  Empty,
  ErrorBox,
  Facts,
  request,
  Section,
  useSite,
} from "./ui";
import { PageHead } from "./workbench";
function Tabs({
  tab,
  set,
  items,
}: {
  tab: string;
  set: (v: string) => void;
  items: [string, string][];
}) {
  return (
    <nav className="tabs" aria-label="详情分区">
      {items.map(([k, v]) => (
        <button
          key={k}
          aria-current={tab === k ? "page" : undefined}
          className={tab === k ? "active" : ""}
          onClick={() => set(k)}
        >
          {v}
        </button>
      ))}
    </nav>
  );
}
function Timeline({
  st,
  kind,
  title = entryKinds[kind],
  nested = false,
}: {
  st: Student;
  kind: EntryKind;
  title?: string;
  nested?: boolean;
}) {
  const { w, open } = useSite(),
    [filter, setFilter] = useState("");
  const entries = useMemo(() => newestEntries(
    w.entries.filter((e) => e.studentId === st.id && e.kind === kind && !e.voided),
  ), [w.entries, st.id, kind]);
  const months = useMemo(() =>
    [...new Set(entries.map((e) => e.date.slice(0, 7) || "unknown"))].sort().reverse(),
  [entries]);
  const shown = entries.filter(
    (e) => !filter || (e.date.slice(0, 7) || "unknown") === filter,
  );
  return (
    <Section
      title={title}
      nested={nested}
      action={
        <select
          className="compact"
          aria-label="按记录年月筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
              "新增" + entryKinds[kind],
              <EntryEditor kind={kind} studentId={st.id} />,
            )
          }
        >
          <Plus size={15} />
          新增记录
        </button>
      </div>
      {shown.length ? (
        <div className="timeline">
          {shown.map((e) => (
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
        </div>
      ) : (
        <Empty title="暂无此类记录" />
      )}
    </Section>
  );
}
export function History({ type, id }: { type: string; id: string }) {
  const { w } = useSite(),
    [rows, setRows] = useState<Revision[]>([]),
    [has, setHas] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let valid = true;
    setBusy(true);
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
    <Section title="变更历史">
      <div className="section-pad history-list">
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
                <small>{r.entityId}</small>
                {keys.map((k) => (
                  <div className="history-diff" key={k}>
                    <b>{labels[k]}</b>
                    {r.before && (
                      <span>原值 {display(before[k], w.catalogs)}</span>
                    )}
                    <span>现值 {display(after[k], w.catalogs)}</span>
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
    </Section>
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
          登记已递交申请
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
                    {cat(a.project)}
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
          准备中的学校可以先写入学生的出愿情况。
        </Empty>
      )}
    </Section>
  );
}
export function ServiceDetail({ id }: { id: string }) {
  const { w, open, go } = useSite(),
    [tab, setTab] = useState("base"),
    s = w.services.find((s) => s.id === id);
  if (!s) return <Empty title="找不到这份服务" />;
  const st = w.students.find((t) => t.id === s.studentId)!,
    cat = (v: string, fall?: string) => labelOf(w.catalogs, v, fall),
    closure = currentClosure(s);
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
    <>
      <PageHead
        title={st.name + "的服务"}
        subtitle={s.major || "专业方向待补"}
        actions={
          <>
            <button className="btn" onClick={() => go("student/" + st.id)}>
              <UserRound size={16} />
              学生档案
            </button>
            <button
              className="btn primary"
              onClick={() =>
                open("编辑服务资料", <ServiceEditor old={s} />, true)
              }
            >
              <Pencil size={15} />
              编辑服务
            </button>
          </>
        }
      />
      <div className="detail-summary">
        <div>
          <span className={"stage-pill " + s.phase}>{phases[s.phase]}</span>
          <b>{s.projects.map((v) => cat(v)).join("、") || "合同项目待补"}</b>
        </div>
        <div className="actions">
          {ops.map((action) => (
            <button
              className="btn"
              key={action}
              onClick={() =>
                open(actions[action], <ActionEditor s={s} action={action} />)
              }
            >
              {actions[action]}
            </button>
          ))}
          {s.phase === "completed" && (
            <button
              className="btn"
              onClick={() =>
                open(
                  "再次办理 · 新服务",
                  <ServiceEditor studentId={st.id} />,
                  true,
                )
              }
            >
              <Plus size={16} />
              再次办理
            </button>
          )}
        </div>
      </div>
      <Tabs
        tab={tab}
        set={setTab}
        items={[
          ["base", "服务概况"],
          ["rewards", "奖励结算"],
          ["history", "变更历史"],
        ]}
      />
      {tab === "base" && (
        <div className="detail-grid">
          <Section title="合同与目标">
            <Facts
              values={[
                ["甲方渠道", cat(s.channel)],
                ["合同项目", s.projects.map((v) => cat(v)).join("、")],
                ["专业方向", s.major],
                ["教务老师", cat(s.teacher, "教务待分配")],
                ["当前学管", cat(st.manager, "学管待分配")],
                ["首次签单", st.orderMonth],
                ["原合同入学目标", s.original.join("、")],
                ["当前入学目标", s.targets.join("、")],
              ]}
            />
          </Section>
          <Section title="工作进度">
            <Facts
              values={[
                [s.phase === "completed" ? "结束前状况" : "学生状况", s.status],
                ["材料准备", s.collection],
                ["材料制作", s.production],
                ["申请进度", s.progress],
                ["申请风险", s.risk],
                ["学校出愿信息", s.publication],
              ]}
            />
          </Section>
          {closure && (
            <Section title={"完成情况 · " + closureKinds[closure.kind]}>
              <Facts
                values={[
                  ["结束时入学目标", closure.targets.join("、")],
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
                        {cat(a.school)} · {cat(a.project)} {a.program}
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
          <div className="overview-records stack">
            <Timeline st={st} kind="progress" title="学生跟进情况" />
            <Section title="申请与出愿">
              <div className="detail-grid application-grid">
                <Applications s={s} />
                <Timeline st={st} kind="application" nested />
              </div>
            </Section>
            <Section title="特记事项与备注">
              <Facts
                values={[
                  ["特记事项", s.special || "未填写"],
                  ["备注", s.notes || "未填写"],
                ]}
              />
            </Section>
          </div>
        </div>
      )}
      {tab === "rewards" && (
        <div className="detail-grid">
          {(["teacher", "manager"] as const).map((role) => {
            const r = s.rewards[role],
              current = role === "teacher" ? s.teacher : st.manager;
            return (
              <Section
                key={role}
                title={roles[role] + "奖励"}
                action={
                  <button
                    className="row-action edit"
                    onClick={() =>
                      open(
                        roles[role] + "奖励结算",
                        <RewardEditor s={s} role={role} />,
                      )
                    }
                  >
                    编辑
                  </button>
                }
              >
                <Facts
                  values={[
                    ["当前负责人", cat(current, "待分配")],
                    [
                      r?.confirmed ? "已确认归属" : "建议归属",
                      cat(r?.recipient || current, "待分配"),
                    ],
                    ["计入工资年月", r?.month || "未填写"],
                  ]}
                />
              </Section>
            );
          })}
        </div>
      )}
      {tab === "history" && <History type="services" id={id} />}
    </>
  );
}
export function StudentDetail({ id }: { id: string }) {
  const { w, open, go } = useSite(),
    [tab, setTab] = useState("base"),
    st = w.students.find((s) => s.id === id);
  if (!st) return <Empty title="找不到学生档案" />;
  const services = w.services.filter((s) => s.studentId === id);
  return (
    <>
      <PageHead
        title={st.name}
        subtitle={"永久档案 · " + st.id}
        actions={
          <>
            <button
              className="btn"
              onClick={() => open("编辑学生档案", <StudentEditor old={st} />)}
            >
              <Pencil size={15} />
              编辑档案
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
      <Tabs
        tab={tab}
        set={setTab}
        items={[
          ["base", "档案概况"],
          ["progress", "常规进度"],
          ["application", "出愿情况"],
          ["history", "变更历史"],
        ]}
      />
      {tab === "base" && (
        <div className="stack">
          <Section title="共有资料">
            <Facts
              values={[
                ["首次签单", st.orderMonth],
                ["所在地", st.location],
                ["当前学管", labelOf(w.catalogs, st.manager, "学管待分配")],
                ["语言声明", st.declaration || "历史待补"],
                ["JLPT", st.jlpt || "未填写"],
                ["托福", st.toefl || "未填写"],
                ["雅思", st.ielts || "未填写"],
                ["托业", st.toeic || "未填写"],
              ]}
            />
          </Section>
          <Section title={"历次服务 · " + services.length}>
            {services.length ? (
              <div className="record-list">
                {services.map((s) => (
                  <article key={s.id}>
                    <span className={"stage-pill " + s.phase}>
                      {phases[s.phase]}
                    </span>
                    <button
                      className="row-name"
                      onClick={() => go("service/" + s.id)}
                    >
                      {s.major || "查看服务"}
                    </button>
                    <small>
                      {s.projects.map((p) => labelOf(w.catalogs, p)).join("、")}{" "}
                      · {s.targets.join("、") || "目标待补"}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="暂无服务" />
            )}
          </Section>
        </div>
      )}
      {(tab === "progress" || tab === "application") && (
        <Timeline key={tab} st={st} kind={tab} />
      )}
      {tab === "history" && <History type="students" id={id} />}
    </>
  );
}
