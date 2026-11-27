"use client";
import { useState } from "react";
import { catalogOptionLabel, choices, requiresActiveStatus, type Catalog, type Service, type Student } from "../../lib/profile/model";
import { ApiError, useSite } from "./ui";

const fields = [
  { key: "teacher", label: "教务", placeholder: "待分配" },
  { key: "manager", label: "学管", placeholder: "待分配" },
  { key: "progress", label: "申请进度", placeholder: "待补" },
  { key: "risk", label: "潜在风险", placeholder: "风险待补" },
] as const;
type Choice = (typeof fields)[number];

export function WorkbenchChoices({ service, student, staff, draftProgress, setDraftProgress }: {
  service: Service;
  student: Student;
  staff: Catalog[];
  draftProgress?: string;
  setDraftProgress: (value: string | null) => void;
}) {
  const { write, refresh, notice } = useSite();
  const [saving, setSaving] = useState<{ field: Choice["key"]; value: string } | null>(null);
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
    const options = personnel
      ? staff.filter((c) => c.kind === field && (c.active || c.id === stored)).map((c) => [c.id, catalogOptionLabel(c)])
      : choices[field].map((item) => [item, item]);
    const selected = options.find(([id]) => id === value);
    const display = selected?.[1] ?? (personnel ? placeholder : value || placeholder);
    return (
      <td key={field}>
        <select
          className="cell-edit cell-select"
          name={field}
          aria-label={label + " · " + student.name}
          aria-busy={saving?.field === field}
          title={display}
          value={value}
          disabled={!!saving}
          onChange={(e) => void change(choice, e.currentTarget.value)}
        >
          <option value="" disabled={!personnel && !service.missing?.includes(field)}>{placeholder}</option>
          {value && !selected && <option value={value} disabled>{display}</option>}
          {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </td>
    );
  });
}
