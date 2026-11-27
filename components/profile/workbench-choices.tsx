"use client";
import { useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown } from "lucide-react";
import { catalogOptionLabel, choices, requiresActiveStatus, type Catalog, type Service, type Student } from "../../lib/profile/model";
import { ApiError, type useSite } from "./ui";

const fields = [
  { key: "teacher", label: "教务", placeholder: "待分配" },
  { key: "manager", label: "学管", placeholder: "待分配" },
  { key: "progress", label: "申请进度", placeholder: "待补" },
  { key: "risk", label: "潜在风险", placeholder: "风险待补" },
] as const;
type Choice = (typeof fields)[number];

export function WorkbenchChoices({ service, student, staff, actions, draftProgress, setDraftProgress }: {
  service: Service;
  student: Student;
  staff: Catalog[];
  actions: Pick<ReturnType<typeof useSite>, "write" | "refresh" | "notice">;
  draftProgress?: string;
  setDraftProgress: (value: string | null) => void;
}) {
  const { write, refresh, notice } = actions;
  const [saving, setSaving] = useState<{ field: Choice["key"]; value: string } | null>(null);
  const [opened, setOpened] = useState<Partial<Record<Choice["key"], boolean>>>({});
  function populate(field: Choice["key"]) {
    // Native pickers read the options during the first pointer or keyboard interaction.
    if (!opened[field]) flushSync(() => setOpened((old) => ({ ...old, [field]: true })));
  }
  const current = (field: Choice["key"]) => field === "manager" ? student.manager : service[field];

  async function change({ key: field, label }: Choice, value: string) {
    if (saving) return;
    if (field === "progress") {
      const active = service.phase === "progress" || service.phase === "applying";
      if (value !== service.progress && active && service.status === "未开始" && requiresActiveStatus(value)) {
        setDraftProgress(value);
        return;
      }
      if (draftProgress) setDraftProgress(null);
    }
    if (value === current(field)) return;
    setSaving({ field, value });
    const owner = field === "manager" ? student : service;
    const path = (field === "manager" ? "students/" : "services/") + owner.id;
    try {
      await write(path, "PATCH", { [field]: value, expectedVersion: owner.version });
      notice(student.name + "的" + label + "已保存");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "连接中断，请核对保存结果后重试";
      notice(student.name + " · " + label + " · " + message);
      await refresh().catch(() => notice(message + "。请刷新工作台后重试。"));
    } finally {
      setSaving(null);
    }
  }

  return fields.map((choice) => {
    const { key: field, label, placeholder } = choice;
    const stored = current(field);
    const draft = field === "progress" ? draftProgress : undefined;
    const value = saving?.field === field ? saving.value : draft ?? stored;
    const personnel = field === "teacher" || field === "manager";
    const person = personnel && value ? staff.find((c) => c.kind === field && c.id === value) : undefined;
    const display = person ? catalogOptionLabel(person) : (personnel ? placeholder : value || placeholder);
    const options = !opened[field] ? [] : personnel
      ? staff.filter((c) => c.kind === field && (c.active || c.id === stored)).map((c) => [c.id, catalogOptionLabel(c)])
      : choices[field].map((item) => [item, item]);
    return (
      <td key={field}>
        <div className={"cell-edit cell-choice" + (field === "progress" ? " progress-choice" : "")}>
          <span aria-hidden="true">{display}</span>
          <ChevronDown size={13} aria-hidden="true" />
          <select
            className="cell-select"
            name={field}
            aria-label={label + " · " + student.name}
            aria-busy={saving?.field === field}
            title={display}
            value={value}
            disabled={!!saving}
            onFocus={() => populate(field)}
            onPointerDown={() => populate(field)}
            onChange={(e) => void change(choice, e.currentTarget.value)}
          >
            {(!value || opened[field]) && <option value="" disabled={!personnel && !service.missing?.includes(field)}>{placeholder}</option>}
            {value && !options.some(([id]) => id === value) && <option value={value} disabled={!!opened[field]}>{display}</option>}
            {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </td>
    );
  });
}
