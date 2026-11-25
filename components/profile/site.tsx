"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ContactRound,
  FolderInput,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import {
  emptyWorkspace,
  type Account,
  type Workspace,
} from "../../lib/profile/model";
import { defaultFilters, type Filters } from "../../lib/profile/list";
import { Accounts, CatalogPage } from "./admin";
import { ServiceDetail, StudentDetail } from "./detail";
import { PasswordEditor } from "./editors";
import { ImportPage } from "./import-page";
import { Login } from "./login";
import {
  Brand,
  Dialog,
  Empty,
  ErrorBox,
  request,
  SiteContext,
  type View,
} from "./ui";
import { Students, Workbench } from "./workbench";
const nav = [
  { key: "services", name: "服务工作台", icon: LayoutDashboard },
  { key: "students", name: "学生档案", icon: UsersRound },
  { key: "imports", name: "导入核对", icon: FolderInput },
  { key: "catalogs", name: "业务名册", icon: ContactRound },
  { key: "accounts", name: "账号管理", icon: ShieldCheck },
];
export default function Site() {
  const [user, setUser] = useState<Account | null>(null),
    [canSetup, setCan] = useState(false),
    [w, setW] = useState<Workspace>(emptyWorkspace),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [route, setRoute] = useState("services"),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [view, setView] = useState<View | null>(null),
    [toast, notice] = useState(""),
    [menu, setMenu] = useState(false),
    [profile, setProfile] = useState(false);
  const refresh = useCallback(async () => {
    const state = await request<Workspace>("workspace");
    setW(state);
    setLoaded(true);
  }, []);
  const clear = useCallback(() => {
    setUser(null);
    setW(emptyWorkspace);
    setLoaded(false);
    setView(null);
    setMenu(false);
    setProfile(false);
    setCan(false);
    setFilters(defaultFilters);
  }, []);
  const access = useCallback(async () => {
    setError("");
    try {
      const a = await request<{ user: Account | null; canSetup: boolean }>(
        "access",
      );
      setCan(a.canSetup);
      setUser(a.user);
      if (a.user) await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh]);
  useEffect(() => {
    void access();
    const hash = () => {
      setRoute(location.hash.slice(1) || "services");
      setMenu(false);
      setProfile(false);
      setView(null);
    };
    hash();
    window.addEventListener("hashchange", hash);
    window.addEventListener("profile-session-expired", clear);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("profile-session-expired", clear);
    };
  }, [access, clear]);
  useEffect(() => {
    if (!user) return;
    const focus = () => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [user, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notice(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  function go(path: string) {
    location.hash = path;
    setMenu(false);
    setProfile(false);
  }
  async function logout() {
    try {
      await request("auth/sign-out", "POST", {});
      clear();
      go("services");
      await access();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!user)
    return <Login canSetup={canSetup} refresh={access} accessError={error} />;
  const [page, id] = route.split("/"),
    active =
      page === "service" ? "services" : page === "student" ? "students" : page,
    section = nav.find((n) => n.key === active);
  const open = (title: string, node: React.ReactNode, wide = false) => {
    setView({ title, node, wide });
    setProfile(false);
  };
  return (
    <SiteContext.Provider
      value={{ w, user, refresh, open, close: () => setView(null), notice, go }}
    >
      <div className="shell">
        {menu && (
          <button
            className="side-cover"
            aria-label="关闭导航"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={"sidebar" + (menu ? " shown" : "")}>
          <div className="side-brand">
            <Brand />
            <button
              className="icon mobile"
              aria-label="关闭导航"
              onClick={() => setMenu(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="side-context">
            <span className="square-icon">
              <GraduationCap size={20} />
            </span>
            <span>
              <b>学生服务管理</b>
              <small>团队工作空间</small>
            </span>
          </div>
          <nav aria-label="主导航">
            {nav
              .filter((n) => n.key !== "accounts" || user.role === "admin")
              .map((n, i) => (
                <button
                  key={n.key}
                  className={
                    (n.key === active ? "active " : "") +
                    (i === 2 ? "divider" : "")
                  }
                  onClick={() => go(n.key)}
                >
                  <n.icon size={18} />
                  {n.name}
                </button>
              ))}
          </nav>
          <div className="side-foot">
            <BookOpen size={15} />
            <span>S-Profile</span>
          </div>
        </aside>
        <div className="shell-body">
          <header className="shell-top">
            <div className="breadcrumbs">
              <button
                className="icon mobile"
                aria-label="打开导航"
                onClick={() => setMenu(true)}
              >
                <Menu size={20} />
              </button>
              <span>工作空间</span>
              <ChevronRight size={14} />
              <b>{section?.name || "工作台"}</b>
              {id && (
                <>
                  <ChevronRight size={14} />
                  <span>详情</span>
                </>
              )}
            </div>
            <div className="account-menu">
              <button
                className="member"
                onClick={() => setProfile(!profile)}
                aria-expanded={profile}
              >
                <span className="avatar">{user.name.slice(-2)}</span>
                <span>{user.name}</span>
                <ChevronDown size={14} />
              </button>
              {profile && (
                <div className="menu-pop">
                  <small>
                    {user.role === "admin" ? "管理员" : "普通成员"} ·{" "}
                    {user.username}
                  </small>
                  <button
                    onClick={() => open("修改自己的密码", <PasswordEditor />)}
                  >
                    <KeyRound size={15} />
                    修改密码
                  </button>
                  <button onClick={logout}>
                    <LogOut size={15} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </header>
          <main className="workspace-main">
            <ErrorBox message={error} />
            {!loaded ? (
              <Empty title="正在读取服务资料" />
            ) : page === "services" ? (
              <Workbench filters={filters} setFilters={setFilters} />
            ) : page === "students" ? (
              <Students />
            ) : page === "student" ? (
              <StudentDetail key={id} id={id} />
            ) : page === "service" ? (
              <ServiceDetail key={id} id={id} />
            ) : page === "imports" ? (
              <ImportPage />
            ) : page === "catalogs" ? (
              <CatalogPage />
            ) : page === "accounts" ? (
              <Accounts />
            ) : (
              <Empty
                title="页面不存在"
                action={
                  <button className="btn" onClick={() => go("services")}>
                    返回工作台
                  </button>
                }
              />
            )}
          </main>
        </div>
      </div>
      {view && <Dialog view={view} close={() => setView(null)} />}{" "}
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </SiteContext.Provider>
  );
}
