"use client";
import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { phases, roles, type Catalog } from "../../lib/profile/model";
import { statisticsScopes, studentStatistics, targetCombination, type Metric, type StaffRole, type StatisticsScope } from "../../lib/profile/statistics";
import { compareStudentNames } from "../../lib/profile/student-list";
import { ProjectNames } from "./project-names";
import { Empty, Section, studentPath, useSite } from "./ui";
import { PageHead, PageNav } from "./workbench";
import "./statistics.css";

const staffRoles = ["teacher", "manager"] as const;
function overviewPath(scope: StatisticsScope, role: StaffRole) {
  return scope === "active" && role === "teacher" ? "statistics" : `statistics/${scope}/${role}`;
}

function StaffSwitch({ label, role, change }: { label: string; role: StaffRole; change: (next: StaffRole) => void }) {
  return (
    <div className="segmented stats-switch" role="group" aria-label={label}>
      {staffRoles.map((value) => <button type="button" key={value} aria-pressed={role === value}
        className={role === value ? "selected" : ""} onClick={() => change(value)}>按{roles[value]}</button>)}
    </div>
  );
}

function StudentRoster({ metric, scope, role, page, path, catalogs }: {
  metric: Metric; scope: StatisticsScope; role: StaffRole; page: number; path: string; catalogs: Catalog[];
}) {
  const { go } = useSite();
  const heading = useRef<HTMLHeadingElement>(null);
  const members = useMemo(() => [...metric.members.values()].sort((a, b) =>
    compareStudentNames(a.student.name, b.student.name) || a.student.id.localeCompare(b.student.id)), [metric]);
  const projects = useMemo(() => new Map(catalogs.filter((c) => c.kind === "project").map((c) => [c.id, c.name])), [catalogs]);
  const pageSize = 24;
  const current = Math.max(1, Math.min(page, Math.ceil(members.length / pageSize)));
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }, [path, current]);
  return (
    <div className="stats-page">
      <header className="page-head">
        <div>
          <h1 tabIndex={-1} ref={heading}>{metric.title} · 学生名单</h1>
          <p>{statisticsScopes[scope]} · {roles[role]}视图 · 共 {members.length} 人</p>
        </div>
        <a className="btn" href={"#" + overviewPath(scope, role)}><ArrowLeft size={16} />返回数据统计</a>
      </header>
      <section className="panel stats-roster" aria-label="学生名单">
        {members.length ? (
          <div className="table-scroll">
            <table className="data-table stats-roster-table" aria-label="学生及匹配的服务">
              <thead><tr><th scope="col">学生姓名</th><th scope="col">匹配的服务</th></tr></thead>
              <tbody>{members.slice((current - 1) * pageSize, current * pageSize).map(({ student, services }) => (
                <tr key={student.id}>
                  <th scope="row"><a className="row-name" href={"#" + studentPath(student.id, services[0].id)}>{student.name}</a></th>
                  <td><ul className="stats-service-list">{services.map((service) => (
                    <li key={service.id}>
                      <a href={"#" + studentPath(student.id, service.id)}>
                        <span className={"stage-pill " + service.phase}>{phases[service.phase]}</span>
                        <span><ProjectNames names={service.projects.map((id) => projects.get(id) || "项目待补")} fallback="项目待补" /></span>
                        <span className="subtle">{targetCombination(service.targets) || "目标待补"}</span>
                        {service.major && <span>{service.major}</span>}
                        <ChevronRight size={14} aria-hidden="true" />
                      </a>
                    </li>
                  ))}</ul></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="这组暂无学生" />}
        {members.length > pageSize && <PageNav page={current} size={pageSize} total={members.length}
          change={(next) => go(path + (next > 1 ? "?page=" + next : ""))} />}
      </section>
    </div>
  );
}

export default function StatisticsPage({ route }: { route: string }) {
  const { w: { students, services, applications, catalogs }, go } = useSite();
  const [path, query] = route.split("?");
  const [, scopePart, rolePart, ...metricParts] = path.split("/");
  const scope: StatisticsScope = scopePart === "completed" || scopePart === "all" ? scopePart : "active";
  const role: StaffRole = rolePart === "manager" ? "manager" : "teacher";
  const report = useMemo(() => studentStatistics({ students, services, applications, catalogs }, scope, role),
    [students, services, applications, catalogs, scope, role]);
  const metricKey = metricParts.join("/");
  if (metricKey) {
    const selected = report.metrics.get(metricKey);
    if (!selected) return <Empty title="当前范围内没有这个分组" action={<a className="btn" href={"#" + overviewPath(scope, role)}>返回数据统计</a>} />;
    const page = Number(new URLSearchParams(query).get("page"));
    return <StudentRoster metric={selected} scope={scope} role={role} page={Number.isSafeInteger(page) ? page : 1} path={path} catalogs={catalogs} />;
  }
  const href = (m: Metric) => `#statistics/${scope}/${role}/${m.key}`;
  const count = (m: Metric) => (
    <a href={href(m)} className="stats-count" aria-label={m.title + "，" + m.members.size + " 人，查看学生名单"}>{m.members.size}</a>
  );
  const card = (m: Metric, tone?: string) => (
    <a key={m.key} className="stats-card" data-tone={tone} href={href(m)}
      aria-label={m.title + "，" + m.members.size + " 人，查看学生名单"}>
      <span>{m.title}</span><strong>{m.members.size}<small>人</small></strong>
    </a>
  );
  const changeRole = (next: StaffRole) => go(overviewPath(scope, next));
  return (
    <div className="stats-page">
      <PageHead title="数据统计" subtitle="按学生档案去重。点击人数可查看名单和对应服务。"
        actions={<div className="segmented stats-switch" role="group" aria-label="统计范围">
          {(Object.keys(statisticsScopes) as StatisticsScope[]).map((value) =>
            <button type="button" key={value} aria-pressed={scope === value} className={scope === value ? "selected" : ""}
              onClick={() => go(overviewPath(value, role))}>{statisticsScopes[value]}</button>)}
        </div>} />
      <Section title={scope === "completed" ? "结案前学生状况" : "学生状况"}>
        <div className="stats-cards">
          {card(report.total, "total")}
          {[...report.statuses].map(([label, m]) => card(m, label === "暂停中" ? "paused" : undefined))}
        </div>
        <p className="stats-note">{scope === "active" ? "当前在服包含进行中、出愿中和暂停中。"
          : "已完成服务按结案前的学生状况统计。"}同一学生有多份服务时，可以出现在多个分组。</p>
      </Section>
      <div className="stats-grid">
        <Section title="各目标时间的出愿情况">
          {report.targets.length ? (
            <div className="table-scroll"><table className="data-table stats-table stats-targets" aria-label="各目标时间的出愿情况">
              <thead><tr><th scope="col">目标时间</th><th scope="col">目标学生</th><th scope="col">当前出愿中</th><th scope="col">已正式递交</th></tr></thead>
              <tbody>{report.targets.map((row) => <tr key={row.total.key}><th scope="row">{row.label}</th>
                <td>{count(row.total)}</td><td>{count(row.applying)}</td><td>{count(row.submitted)}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty title="当前范围暂无服务" />}
          <p className="stats-note">同一份服务的多个目标月份合为一组。已正式递交按有效学校申请统计，同一学生递交多校计一人。</p>
        </Section>
        <Section title="老师负责人数" action={<StaffSwitch label="负责人数的老师类型" role={role} change={changeRole} />}>
          <div className="table-scroll"><table className="data-table stats-table stats-staff" aria-label={roles[role] + "负责人数"}>
            <thead><tr><th scope="col">{roles[role]}老师</th><th scope="col">总人数</th>
              {report.phaseColumns.map((phase) => <th key={phase} scope="col">{phases[phase]}</th>)}</tr></thead>
            <tbody>{report.staff.map((person) => <tr key={person.id}><th scope="row">{person.name}</th><td>{count(person.total)}</td>
              {report.phaseColumns.map((phase) => <td key={phase}>{count(person.phases.get(phase)!)}</td>)}</tr>)}</tbody>
          </table></div>
        </Section>
      </div>
      <Section title="项目与老师分布" action={<StaffSwitch label="项目分布的老师类型" role={role} change={changeRole} />}>
        <div className="table-scroll" role="region" aria-label="项目与老师分布表格" tabIndex={0}>
          <table className="data-table sticky stats-table stats-matrix" aria-label={roles[role] + "与合同项目的学生人数"}>
            <thead><tr><th scope="col">{roles[role]}老师</th>{report.projects.map((p) => <th key={p.id} scope="col">{p.name}</th>)}<th scope="col">总人数</th></tr></thead>
            <tbody>{report.staff.map((person) => <tr key={person.id}><th scope="row">{person.name}</th>
              {report.projects.map((p) => <td key={p.id}>{count(person.projects.get(p.id)!)}</td>)}<td>{count(person.total)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">项目总人数</th>{report.projects.map((p) => <td key={p.id}>{count(p.total)}</td>)}<td>{count(report.total)}</td></tr></tfoot>
          </table>
        </div>
        <p className="stats-note">一名学生可计入多个合同项目。行、列总人数分别去重。</p>
      </Section>
    </div>
  );
}
