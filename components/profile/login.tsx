"use client";
import { useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { passwordLength, phases } from "../../lib/profile/model";
import { profilePath } from "../../lib/profile/portal";
import { Brand, ErrorBox, request } from "./ui";

export function Login({
  canSetup,
  refresh,
  accessError,
}: {
  canSetup: boolean;
  refresh: () => Promise<void>;
  accessError: string;
}) {
  const [setup, setSetup] = useState(false),
    [ticket, setTicket] = useState(""),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [show, setShow] = useState(false),
    [remember, setRemember] = useState(true),
    [help, setHelp] = useState(false),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  async function start() {
    setErr("");
    try {
      const v = await request("setup/ticket", "POST", {});
      setTicket(v.ticket);
      setSetup(true);
      setHelp(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      if (setup) {
        await request("setup/complete", "POST", {
          ticket,
          name,
          username,
          password,
        });
        setSetup(false);
      }
      await request("auth/sign-in/username", "POST", {
        username,
        password,
        rememberMe: remember,
      });
      setPassword("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header className="public-header">
        <div className="public-header-inner">
          <div className="brand-lock">
            <Brand />
            <span className="brand-sub">学生服务管理</span>
          </div>
          <span className="internal">
            <ShieldCheck size={16} />
            团队成员入口
          </span>
        </div>
      </header>
      <main className="login-main">
        <div className="login-feature">
          <div className="campus-photo">
            <img src={profilePath("/campus.webp")} alt="秋日银杏环绕的大学校园与钟楼" />
            <div className="photo-shade" />
          </div>
          <div className="feature-copy">
            <h1>学生服务工作台</h1>
            <p>集中管理学生档案、学校申请与跟进记录。</p>
            <ul className="phase-track" aria-label="服务阶段">
              {Object.values(phases).map((phase) => (
                <li key={phase}>{phase}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="login-form-wrap">
          <div className="login-form">
            <span className="login-symbol">
              {setup ? <KeyRound /> : <LockKeyhole />}
            </span>
            <h2>{setup ? "设置首位管理员" : "成员登录"}</h2>
            <p className="login-lede">
              {setup
                ? "设置姓名和登录凭据，完成后即可建立团队账号。"
                : "使用团队分配的账号，进入学生服务工作台。"}
            </p>
            <form onSubmit={submit} className="form-stack">
              {setup && (
                <label className="field">
                  <span>显示姓名</span>
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="输入你的姓名"
                  />
                </label>
              )}
              <label className="field">
                <span>用户名</span>
                <div className="input-icon">
                  <UserRound size={18} />
                  <input
                    name="username"
                    autoComplete="username"
                    placeholder={
                      setup ? "3–40 位字母、数字、点或下划线" : "输入用户名"
                    }
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span>密码</span>
                <div className="input-icon">
                  <KeyRound size={18} />
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete={setup ? "new-password" : "current-password"}
                    minLength={setup ? passwordLength.min : undefined}
                    placeholder={setup ? `至少 ${passwordLength.min} 个字符` : "输入密码"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="eye"
                    aria-label={show ? "隐藏密码" : "显示密码"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {!setup && (
                <div className="login-options">
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    保持登录
                  </label>
                  <button
                    type="button"
                    className="link"
                    aria-expanded={help}
                    onClick={() => setHelp(!help)}
                  >
                    忘记密码？
                  </button>
                </div>
              )}
              {help && (
                <p className="context-note">
                  请联系团队管理员重置密码，再使用新密码登录。
                </p>
              )}
              <ErrorBox message={err || accessError} />
              <button
                type="submit"
                className="btn primary login-submit"
                disabled={busy}
              >
                {setup ? <Check size={18} /> : <LogIn size={18} />}{" "}
                {busy ? "正在处理…" : setup ? "建立管理员并登录" : "登录工作台"}
              </button>
            </form>
            {canSetup && (
              <div className="first-use">
                {setup ? (
                  <button
                    className="link"
                    onClick={() => {
                      setSetup(false);
                      setErr("");
                    }}
                  >
                    返回成员登录
                  </button>
                ) : (
                  <>
                    <span>首次使用此站点？</span>
                    <button className="link" onClick={start}>
                      设置管理员
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="public-footer">
        <span>
          <BookOpen size={15} /> S-Profile 学生服务管理
        </span>
        <span>
          <Clock3 size={15} /> 日本标准时间 · UTC+9
        </span>
      </footer>
    </div>
  );
}
