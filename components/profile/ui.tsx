"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, ClipboardList, LoaderCircle, Plus, X } from "lucide-react";
import { projectLevel, ProjectNames } from "./project-names";
import {
  catalogOptionLabel,
  catalogs,
  labelOf,
  labels,
  phases,
  type Account,
  type Catalog,
  type Kind,
  type Workspace,
} from "../../lib/profile/model";
export type Values = Record<string, any>;
export type View = { title: string; node: ReactNode; wide?: boolean; anchor?: HTMLButtonElement };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public latest?: Values,
  ) {
    super(message);
  }
}
let ownerSetupKey = "";
export function setOwnerSetupKey(key: string) {
  ownerSetupKey = key;
}
export async function request<T = any>(
  url: string,
  method = "GET",
  data?: unknown,
  key?: string,
  since?: number | null,
): Promise<T> {
  const headers = new Headers();
  if (data !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", key || crypto.randomUUID());
  }
  if (since != null) headers.set("X-Workspace-Since", String(since));
  if (ownerSetupKey && (url.split("?")[0] === "access" || url.startsWith("setup/"))) {
    headers.set("X-S-Profile-Setup", ownerSetupKey);
  }
  const r = await fetch("/api/" + url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const v: any = await r.json().catch(() => ({ message: "服务器响应异常" }));
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith("auth/"))
      window.dispatchEvent(new Event("profile-session-expired"));
    throw new ApiError(v.message || "请求未完成", r.status, v.latest);
  }
  if (url === "setup/complete") ownerSetupKey = "";
  return v as T;
}
export type WorkspaceWrite = (path: string, method: string, data: unknown, key?: string) => Promise<Values>;
export const SiteContext = createContext<{
  w: Workspace;
  user: Account;
  refresh: () => Promise<void>;
  write: WorkspaceWrite;
  open: (title: string, node: ReactNode, wide?: boolean, anchor?: HTMLButtonElement) => void;
  close: () => void;
  notice: (s: string) => void;
  go: (path: string) => void;
}>({} as any);
export const useSite = () => useContext(SiteContext);
export function studentPath(studentId: string, serviceId?: string) {
  return "student/" + studentId + (serviceId ? "/service/" + serviceId : "");
}
export function Brand() {
  return (
    <div className="brand">
      <img className="brand-mark" src="/favicon.svg" width="38" height="38" alt="" />
      <span>S-Profile</span>
    </div>
  );
}
export function Dialog({ view, close }: { view: View; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const anchor = view.anchor;
    if (!anchor) return () => d.close();

    const position = () => {
      const { left, top, bottom } = anchor.getBoundingClientRect();
      const margin = 8;
      const maxLeft = window.innerWidth - d.offsetWidth - margin;
      const maxTop = window.innerHeight - d.offsetHeight - margin;
      const above = top - d.offsetHeight - margin;
      const y = bottom + margin > maxTop && above >= margin ? above : bottom + margin;
      d.style.setProperty("--cell-left", Math.max(margin, Math.min(left, maxLeft)) + "px");
      d.style.setProperty("--cell-top", Math.max(margin, Math.min(y, maxTop)) + "px");
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(d);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const input = d.querySelector<HTMLElement>("textarea") ??
      d.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled)");
    input?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      d.close();
    };
  }, [view.anchor]);
  return (
    <dialog
      ref={ref}
      className={"dialog" + (view.wide ? " wide" : "") + (view.anchor ? " cell-dialog" : "")}
      aria-labelledby={label}
      closedby="closerequest"
      onCancel={close}
    >
      <header>
        <h2 id={label}>{view.title}</h2>
        <button
          type="button"
          className="icon"
          aria-label="关闭"
          onClick={close}
        >
          <X size={19} />
        </button>
      </header>
      {view.node}
    </dialog>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <ClipboardList size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export const ErrorBox = ({ message }: { message: string }) =>
  message ? (
    <p role="alert" className="error-box">
      {message}
    </p>
  ) : null;
export function FormShell({
  children,
  save,
  submit = "保存",
  unchanged = false,
  successMessage = "已保存",
  sources = [],
  after,
  onDismiss,
}: {
  children: ReactNode;
  save: (versions: Values, key: string, write: WorkspaceWrite) => Promise<any>;
  submit?: string;
  unchanged?: boolean;
  successMessage?: string;
  sources?: { path: string; row: Values; key: string }[];
  after?: (r: any) => void;
  onDismiss?: () => void;
}) {
  const { write, close, notice, w } = useSite();
  const dismiss = onDismiss ?? close;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [versions, setVersions] = useState<Values>({}),
    [latest, setLatest] = useState<Values[] | null>(null);
  const pending = useRef<{ payload: string; key: string } | null>(null),
    formRef = useRef<HTMLFormElement>(null);
  async function send(ev: FormEvent) {
    ev.preventDefault();
    if (busy || unchanged) return;
    setBusy(true);
    setError("");
    const payload =
      JSON.stringify(Array.from(new FormData(formRef.current!).entries())) +
      JSON.stringify(versions);
    if (pending.current?.payload !== payload)
      pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await save(versions, pending.current!.key, write);
      dismiss();
      notice(successMessage);
      after?.(result);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409 && sources.length) {
        const rows = await Promise.all(
          sources.map((s) => request(s.path)),
        ).catch(() => []);
        if (rows.length) setLatest(rows);
      }
      if (e instanceof ApiError && e.status < 500) pending.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      onSubmit={send}
      onChange={() => {
        pending.current = null;
      }}
    >
      <div className="dialog-body">
        {children}
        <ErrorBox message={error} />
        {latest && (
          <div className="conflict">
            <strong>服务器上的最新版本</strong>
            {latest.map((r, i) => (
              <dl key={r.id} className="facts">
                {Object.keys(r)
                  .filter(
                    (k) =>
                      labels[k] &&
                      JSON.stringify(r[k]) !==
                        JSON.stringify(sources[i].row[k]),
                  )
                  .map((k) => (
                    <div key={k}>
                      <dt>{labels[k]}</dt>
                      <dd>{displayField(k, r[k], w.catalogs)}</dd>
                    </div>
                  ))}
              </dl>
            ))}
            <button
              className="btn"
              type="button"
              onClick={() => {
                setVersions(
                  Object.fromEntries(
                    latest.map((r, i) => [sources[i].key, r.version]),
                  ),
                );
                setLatest(null);
                setError("");
              }}
            >
              已核对，使用最新版本继续编辑
            </button>
          </div>
        )}
      </div>
      <footer className="dialog-foot">
        <button type="button" className="btn" onClick={dismiss}>
          取消
        </button>
        <button className="btn primary" disabled={busy || !!latest || unchanged}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}{" "}
          {submit}
        </button>
      </footer>
    </form>
  );
}
export function display(v: unknown, items: Catalog[]): string {
  if (v === undefined || v === null || v === "") return "待补";
  if (Array.isArray(v))
    return v.map((i) => display(i, items)).join("、") || "待补";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "object") return JSON.stringify(v);
  return labelOf(
    items,
    String(v),
    phases[v as keyof typeof phases] || String(v),
  );
}
export function displayField(key: string, value: unknown, items: Catalog[]): ReactNode {
  if (key === "projects" || key === "project") {
    const ids = Array.isArray(value) ? value : [value];
    return <ProjectNames names={ids.map((id) => display(id, items))} />;
  }
  return display(value, items);
}
export function Field({
  label,
  children,
  required,
  wide,
  hint,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label className={"field" + (wide ? " wide-field" : "")}>
      <span>
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export interface Binder {
  v: Values;
  set: (key: string, value: any) => void;
}
export function useValues(initial: Values): Binder {
  const [v, change] = useState<Values>(initial);
  return {
    v,
    set: (key, value) => change((old) => Object.is(old[key], value) ? old : { ...old, [key]: value }),
  };
}
export function Text({
  b,
  k,
  required = false,
  type = "text",
  title,
  wide = false,
  hint,
  disabled = false,
  placeholder,
  minLength,
}: {
  b: Binder;
  k: string;
  required?: boolean;
  type?: string;
  title?: string;
  wide?: boolean;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  minLength?: number;
}) {
  const common = {
    name: k,
    required,
    disabled,
    value: b.v[k] ?? "",
    placeholder,
    minLength,
    onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      b.set(k, e.currentTarget.value),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      b.set(k, e.currentTarget.value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      b.set(k, e.target.value),
  };
  return (
    <Field
      label={title || labels[k] || k}
      required={required}
      wide={wide}
      hint={hint}
    >
      {type === "area" ? (
        <textarea {...common} rows={3} />
      ) : (
        <input
          {...common}
          type={type}
          step={type === "number" ? "any" : undefined}
          min={type === "number" ? "0" : undefined}
        />
      )}
    </Field>
  );
}
export type Option = string | readonly [string, string];
export function Select({
  b,
  k,
  items,
  required = false,
  title,
  placeholder = "请选择",
  disabled = false,
  autoFocus = false,
}: {
  b: Binder;
  k: string;
  items: Option[];
  required?: boolean;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Field label={title || labels[k] || k} required={required}>
      <select
        name={k}
        required={required}
        value={b.v[k] ?? ""}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => b.set(k, e.target.value)}
      >
        <option value="">{placeholder}</option>
        {items.map((o) => {
          const [value, name] = typeof o === "string" ? [o, o] : o;
          return (
            <option key={value} value={value}>
              {name}
            </option>
          );
        })}
      </select>
    </Field>
  );
}
export function CatalogField({
  b,
  k,
  kind,
  required = false,
  multiple = false,
  editable = false,
}: {
  b: Binder;
  k: string;
  kind: Kind;
  required?: boolean;
  multiple?: boolean;
  editable?: boolean;
}) {
  const { w, write } = useSite(),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = multiple ? b.v[k] || [] : [b.v[k]],
    items = w.catalogs.filter(
      (c) => c.kind === kind && (c.active || selected.includes(c.id)),
    );
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await write("catalogs/" + kind, "POST", { name });
      b.set(k, multiple ? [...selected, r.id] : r.id);
      setAdding(false);
      setName("");
      setSearch(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={"field" + (multiple ? " wide-field" : "")}>
      <div className="field-label">
        {labels[k] || catalogs[kind]}
        {required && <b> *</b>}
        {editable && (
          <button
            type="button"
            className="link mini"
            onClick={() => {
              setAdding(!adding);
              setName(query);
            }}
          >
            <Plus size={13} />
            新增
          </button>
        )}
      </div>
      {multiple ? (
        <div className="check-group">
          {items.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  b.set(
                    k,
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((v: string) => v !== c.id),
                  )
                }
              />
              <span data-project-level={kind === "project" ? projectLevel(c.name) : undefined}>{catalogOptionLabel(c)}</span>
            </label>
          ))}
        </div>
      ) : kind === "school" ? (
        <div className="school-picker">
          <input
            aria-label="学校名称"
            placeholder="输入校名或简称"
            value={search ? query : labelOf(w.catalogs, b.v[k], "")}
            onFocus={() => {
              setQuery("");
              setSearch(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              b.set(k, "");
            }}
          />
          {search && (
            <div className="suggest">
              {items
                .filter((c) =>
                  [c.name, ...c.aliases].some((v) => v.includes(query)),
                )
                .slice(0, 40)
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      b.set(k, c.id);
                      setSearch(false);
                    }}
                  >
                    {catalogOptionLabel(c)}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => {
                  setName(query);
                  setAdding(true);
                  setSearch(false);
                }}
              >
                新增学校{query ? "「" + query + "」" : ""}
              </button>
            </div>
          )}
        </div>
      ) : (
        <select
          aria-label={labels[k] || catalogs[kind]}
          name={k}
          data-project-level={kind === "project" ? projectLevel(labelOf(items, b.v[k], "")) : undefined}
          required={required}
          value={b.v[k] || ""}
          onChange={(e) => b.set(k, e.target.value)}
        >
          <option value="">{required ? "请选择" : "待分配"}</option>
          {items.map((c) => (
            <option value={c.id} key={c.id} data-project-level={kind === "project" ? projectLevel(c.name) : undefined}>
              {catalogOptionLabel(c)}
            </option>
          ))}
        </select>
      )}
      {adding && (
        <div className="inline-add">
          <input
            aria-label={"新的" + catalogs[kind] + "名称"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={"新的" + catalogs[kind] + "名称"}
          />
          <button className="btn" disabled={busy} type="button" onClick={add}>
            添加
          </button>
        </div>
      )}
      <ErrorBox message={err} />
    </div>
  );
}
export function Months({
  b,
  k,
  required = false,
  disabled = false,
}: {
  b: Binder;
  k: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const values: string[] = b.v[k] || [],
    [value, choose] = useState(""),
    [hint, setHint] = useState("");
  return (
    <div className="field wide-field">
      <span>
        {labels[k]}
        {required && <b> *</b>}
      </span>
      <div className="chips">
        {values.map((v) => (
          <span className="chip" key={v}>
            {v}
            {!disabled && (
              <button
                type="button"
                aria-label={"移除 " + v}
                onClick={() =>
                  b.set(
                    k,
                    values.filter((x) => x !== v),
                  )
                }
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="inline-add">
          <input
            type="month"
            value={value}
            aria-label={labels[k]}
            onInput={(e) => choose(e.currentTarget.value)}
            onBlur={(e) => choose(e.currentTarget.value)}
            onChange={(e) => {
              choose(e.target.value);
              setHint("");
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!/^\d{4}-(04|10)$/.test(value)) {
                setHint("请选择 4 月或 10 月的入学批次");
                return;
              }
              b.set(k, [...new Set([...values, value])].sort());
              choose("");
            }}
          >
            添加批次
          </button>
        </div>
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function TargetMonths({ b, required = false }: { b: Binder; required?: boolean }) {
  const targets: string[] = b.v.targets;
  const rows = targets.length ? targets : [""];
  return (
    <div className="field wide-field" role="group" aria-label={labels.targets}>
      <div className="field-label">
        {labels.targets}{required && <b aria-hidden="true"> *</b>}
        <button type="button" className="link mini" disabled={rows.includes("")}
          onClick={() => b.set("targets", [...targets, ""])}>
          <Plus size={13} />添加批次
        </button>
      </div>
      {rows.map((month, index) => (
        <div className="inline-add" key={index}>
          <input type="month" name="targets" aria-label={labels.targets + " " + (index + 1)}
            min="1000-04" max="9999-10" step={6} value={month}
            required={required && !rows.some(Boolean) && index === 0}
            onChange={(e) => b.set("targets", rows.map((v, i) => i === index ? e.currentTarget.value : v))} />
          {(month || rows.length > 1) && (
            <button type="button" className="icon" aria-label={"移除批次 " + (month || (index + 1))}
              onClick={() => b.set("targets", rows.filter((_, i) => i !== index))}>
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      <small>可选 4 月或 10 月</small>
    </div>
  );
}
export function Toggle({
  b,
  k,
  title,
}: {
  b: Binder;
  k: string;
  title: string;
}) {
  return (
    <label className="checkbox-line">
      <input
        name={k}
        type="checkbox"
        checked={!!b.v[k]}
        onChange={(e) => b.set(k, e.target.checked)}
      />
      {title}
    </label>
  );
}
export const changed = (
  old: Values | undefined,
  next: Values,
  keys: string[],
) =>
  Object.fromEntries(
    keys
      .filter((k) => !old || JSON.stringify(old[k]) !== JSON.stringify(next[k]))
      .map((k) => [k, next[k]]),
  );
export function Section({
  title,
  children,
  action,
  nested = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  nested?: boolean;
}) {
  const Heading = nested ? "h3" : "h2";
  return (
    <section className={nested ? "panel-subsection" : "panel"}>
      <div className="panel-title">
        <Heading>{title}</Heading>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Facts({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {values.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || "待补"}</dd>
        </div>
      ))}
    </dl>
  );
}
