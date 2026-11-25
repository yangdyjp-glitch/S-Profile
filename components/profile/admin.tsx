"use client";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { catalogs, type Account, type Kind } from "../../lib/profile/model";
import { CatalogEditor } from "./editors";
import {
  Empty,
  ErrorBox,
  FormShell,
  request,
  Select,
  Text,
  useSite,
  useValues,
} from "./ui";
import { PageHead } from "./workbench";
export function CatalogPage() {
  const { w, open } = useSite(),
    [kind, setKind] = useState<Kind>("channel"),
    [q, setQ] = useState("");
  const items = w.catalogs
    .filter(
      (c) =>
        c.kind === kind && [c.name, ...c.aliases].some((n) => n.includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
  return (
    <>
      <PageHead
        title="业务名册"
        subtitle="维护团队使用的渠道、人员、合同项目和学校名称。"
        actions={
          <button
            className="btn primary"
            onClick={() =>
              open("新增" + catalogs[kind], <CatalogEditor kind={kind} />)
            }
          >
            <Plus size={16} />
            新增{catalogs[kind]}
          </button>
        }
      />
      <nav className="tabs">
        {Object.entries(catalogs).map(([k, v]) => (
          <button
            key={k}
            className={k === kind ? "active" : ""}
            onClick={() => {
              setKind(k as Kind);
              setQ("");
            }}
          >
            {v}
          </button>
        ))}
      </nav>
      <div className="panel">
        <div className="toolbar">
          <div className="input-icon search">
            <Search size={16} />
            <input
              aria-label="搜索名册"
              placeholder={"搜索" + catalogs[kind] + "名称"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{catalogs[kind]}名称</th>
                  {kind === "school" && <th>别名</th>}
                  <th>使用情况</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {kind === "school" && (
                      <td>{c.aliases.join("、") || "—"}</td>
                    )}
                    <td>
                      <span className={"tag " + (c.active ? "green" : "")}>
                        {c.active ? "启用" : "停用"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() =>
                          open(
                            "编辑" + catalogs[kind],
                            <CatalogEditor kind={kind} old={c} />,
                          )
                        }
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={"暂无匹配的" + catalogs[kind]} />
        )}
      </div>
    </>
  );
}
function UserEditor({
  account,
  action,
  done,
}: {
  account?: Account;
  action: string;
  done: () => void;
}) {
  const b = useValues({ name: "", username: "", password: "", role: "user" });
  return (
    <FormShell
      submit={
        action === "disable"
          ? "确认停用"
          : action === "reset"
            ? "重置密码"
            : "保存"
      }
      after={done}
      save={() =>
        request(
          "admin/users" + (account ? "/" + account.id : ""),
          account ? "PATCH" : "POST",
          { ...b.v, action },
        )
      }
    >
      {action === "create" ? (
        <div className="form-stack">
          <Text b={b} k="name" title="显示姓名" required />
          <Text
            b={b}
            k="username"
            title="用户名"
            hint="3–40 位字母、数字、点或下划线"
            required
          />
          <Text
            b={b}
            k="password"
            type="password"
            title="初始密码（至少 10 位）"
            required
          />
          <Select
            b={b}
            k="role"
            title="权限"
            items={[
              ["user", "普通成员"],
              ["admin", "管理员"],
            ]}
          />
        </div>
      ) : action === "reset" ? (
        <Text
          b={b}
          k="password"
          type="password"
          title={"为 " + account?.name + " 设置新密码（至少 10 位）"}
          required
        />
      ) : (
        <p>
          {action === "disable"
            ? "停用后该成员将退出所有会话，历史操作保留。"
            : "恢复此账号后，成员可以重新登录。"}
        </p>
      )}
    </FormShell>
  );
}
export function Accounts() {
  const { open, user, w } = useSite(),
    [rows, setRows] = useState<Account[]>([]),
    [error, setError] = useState("");
  const load = () =>
    request<Account[]>("admin/users")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (user.role === "admin") void load();
  }, [user.role, w]);
  if (user.role !== "admin") return <Empty title="账号管理仅向管理员开放" />;
  const edit = (action: string, account?: Account) =>
    open(
      (
        {
          create: "新建团队账号",
          reset: "重置成员密码",
          disable: "停用账号",
          enable: "启用账号",
        } as Record<string, string>
      )[action],
      <UserEditor action={action} account={account} done={load} />,
    );
  return (
    <>
      <PageHead
        title="账号管理"
        subtitle="创建团队登录账号，管理访问权限和密码。"
        actions={
          <button className="btn primary" onClick={() => edit("create")}>
            <Plus size={16} />
            新建账号
          </button>
        }
      />
      <ErrorBox message={error} />
      <div className="panel table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {["成员", "用户名", "权限", "状态", "操作"].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.username}</td>
                <td>{a.role === "admin" ? "管理员" : "普通成员"}</td>
                <td>
                  <span className={"tag " + (a.banned ? "" : "green")}>
                    {a.banned ? "停用" : "启用"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="link" onClick={() => edit("reset", a)}>
                      重置密码
                    </button>
                    {a.id !== user.id && (
                      <button
                        className="link muted"
                        onClick={() => edit(a.banned ? "enable" : "disable", a)}
                      >
                        {a.banned ? "启用" : "停用"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
