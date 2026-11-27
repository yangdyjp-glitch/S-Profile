"use client";
import { useMemo, useState } from "react";
import { phases, roles } from "../../lib/profile/model";
import { RewardEditor } from "./editors";
import { Empty, useSite } from "./ui";
import { PageHead, PageNav, SearchBox } from "./workbench";

const rewardRoles = ["teacher", "manager"] as const;
const pageSize = 24;
const byName = new Intl.Collator("zh-CN");

export default function RewardsPage() {
  const { w, open, go } = useSite();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("all");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const students = new Map(w.students.map((s) => [s.id, s]));
    const names = new Map(w.catalogs.map((c) => [c.id, c.name]));
    return w.services.map((service) => {
      const student = students.get(service.studentId);
      const rewards = rewardRoles.map((role) => {
        const saved = service.rewards[role];
        const assigned = role === "teacher" ? service.teacher : student?.manager;
        const recipientId = saved?.recipient || assigned;
        return {
          role,
          recipient: names.get(recipientId || "") || "",
          otherAssignee: recipientId !== assigned ? names.get(assigned || "") || "待分配" : "",
          confirmed: saved?.confirmed,
          month: saved?.month || "",
        };
      });
      return {
        service,
        studentName: student?.name || "姓名待补",
        projects: service.projects.map((id) => names.get(id) || "项目待补").join("、"),
        rewards,
      };
    }).sort((a, b) =>
      byName.compare(a.studentName, b.studentName) || a.service.id.localeCompare(b.service.id)
    );
  }, [w.services, w.students, w.catalogs]);

  const months = useMemo(() => {
    const options = new Set<string>();
    for (const row of rows) {
      for (const reward of row.rewards) {
        if (reward.month) options.add(reward.month);
      }
    }
    // Keep the selected month visible when its last entry moves to another month.
    if (month && month !== "all") options.add(month);
    return [...options].sort().reverse();
  }, [rows, month]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.map((row) => {
      const studentMatches = row.studentName.toLowerCase().includes(term);
      const rewards = row.rewards.map((reward) => {
        const nameMatches = studentMatches || reward.recipient.toLowerCase().includes(term);
        return { ...reward, matches: nameMatches && (month === "all" || reward.month === month) };
      });
      return { ...row, rewards };
    }).filter((row) => row.rewards.some((reward) => reward.matches));
  }, [rows, search, month]);
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));

  return (
    <>
      <PageHead title="奖励结算" />
      <section className="panel" aria-label="奖励结算明细">
        <div className="toolbar rewards-toolbar">
          <SearchBox
            placeholder="搜索学生姓名或奖励归属人"
            value={search}
            change={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <select
            aria-label="按计入工资年月筛选"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部工资年月</option>
            <option value="">工资年月未填写</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className="data-table rewards-table" aria-label="各服务的奖励归属和工资年月">
              <thead>
                <tr>
                  <th scope="col">学生与服务</th>
                  {rewardRoles.map((role) => <th key={role} scope="col">{roles[role]}奖励</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * pageSize, current * pageSize).map(({ service, studentName, projects, rewards }) => (
                  <tr key={service.id}>
                    <td>
                      <div className="actions">
                        <button className="row-name" onClick={() => go("service/" + service.id)}>{studentName}</button>
                        <span className={"stage-pill " + service.phase}>{phases[service.phase]}</span>
                      </div>
                      <small>{projects || "合同项目待补"}{service.major && " · " + service.major}</small>
                      {service.targets.length > 0 && <small>{service.targets.join("、")}</small>}
                    </td>
                    {rewards.map((reward) => {
                      const role = reward.role;
                      const title = roles[role] + "奖励";
                      return (
                        <td key={role}>
                          <span className="reward-role-label" aria-hidden="true">{title}</span>
                          {reward.matches ? (
                            <>
                              <div className="reward-recipient">
                                <strong>{reward.recipient || "待分配"}</strong>
                                <span className={"tag " + (reward.confirmed ? "positive" : "amber")}>
                                  {reward.confirmed ? "已确认归属" : "建议归属"}
                                </span>
                                <button
                                  className="row-action edit"
                                  aria-label={"编辑" + studentName + "的" + title}
                                  onClick={() => open(
                                    [studentName, projects, title + "结算"].filter(Boolean).join(" · "),
                                    <RewardEditor s={service} role={role} />,
                                  )}
                                >
                                  编辑
                                </button>
                              </div>
                              <small>计入工资年月　{reward.month || "未填写"}</small>
                              {reward.otherAssignee && <small>当前{roles[role]}　{reward.otherAssignee}</small>}
                            </>
                          ) : <span className="subtle" aria-label="不符合当前筛选">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={rows.length ? "没有符合条件的奖励记录" : "暂无服务奖励记录"} />
        )}
        <PageNav page={current} total={filtered.length} size={pageSize} change={setPage} />
      </section>
    </>
  );
}
