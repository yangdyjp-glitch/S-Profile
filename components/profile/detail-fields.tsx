"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  catalogOptionLabel, choices, hasLaterTargets, intakeLabel, labelOf, languageStatus, requiresActiveStatus,
  type Row, type Service, type Student,
} from "../../lib/profile/model";
import { ActionEditor, ServiceEditor, StudentEditor } from "./editors";
import { ProjectNames } from "./project-names";
import { ApiError, trackFieldAnchor, useSite, type Fact, type FieldAnchor } from "./ui";

type ServiceField = "major" | "projects" | "original" | "targets" | "channel" | "teacher"
  | "status" | "collection" | "production" | "progress" | "risk" | "publication";
type Source = { student: Student; field: "location" | "manager" | "language" } | { service: Service; field: ServiceField };
type EditContent = (dismiss: () => void) => ReactNode;
type Editor = { anchor: FieldAnchor; label: string; content: EditContent; scope: string; sequence: number };

const FieldContext = createContext<{
  activeId?: string;
  open: (anchor: FieldAnchor, label: string, content: EditContent) => void;
  dismiss: () => void;
} | null>(null);

function FieldPanel({ editor, dismiss }: { editor: Editor; dismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = ref.current!;
    const stop = trackFieldAnchor(panel, editor.anchor);
    const control = panel.querySelector<HTMLElement>("textarea, select, input:checked")
      ?? panel.querySelector<HTMLElement>("input") ?? panel.querySelector<HTMLElement>("button");
    control?.focus({ preventScroll: true });
    return stop;
  }, [editor]);
  return createPortal(
    <div ref={ref} id={editor.anchor.id + "-editor"} className="detail-field-panel"
      role="group" aria-label={editor.label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          dismiss();
        }
      }}>
      {editor.content(dismiss)}
    </div>, document.body,
  );
}

export function DetailFields({ scope, children }: { scope: string; children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const active = editor?.scope === scope ? editor : null;
  useEffect(() => { setEditor(null); }, [scope]);
  const dismiss = () => {
    setEditor(null);
    active?.anchor.focus({ preventScroll: true });
  };
  return (
    <FieldContext.Provider value={{
      activeId: active?.anchor.id, dismiss,
      open: (anchor, label, content) => setEditor((old) => ({
        anchor, label, content, scope, sequence: (old?.sequence ?? 0) + 1,
      })),
    }}>
      {children}
      {active && <FieldPanel key={active.sequence} editor={active} dismiss={dismiss} />}
    </FieldContext.Provider>
  );
}

export const detailControlId = (row: Row, field: string) => "detail-" + row.id + "-" + field;
export function editableFact(label: string, source: Source): Fact {
  return [label, <DetailValue {...source} label={label} />,
    detailControlId("service" in source ? source.service : source.student, source.field)];
}

export function DetailValue(props: Source & { label: string; describedBy?: string }) {
  const { w, write, refresh, notice } = useSite();
  const panel = useContext(FieldContext)!;
  const [pending, setPending] = useState<string | null>(null);
  const { field, label } = props;
  const service = "service" in props ? props.service : undefined;
  const row = "service" in props ? props.service : props.student;
  const id = detailControlId(row, field);
  const expanded = panel.activeId === id;

  function editButton(content: ReactNode, editor: EditContent) {
    return <button id={id} type="button" className="detail-field-value" aria-label={label}
      aria-description={typeof content === "string" ? content : undefined}
      aria-describedby={props.describedBy} aria-expanded={expanded} aria-controls={expanded ? id + "-editor" : undefined}
      onClick={(event) => expanded ? panel.dismiss() : panel.open(event.currentTarget, label, editor)}>
      {content}
    </button>;
  }
  if (props.field === "language") {
    return editButton(languageStatus(props.student),
      (dismiss) => <StudentEditor old={props.student} field="language" onDismiss={dismiss} />);
  }
  if (service && (field === "major" || field === "projects" || field === "original" || field === "targets")) {
    let content: ReactNode = service.major || "待补";
    if (field === "projects") content = <ProjectNames names={service.projects.map((p) => labelOf(w.catalogs, p))} fallback="合同项目待补" />;
    if (field === "original" || field === "targets") content = service[field].length
      ? service[field].map((month, index) => <span key={month} className="intake-month">{index > 0 && "、"}{intakeLabel(month)}</span>)
      : "待补";
    return editButton(content, (dismiss) => <ServiceEditor old={service} field={field} onDismiss={dismiss} />);
  }

  const stored = "service" in props ? props.service[props.field] : props.student[props.field];
  const saved = typeof stored === "string" ? stored : "";
  const value = pending ?? saved;
  const optional = field === "manager" || field === "teacher" || !!row.missing?.includes(field);
  const placeholder = field === "manager" ? "学管待分配" : field === "teacher" ? "教务待分配" : "待补";
  let options: [string, string][] = [];
  if (field === "manager" || field === "teacher" || field === "channel") {
    options = w.catalogs.filter((c) => c.kind === field && (c.active || c.id === saved))
      .map((c) => [c.id, catalogOptionLabel(c)]);
  } else if (field === "status" && service?.phase === "completed") {
    options = [["reopen", "撤回结案后修改"]];
  } else if (field in choices) {
    options = choices[field as keyof typeof choices].map((v) => [v, v]);
  }
  const display = options.find(([v]) => v === value)?.[1] || value || placeholder;

  async function choose(next: string, anchor: HTMLSelectElement) {
    if (pending !== null || next === saved) return;
    if (service && field === "status") {
      if (service.phase === "paused" || service.phase === "completed") {
        const action = service.phase === "paused" ? "resume" : "reopen";
        panel.open(anchor, label, (dismiss) => <ActionEditor s={service} action={action} resumeStatus={next} onDismiss={dismiss} />);
        return;
      }
      if (next === "延期" && !hasLaterTargets(service.original, service.targets)) {
        panel.open(anchor, label, (dismiss) => <ServiceEditor old={service} field="statusTargets" initialStatus={next} onDismiss={dismiss} />);
        return;
      }
    }
    if (service && field === "progress" && (service.phase === "progress" || service.phase === "applying") &&
        service.status === "未开始" && requiresActiveStatus(next)) {
      panel.open(anchor, label, (dismiss) => <ServiceEditor old={service} progressChange={{ value: next, dismiss }} />);
      return;
    }
    if (expanded) panel.dismiss();
    setPending(next);
    try {
      await write((service ? "services/" : "students/") + row.id, "PATCH", { [field]: next, expectedVersion: row.version });
      notice(label + "已保存");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "连接中断，请核对保存结果后重试";
      notice(label + " · " + message);
      await refresh().catch(() => notice(message + "。请刷新页面后重试。"));
    } finally { setPending(null); }
  }
  return (
    <span className="detail-field-value detail-field-choice">
      <span aria-hidden="true">{display}</span>
      <select id={id} name={field} aria-label={label} className="cell-select" value={value}
        disabled={pending !== null} aria-busy={pending !== null}
        onChange={(event) => void choose(event.currentTarget.value, event.currentTarget)}>
        <option value="" disabled={!optional || (field === "status" && service?.phase === "completed")}>{placeholder}</option>
        {value && !options.some(([v]) => v === value) && <option value={value} disabled>{display}</option>}
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </span>
  );
}
