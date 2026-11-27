"use client";
import {
  catalogOptionLabel,
  choices,
  closureKinds,
  emptyApplication,
  emptyService,
  emptyStudent,
  entryKinds,
  passwordLength,
  phases,
  requiresActiveStatus,
  roles,
  tokyoDay,
  type Application,
  type Catalog,
  type Entry,
  type EntryKind,
  type Kind,
  type Service,
  type Student,
} from "../../lib/profile/model";
import {
  CatalogField,
  changed,
  FormShell,
  Months,
  request,
  Select,
  Text,
  Toggle,
  useSite,
  useValues,
  type Binder,
  type Values,
} from "./ui";
function StudentFields({ b, old }: { b: Binder; old?: Student }) {
  const req = (k: string) => !old?.missing?.includes(k);
  return (
    <div className="form-grid">
      <Text b={b} k="name" required />
      <Text b={b} k="orderMonth" type="month" required={req("orderMonth")} />
      <Select
        b={b}
        k="location"
        items={choices.location}
        required={req("location")}
      />
      <CatalogField b={b} k="manager" kind="manager" />
      <Select
        b={b}
        k="declaration"
        items={choices.declaration}
        required={req("declaration")}
      />
      {b.v.declaration === "已有成绩" && (
        <>
          <Select b={b} k="jlpt" items={choices.jlpt} />
          {["toefl", "ielts", "toeic"].map((k) => (
            <Text type="number" key={k} b={b} k={k} />
          ))}
        </>
      )}
    </div>
  );
}
function studentPayload(v: Values) {
  return v.declaration === "暂无语言成绩"
    ? { ...v, jlpt: "", toefl: "", ielts: "", toeic: "" }
    : v;
}
export function StudentEditor({ old, field }: { old?: Student; field?: "name" | "manager" }) {
  const b = useValues(old || emptyStudent),
    { go } = useSite();
  const updates = changed(old, studentPayload(b.v), field ? [field] : Object.keys(emptyStudent));
  return (
    <FormShell
      unchanged={!!field && !Object.keys(updates).length}
      sources={
        old
          ? [{ path: "students/" + old.id, row: old, key: "expectedVersion" }]
          : []
      }
      save={(vs, key, write) =>
        write(
          old ? "students/" + old.id : "students",
          old ? "PATCH" : "POST",
          {
            ...updates,
            expectedVersion: old?.version,
            ...vs,
          },
          key,
        )
      }
      after={(r) => {
        if (!old) go("student/" + r.id);
      }}
    >
      {field === "name" && <Text b={b} k="name" required />}
      {field === "manager" && <CatalogField b={b} k="manager" kind="manager" />}
      {!field && <StudentFields b={b} old={old} />}
    </FormShell>
  );
}
export type ServiceListField = "major" | "projects" | "status" | "targets" | "teacher" | "progress" | "risk";
type ServiceFormKey = keyof typeof emptyService;
function serviceFormKeys(old: Service | undefined, v: Values, field?: ServiceListField): ServiceFormKey[] {
  const statusFields: ServiceFormKey[] = v.status === "延期" ? ["status", "targets"] : ["status"];
  if (!field) return [
    "channel", "teacher", "projects", "major", "original", ...statusFields,
    "collection", "production", "progress", "risk", "publication", "special", "notes",
  ];
  const active = old?.phase === "progress" || old?.phase === "applying";
  if ((field === "status" || field === "targets") && active) {
    const contractTarget = v.status === "未开始" || v.status === "当期申请";
    return ["status", contractTarget ? "original" : "targets"];
  }
  if (field === "progress" && active && old.status === "未开始" && requiresActiveStatus(v.progress)) {
    return ["progress", ...statusFields];
  }
  return [field];
}
function ServiceField({ b, k, old, quick }: { b: Binder; k: ServiceFormKey; old?: Service; quick: boolean }) {
  const required = !old?.missing?.includes(k);
  switch (k) {
    case "channel":
      return <CatalogField b={b} k={k} kind="channel" required={required} editable />;
    case "teacher":
      return <CatalogField b={b} k={k} kind="teacher" />;
    case "projects":
      return <CatalogField b={b} k={k} kind="project" required={required} multiple editable />;
    case "major":
      return <Text b={b} k={k} type={quick ? "area" : "text"} wide required={required} />;
    case "original":
      return (
        <>
          <Months b={b} k={k} required={required} disabled={!!old?.original.length} />
          {quick && !!old?.original.length && <small>当前目标采用原合同批次。调整到更晚的批次时，请选择“延期”。</small>}
        </>
      );
    case "targets":
      return <Months b={b} k={k} required={required} />;
    case "status":
      return <Select b={b} k={k} required={required}
        disabled={old?.phase === "paused" || old?.phase === "completed"}
        items={old?.status === "暂停中" ? [...choices.status, "暂停中"] : choices.status} />;
    case "special":
    case "notes":
      return <Text b={b} k={k} type="area" wide />;
    default:
      return <Select b={b} k={k} items={choices[k]} required={required}
        title={quick && k === "risk" ? "潜在风险" : undefined} />;
  }
}
function SchoolFields({ b, old }: { b: Binder; old?: Application }) {
  return (
    <div className="form-grid">
      <CatalogField b={b} k="school" kind="school" editable required />
      <CatalogField
        b={b}
        k="project"
        kind="project"
        required={!old?.missing?.includes("project")}
        editable
      />
      <Text b={b} k="program" wide />
      <Text b={b} k="intake" type="month" hint="4 月或 10 月，可待定" />
      <Text b={b} k="deadline" type="date" />
      <Text b={b} k="workMonth" type="month" />
      <div className="wide-field">
        <Toggle b={b} k="admitted" title="已收到正式合格消息" />
      </div>
      {b.v.admitted && (
        <>
          <Text
            b={b}
            k="received"
            type="date"
            required={!old?.missing?.includes("received")}
          />
          <Toggle b={b} k="final" title="列为最终选择" />
          {b.v.final && (
            <>
              <Toggle b={b} k="needsOffer" title="此项目需要教授内诺" />
              {b.v.needsOffer && (
                <Text
                  b={b}
                  k="offer"
                  type="month"
                  required={!old?.missing?.includes("offer")}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function ClosureFields({ b }: { b: Binder }) {
  return (
    <div className="form-grid">
      <Select
        b={b}
        k="kind"
        title="完成情况"
        required
        items={Object.entries(closureKinds)}
      />
      {b.v.kind === "refund" && (
        <Toggle b={b} k="confirmed" title="已确认约定应退款全部退清" />
      )}
      {b.v.kind === "abandoned" && (
        <Toggle b={b} k="confirmed" title="已明确终止服务且不退款" />
      )}
      <Text
        b={b}
        k="note"
        title={b.v.kind === "refund" ? "退款说明" : "结案说明"}
        type="area"
        wide
        required={b.v.kind === "refund"}
      />
    </div>
  );
}
export function ServiceEditor({
  old,
  studentId,
  field,
}: {
  old?: Service;
  studentId?: string;
  field?: ServiceListField;
}) {
  const { w, go } = useSite(),
    b = useValues(old || emptyService),
    st = useValues(emptyStudent),
    mode = useValues({
      mode: studentId ? "existing" : "new",
      studentId: studentId || "",
      phase: "progress",
      reason: "",
    }),
    cl = useValues({ kind: "", note: "", confirmed: false }),
    app = useValues(emptyApplication);
  const needApp =
    !old &&
    (b.v.progress === "完成申请" ||
      (mode.v.phase === "completed" && cl.v.kind === "admission"));
  const keys = serviceFormKeys(old, b.v, field);
  const updates = changed(old, b.v, field ? keys : Object.keys(emptyService));
  return (
    <FormShell
      unchanged={!!field && !Object.keys(updates).length}
      sources={
        old
          ? [{ path: "services/" + old.id, row: old, key: "expectedVersion" }]
          : []
      }
      submit={old ? "保存修改" : "建立服务"}
      after={(r) => {
        if (!old) go("service/" + r.id);
      }}
      save={(vs, key, write) =>
        old
          ? write(
              "services/" + old.id,
              "PATCH",
              {
                ...updates,
                expectedVersion: old.version,
                ...vs,
              },
              key,
            )
          : write(
              "services",
              "POST",
              {
                studentId: mode.v.mode === "existing" ? mode.v.studentId : "",
                student: studentPayload(st.v),
                service: b.v,
                phase: mode.v.phase,
                reason: mode.v.reason,
                closure: cl.v,
                applications: needApp ? [app.v] : [],
              },
              key,
            )
      }
    >
      {!old && (
        <>
          <h3 className="form-head">学生档案</h3>
          <div className="segmented">
            <button
              type="button"
              disabled={!!studentId}
              className={mode.v.mode === "new" ? "selected" : ""}
              onClick={() => mode.set("mode", "new")}
            >
              新学生
            </button>
            <button
              type="button"
              className={mode.v.mode === "existing" ? "selected" : ""}
              onClick={() => mode.set("mode", "existing")}
            >
              已有档案
            </button>
          </div>
          {mode.v.mode === "new" ? (
            <StudentFields b={st} />
          ) : (
            <Select
              b={mode}
              k="studentId"
              title="选择学生"
              required
              items={w.students.map((s) => [s.id, s.name] as const)}
            />
          )}
          <h3 className="form-head">本次服务</h3>
        </>
      )}
      <div className={field ? "form-stack" : "form-grid"}>
        {keys.map((k) => <ServiceField key={k} k={k} b={b} old={old} quick={!!field} />)}
      </div>
      {!old && (
        <>
          <h3 className="form-head">建档阶段</h3>
          <Select b={mode} k="phase" items={Object.entries(phases)} required />
          {mode.v.phase === "paused" && (
            <Text b={mode} k="reason" title="暂停原因" type="area" />
          )}
          {mode.v.phase === "completed" && <ClosureFields b={cl} />}{" "}
          {needApp && (
            <>
              <h3 className="form-head">已递交的合格申请</h3>
              <SchoolFields b={app} />
            </>
          )}
        </>
      )}
    </FormShell>
  );
}
export function ActionEditor({ s, action }: { s: Service; action: string }) {
  const { w } = useSite(),
    b = useValues({
      phase: s.pauses.at(-1)?.from || "progress",
      status: "",
      targets: s.targets,
      kind: "",
      note: "",
      reason: "",
      confirmed: false,
    });
  const descriptions: Record<string, string> = {
    pause: "暂停后保留已有材料、学校申请及学生记录。",
    apply: "将此服务移至出愿中，原有工作可继续维护。",
    return: "将此服务退回进行中，保留已递交的学校申请。",
    reopen: "恢复结案前阶段和学生状况，保留结案后的资料修改。",
    close: "结案时保存当前入学目标，奖励和尾款可在之后补充。",
  };
  const submit: Record<string, string> = {
    pause: "暂停服务",
    apply: "进入出愿中",
    return: "退回进行中",
    reopen: "撤回结案",
    close: "确认结案",
    resume: "恢复服务",
  };
  return (
    <FormShell
      submit={submit[action]}
      sources={[{ path: "services/" + s.id, row: s, key: "expectedVersion" }]}
      save={(vs, key, write) =>
        write(
          "services/" + s.id + "/actions/" + action,
          "POST",
          { ...b.v, expectedVersion: s.version, ...vs },
          key,
        )
      }
    >
      {descriptions[action] && (
        <p className="form-intro">{descriptions[action]}</p>
      )}
      {action === "pause" && (
        <Text b={b} k="reason" title="暂停原因（选填）" type="area" />
      )}
      {action === "resume" && (
        <div className="form-grid">
          <Select
            b={b}
            k="phase"
            title="恢复到"
            items={[
              ["progress", "进行中"],
              ["applying", "出愿中"],
            ]}
            required
          />
          <Select b={b} k="status" items={choices.status} required />
          {b.v.status === "延期" && <Months b={b} k="targets" required />}
        </div>
      )}
      {action === "close" && (
        <>
          <p className="context-note">
            已登记正式合格{" "}
            {
              w.applications.filter(
                (a) => a.serviceId === s.id && !a.voided && a.admitted,
              ).length
            }{" "}
            条 · 结案目标 {s.targets.join("、") || "待补"}
          </p>
          <ClosureFields b={b} />
        </>
      )}
    </FormShell>
  );
}
export function SchoolEditor({
  s,
  old,
  voiding = false,
}: {
  s: Service;
  old?: Application;
  voiding?: boolean;
}) {
  const b = useValues(old || emptyApplication);
  return (
    <FormShell
      submit={voiding ? "确认作废" : "保存申请"}
      sources={[
        {
          path: "services/" + s.id,
          row: s,
          key: old ? "serviceVersion" : "expectedVersion",
        },
        ...(old
          ? [
              {
                path: "applications/" + old.id,
                row: old,
                key: "expectedVersion",
              },
            ]
          : []),
      ]}
      save={(vs, key, write) =>
        write(
          old
            ? "applications/" + old.id + (voiding ? "/void" : "")
            : "services/" + s.id + "/applications",
          old && !voiding ? "PATCH" : "POST",
          {
            ...changed(old, b.v, Object.keys(emptyApplication)),
            expectedVersion: old?.version ?? s.version,
            serviceVersion: s.version,
            ...vs,
          },
          key,
        )
      }
    >
      {voiding ? (
        <p>作废后将移出当前学校列表，原申请保留在历史中。</p>
      ) : (
        <>
          <p className="form-intro">
            仅登记已经实际递交的学校申请。筹备中的学校可写入学生的出愿情况。
          </p>
          <SchoolFields b={b} old={old} />
        </>
      )}
    </FormShell>
  );
}
export function EntryEditor({
  studentId,
  kind,
  old,
  voiding = false,
}: {
  studentId: string;
  kind: EntryKind;
  old?: Entry;
  voiding?: boolean;
}) {
  const b = useValues(old || { date: tokyoDay(), body: "" });
  return (
    <FormShell
      submit={voiding ? "确认作废" : "保存记录"}
      sources={
        old
          ? [{ path: "entries/" + old.id, row: old, key: "expectedVersion" }]
          : []
      }
      save={(vs, key, write) =>
        write(
          old
            ? "entries/" + old.id + (voiding ? "/void" : "")
            : "students/" + studentId + "/entries",
          old && !voiding ? "PATCH" : "POST",
          {
            kind,
            ...changed(old, b.v, ["date", "body"]),
            expectedVersion: old?.version,
            ...vs,
          },
          key,
        )
      }
    >
      {voiding ? (
        <p>作废这条{entryKinds[kind]}，原文和操作记录将保留在变更历史中。</p>
      ) : (
        <div className="form-stack">
          <Text
            b={b}
            k="date"
            type={
              old?.precision === "month" && old.date === b.v.date
                ? "text"
                : "date"
            }
            required={!old || old.precision === "date"}
            hint={old?.rawDate ? "原日期文字 " + old.rawDate : undefined}
          />
          <Text b={b} k="body" type="area" title={entryKinds[kind]} required />
        </div>
      )}
    </FormShell>
  );
}
export function RewardEditor({
  s,
  role,
}: {
  s: Service;
  role: keyof typeof roles;
}) {
  const { w } = useSite(),
    st = w.students.find((x) => x.id === s.studentId)!,
    reward = s.rewards[role],
    recipients = w.catalogs.filter(
      (c) => c.kind === role && (c.active || c.id === reward?.recipient),
    ),
    assigned = role === "teacher" ? s.teacher : st.manager,
    b = useValues({
      recipient:
        reward?.recipient || (recipients.some((c) => c.id === assigned) ? assigned : ""),
      month: reward?.month || "",
    });
  return (
    <FormShell
      sources={[{ path: "services/" + s.id, row: s, key: "expectedVersion" }]}
      save={(vs, key, write) =>
        write(
          "services/" + s.id + "/rewards/" + role,
          "PUT",
          { ...b.v, expectedVersion: s.version, ...vs },
          key,
        )
      }
    >
      <div className="form-grid">
        <Select
          b={b}
          k="recipient"
          title={roles[role] + "奖励归属人"}
          required
          items={recipients.map((c) => [c.id, catalogOptionLabel(c)])}
        />
        <Text b={b} k="month" type="month" title="计入工资年月（选填）" />
      </div>
      <p className="form-intro">确认后的奖励归属独立保存，人员交接后仍保留。</p>
    </FormShell>
  );
}
export function CatalogEditor({ kind, old }: { kind: Kind; old?: Catalog }) {
  const b = useValues({
    name: old?.name || "",
    active: old?.active ?? true,
    aliases: old?.aliases.join("\n") || "",
  });
  return (
    <FormShell
      save={(_, key, write) =>
        write(
          "catalogs/" + kind + (old ? "/" + old.id : ""),
          old ? "PATCH" : "POST",
          {
            ...b.v,
            aliases: b.v.aliases.split(/[\n、，,]/).filter(Boolean),
            expectedVersion: old?.version,
          },
          key,
        )
      }
    >
      <div className="form-stack">
        <Text b={b} k="name" title="名称" required />
        {kind === "school" && (
          <Text b={b} k="aliases" title="学校别名（每行一个）" type="area" />
        )}
        <Toggle b={b} k="active" title="在新增资料时可选" />
      </div>
    </FormShell>
  );
}
export function PasswordEditor() {
  const b = useValues({ currentPassword: "", newPassword: "" });
  return (
    <FormShell save={() => request("auth/change-password", "POST", b.v)}>
      <div className="form-stack">
        <Text
          b={b}
          k="currentPassword"
          title="当前密码"
          type="password"
          required
        />
        <Text
          b={b}
          k="newPassword"
          title={`新密码（${passwordLength.min}–${passwordLength.max} 位）`}
          type="password"
          minLength={passwordLength.min}
          required
        />
      </div>
    </FormShell>
  );
}
