"use client";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  ChevronUp,
  ContactRound,
  FolderInput,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import {
  emptyWorkspace,
  tokyoDay,
  type Account,
  type Workspace,
} from "../../lib/profile/model";
import { defaultFilters, type Filters } from "../../lib/profile/list";
import { mergeWorkspace, type WorkspaceUpdate } from "../../lib/profile/sync";
import { Accounts, CatalogPage } from "./admin";
import { StudentDetail } from "./detail";
import { PasswordEditor } from "./editors";
import { Login } from "./login";
import {
  Brand,
  Dialog,
  Empty,
  ErrorBox,
  request,
  SiteContext,
  type View,
  type WorkspaceWrite,
} from "./ui";
import { Students, Workbench } from "./workbench";
const adminImportsRoute = "admin/imports";
const ImportPage = lazy(() => import("./import-page"));
const RewardsPage = lazy(() => import("./rewards-page"));
const nav = [
  { key: "services", name: "服务工作台", en: "Services", icon: LayoutDashboard },
  { key: "students", name: "学生档案", en: "Students", icon: UsersRound },
  { key: "rewards", name: "奖励结算", en: "Rewards", icon: Wallet },
  { key: "catalogs", name: "业务名册", en: "Catalogs", icon: ContactRound },
  { key: "accounts", name: "账号管理", en: "Accounts", icon: ShieldCheck },
];
export default function Site() {
  const [user, setUser] = useState<Account | null>(null),
    [canSetup, setCan] = useState(false),
    [w, setW] = useState<Workspace>(emptyWorkspace),
    [loaded, setLoaded] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState("");
  const [route, setRoute] = useState("services"),
    [detailList, setDetailList] = useState("students"),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [serviceListPage, setServiceListPage] = useState(1),
    [studentQuery, setStudentQuery] = useState(""),
    [studentListPage, setStudentListPage] = useState(1),
    [view, setView] = useState<View | null>(null),
    [toast, notice] = useState(""),
    [menu, setMenu] = useState(false),
    [profile, setProfile] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const navToggle = useRef<HTMLButtonElement>(null);
  const navClose = useRef<HTMLButtonElement>(null);
  const dismissMenu = useCallback(() => {
    setMenu(false);
    setProfile(false);
    requestAnimationFrame(() => navToggle.current?.focus());
  }, []);
  useEffect(() => {
    if (!menu) return;
    navClose.current?.focus();
    const mobile = window.matchMedia("(max-width: 780px)");
    const resized = () => {
      if (!mobile.matches) setMenu(false);
    };
    mobile.addEventListener("change", resized);
    return () => mobile.removeEventListener("change", resized);
  }, [menu]);
  useEffect(() => {
    if (!menu && !profile) return;
    const outside = (e: PointerEvent) => {
      if (!accountMenu.current?.contains(e.target as Node)) setProfile(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (profile) {
        setProfile(false);
        accountMenu.current?.querySelector("button")?.focus();
      } else {
        dismissMenu();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu, profile, dismissMenu]);
  const cursor = useRef<number | null>(null);
  const session = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);
  const apply = useCallback((update: WorkspaceUpdate, base: number | null, generation: number) => {
    if (session.current !== generation) return;
    // A delayed focus request must not replace a newer edit or another user's workspace.
    const current = cursor.current;
    // A full response to the current cursor can also signal a restored database.
    const reset = update.full && current !== null && base === current && update.cursor < current;
    if (current !== null && update.cursor <= current && !reset) return;
    cursor.current = update.cursor;
    setW((current) => mergeWorkspace(current, update));
    setLoaded(true);
  }, []);
  const refresh = useCallback((): Promise<void> => {
    if (refreshing.current) return refreshing.current;
    const base = cursor.current, generation = session.current;
    const path = base === null ? "workspace?sync=1" : "workspace?since=" + base;
    const task = request<WorkspaceUpdate | Workspace>(path)
      .then((update) => {
        if (session.current !== generation) return;
        if ("cursor" in update) apply(update, base, generation);
        else {
          setW(update);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (refreshing.current === task) refreshing.current = null;
      });
    refreshing.current = task;
    return task;
  }, [apply]);
  const write: WorkspaceWrite = useCallback(async (path, method, data, key) => {
    const base = cursor.current, generation = session.current;
    const result = await request(path, method, data, key, base);
    if (generation !== session.current) throw new Error("登录状态已变更，请重新打开资料");
    if (result.workspace) apply(result.workspace, base, generation);
    else await refresh();
    return result;
  }, [apply, refresh]);
  const clear = useCallback(() => {
    session.current++;
    cursor.current = null;
    refreshing.current = null;
    setChecking(false);
    setUser(null);
    setW(emptyWorkspace);
    setLoaded(false);
    setView(null);
    setMenu(false);
    setProfile(false);
    setCan(false);
    setFilters(defaultFilters);
    setStudentQuery("");
    setStudentListPage(1);
    setServiceListPage(1);
  }, []);
  const access = useCallback(async () => {
    const generation = session.current;
    setError("");
    try {
      const a = await request<{ user: Account | null; canSetup: boolean; workspace?: WorkspaceUpdate }>("access?workspace=1");
      if (session.current !== generation) return;
      setCan(a.canSetup);
      setUser(a.user);
      if (a.workspace) apply(a.workspace, null, generation);
      else if (a.user) await refresh();
    } catch (e) {
      if (session.current === generation) setError((e as Error).message);
    } finally {
      if (session.current === generation) setChecking(false);
    }
  }, [refresh, apply]);
  useEffect(() => {
    void access();
    let lastList = "students";
    const hash = () => {
      if (location.hash === "#imports") {
        window.history.replaceState(window.history.state, "", "#" + adminImportsRoute);
      }
      const path = location.hash.slice(1) || "services";
      const section = path.split("/")[0];
      if (["services", "students", "rewards"].includes(section)) lastList = section;
      if (section === "student" || section === "service") {
        const saved = window.history.state?.profileList;
        if (["services", "students", "rewards"].includes(saved)) lastList = saved;
        else if (section === "service") lastList = "services";
        if (saved !== lastList) {
          window.history.replaceState({ ...window.history.state, profileList: lastList }, "");
        }
        setDetailList(lastList);
      }
      setRoute(path);
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
    if (menu) dismissMenu();
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
  if (checking && !user) return <Empty title="正在打开工作台" />;
  if (!user)
    return <Login canSetup={canSetup} refresh={access} accessError={error} />;
  const [page, id, child, selectedServiceId] = route.split("/"),
    adminImports = route === adminImportsRoute && user.role === "admin",
    studentDetail = page === "student" || page === "service",
    legacyService = page === "service" ? w.services.find((s) => s.id === id) : undefined,
    active = studentDetail ? detailList : page,
    section = nav.find((n) => n.key === active);
  const open = (title: string, node: React.ReactNode, wide = false, anchor?: HTMLButtonElement) => {
    setView({ title, node, wide, anchor });
    setProfile(false);
    setMenu(false);
  };
  const today = tokyoDay();
  return (
    <SiteContext.Provider
      value={{ w, user, refresh, write, open, close: () => setView(null), notice, go }}
    >
      <div className="shell">
        {menu && (
          <button
            className="side-cover"
            aria-label="关闭导航"
            tabIndex={-1}
            onClick={dismissMenu}
          />
        )}
        <aside id="workspace-navigation" className={"sidebar" + (menu ? " shown" : "")}>
          <div className="side-brand">
            <div>
              <Brand />
              <div className="side-caption">学生服务管理</div>
            </div>
            <button
              ref={navClose}
              className="icon mobile"
              aria-label="关闭导航"
              onClick={dismissMenu}
            >
              <X size={18} />
            </button>
          </div>
          <nav aria-label="主导航">
            {nav
              .filter((n) => n.key !== "accounts" || user.role === "admin")
              .map((n) => (
                <button
                  key={n.key}
                  className={
                    (n.key === active ? "active " : "") +
                    (n.key === "catalogs" ? "divider" : "")
                  }
                  aria-current={n.key === active ? "page" : undefined}
                  onClick={() => go(n.key)}
                >
                  <n.icon size={18} />
                  {n.name}
                  <small lang="en" aria-hidden="true">{n.en}</small>
                </button>
              ))}
          </nav>
          <div className="account-menu" ref={accountMenu}>
            <button
              className="member"
              onClick={() => setProfile(!profile)}
              aria-expanded={profile}
            >
              <span className="avatar" aria-hidden="true">{Array.from(user.name)[0]}</span>
              <span className="member-info">
                <b>{user.name}</b>
                <small>{user.role === "admin" ? "管理员" : "普通成员"} · {user.username}</small>
              </span>
              <ChevronUp size={16} />
            </button>
            {profile && (
              <div className="menu-pop">
                {user.role === "admin" && (
                  <button onClick={() => go(adminImportsRoute)}>
                    <FolderInput size={15} />
                    管理后台
                  </button>
                )}
                <button onClick={() => open("修改自己的密码", <PasswordEditor />)}>
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
        </aside>
        <div className="shell-body" inert={menu}>
          <header className={"shell-top" + (page === "services" ? " workbench-top" : "")}>
            <div className="shell-navigation">
              <button
                ref={navToggle}
                className="icon mobile"
                aria-label="打开导航"
                aria-controls="workspace-navigation"
                aria-expanded={menu}
                onClick={() => setMenu(true)}
              >
                <Menu size={20} />
              </button>
              {page !== "services" && (
                <div className={studentDetail ? "breadcrumbs student-crumbs" : "breadcrumbs"}>
                  <span>{adminImports ? "管理后台" : "工作空间"}</span>
                  <ChevronRight size={14} />
                  {studentDetail ? (
                    <>
                      <button className="row-name" onClick={() => go(detailList)}>{section?.name}</button>
                      <ChevronRight size={14} />
                      <b>学生详情</b>
                    </>
                  ) : (
                    <b>{adminImports ? "导入核对" : section?.name || "工作台"}</b>
                  )}
                </div>
              )}
            </div>
            <time className="shell-date small-info" dateTime={today}>
              <CalendarDays size={15} />
              {today.replaceAll("-", "/")}
            </time>
          </header>
          <main className="workspace-main">
            <ErrorBox message={error} />
            {!loaded ? (
              <Empty title="正在读取服务资料" />
            ) : page === "services" ? (
              <Workbench filters={filters} setFilters={setFilters} page={serviceListPage} setPage={setServiceListPage} />
            ) : page === "students" ? (
              <Students q={studentQuery} search={setStudentQuery} page={studentListPage} setPage={setStudentListPage} />
            ) : page === "service" && !legacyService ? (
              <Empty title="找不到这份服务" />
            ) : studentDetail ? (
              <StudentDetail
                key={legacyService?.studentId || id}
                id={legacyService?.studentId || id}
                serviceId={legacyService?.id || (child === "service" ? selectedServiceId : undefined)}
                legacy={page === "service"}
              />
            ) : page === "rewards" ? (
              <Suspense fallback={<Empty title="正在打开奖励结算" />}>
                <RewardsPage />
              </Suspense>
            ) : adminImports ? (
              <Suspense fallback={<Empty title="正在打开管理后台" />}>
                <ImportPage />
              </Suspense>
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
