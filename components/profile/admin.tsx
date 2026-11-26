"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { catalogs, type Account, type Catalog, type Kind } from "../../lib/profile/model";
import { CatalogEditor } from "./editors";
import {
  ApiError,
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
function DeleteCatalog({ item }: { item: Catalog }) {
  const { refresh } = useSite();
  return (
    <FormShell
      submit="确认删除"
      successMessage="名册项已删除"
      save={async (_, key, write) => {
        try {
          return await write(
            "catalogs/" + item.kind + "/" + item.id,
            "DELETE",
            { expectedVersion: item.version },
            key,
          );
        } catch (e) {
          if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
            await refresh();
            throw new Error("该条目已变更，请关闭窗口后从最新名册重新选择。");
          }
          throw e;
        }
      }}
    >
      <p>确认从{catalogs[item.kind]}名册删除「<strong>{item.name}</strong>」？</p>
      <p>此项会从新增资料的选项中移除。已有档案和奖励记录会保留原名称。</p>
    </FormShell>
  );
}
export function CatalogPage() {
  const { w, open } = useSite(),
    [kind, setKind] = useState<Kind>("channel"),
    [q, setQ] = useState("");
  const items = w.catalogs
    .filter(
      (c) =>
        !c.deleted && c.kind === kind &&
        [c.name, ...c.aliases].some((n) => n.includes(q)),
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
                      <span className={"tag " + (c.active ? "positive" : "")}>
                        {c.active ? "启用" : "停用"}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="row-action edit"
                          onClick={() =>
                            open("编辑" + catalogs[kind], <CatalogEditor kind={kind} old={c} />)
                          }
                        >
                          编辑
                        </button>
                        <button
                          className="row-action deactivate"
                          aria-label={"删除" + catalogs[kind] + "「" + c.name + "」"}
                          onClick={() =>
                            open("删除" + catalogs[kind], <DeleteCatalog item={c} />)
                          }
                        >
                          删除
                        </button>
                      </div>
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
  const { open, user } = useSite(),
    [rows, setRows] = useState<Account[]>([]),
    [error, setError] = useState("");
  const load = useCallback(() =>
    request<Account[]>("admin/users")
      .then(setRows)
      .catch((e) => setError(e.message)), []);
  useEffect(() => {
    if (user.role !== "admin") return;
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [user.role, load]);
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
        <table className="data-table accounts-table">
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
                  <span className={"tag " + (a.banned ? "" : "positive")}>
                    {a.banned ? "停用" : "启用"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="row-action edit" onClick={() => edit("reset", a)}>
                      重置密码
                    </button>
                    {a.id !== user.id && (
                      <button
                        className={"row-action " + (a.banned ? "confirm" : "deactivate")}
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
