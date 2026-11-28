import ExcelJS from "exceljs/dist/exceljs.min.js";
import type { ExportData } from "./exports";
import { serviceSortLabels } from "./list";
import {
  closureKinds,
  currentClosure,
  entryKinds,
  labelOf,
  labels,
  languageStatus,
  newestEntries,
  phases,
  timeLabel,
  type Service,
} from "./model";
const str = (v: unknown): string =>
  v == null
    ? ""
    : typeof v === "string"
      ? v
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
// Leave headroom for Excel's limits on UTF-16 characters and line feeds.
export function splitCell(value: unknown) {
  const parts: string[] = [];
  let part = "",
    lines = 0;
  for (const char of str(value)) {
    if (part.length + char.length > 32767 || (char === "\n" && lines === 253)) {
      parts.push(part);
      part = "";
      lines = 0;
    }
    part += char;
    if (char === "\n") lines++;
  }
  parts.push(part);
  return parts;
}
function workbook(data: ExportData) {
  const book = new ExcelJS.Workbook();
  book.creator = "S-Profile";
  const contents: string[][] = [],
    cat = (v: string) => labelOf(data.catalogs, v, "");
  function table(name: string, heads: string[], rows: unknown[][], ids = 1) {
    const capacity = 16384 - ids;
    let slice = 0;
    do {
      const first = heads.slice(0, ids),
        cols = heads.slice(
          ids + slice * capacity,
          ids + (slice + 1) * capacity,
        ),
        selected = [...first, ...cols];
      let page = 0;
      const make = () => {
        page++;
        const suffix =
          (slice ? "-列" + (slice + 1) : "") + (page > 1 ? "-" + page : "");
        const title = name.slice(0, 31 - suffix.length) + suffix,
          w = book.addWorksheet(title, {
            views: [{ state: "frozen", xSplit: ids, ySplit: 1 }],
          });
        w.addRow(selected);
        const head = w.getRow(1);
        head.font = { bold: true, color: { argb: "FFFFFFFF" } };
        head.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF144D4D" },
        };
        head.height = 26;
        w.columns.forEach(
          (c, i) =>
            (c.width =
              i < ids
                ? 30
                : Math.max(
                    16,
                    Math.min(44, (selected[i]?.length || 0) * 2.3 + 6),
                  )),
        );
        contents.push([title, name, String(slice * capacity + ids + 1)]);
        return w;
      };
      let ws = make();
      for (const row of rows) {
        const cells = [
          ...row.slice(0, ids),
          ...row.slice(ids + slice * capacity, ids + (slice + 1) * capacity),
        ].map(splitCell);
        const lines = cells.reduce(
          (long, col) => Math.max(long, col.length),
          1,
        );
        for (let n = 0; n < lines; n++) {
          if (ws.rowCount >= 1048576) ws = make();
          const out = ws.addRow(
            cells.map((c, i) => c[n] ?? (i < ids ? c[0] : "")),
          );
          out.alignment = { vertical: "top", wrapText: true };
        }
      }
      slice++;
    } while (ids + slice * capacity < heads.length);
  }
  const students = new Map(data.students.map((s) => [s.id, s]));
  const studentName = (id: string | null) => id ? students.get(id)?.name || "姓名待补" : "";
  function reportSnapshot(raw: string | null) {
    if (!raw) return "";
    try {
      return JSON.stringify(JSON.parse(raw, (_key, record) => {
        if (!record || typeof record !== "object") return record;
        if (typeof record.studentId === "string") {
          record.studentName = studentName(record.studentId);
          delete record.studentId;
        }
        if (typeof record.id === "string" && (students.has(record.id) || record.id.startsWith("ST-"))) {
          if (!record.name) record.studentName = studentName(record.id);
          delete record.id;
        }
        return record;
      }));
    } catch {
      // Preserve plain-text source resolutions.
      return raw;
    }
  }
  const latest = new Map<string, string>();
  for (const e of newestEntries(data.entries.filter((e) => !e.voided))) {
    const key = e.studentId + "|" + e.kind;
    if (!latest.has(key)) latest.set(key, e.body);
  }
  const serviceTable = (name: string, rows: Service[]) =>
    table(
      name,
      [
        "服务编号",
        "姓名",
        "阶段",
        "所在地",
        "首次签单年月",
        "当前学管",
        "当前教务",
        "甲方",
        "合同项目",
        "专业方向",
        "原合同目标",
        "当前目标",
        "结案目标快照",
        "学生状况／结束前状况",
        "材料收集",
        "材料制作",
        "申请进度",
        "申请风险",
        "出愿材料",
        "特记事项",
        "备注",
        "完成情况",
        "完成说明",
        "全部合格学校及项目",
        "常规进度 · 最新",
        "出愿情况 · 最新",
        "教务奖励归属",
        "教务工资年月",
        "学管奖励归属",
        "学管工资年月",
        "暂停历史",
        "结案历史",
        "历史待补",
        "最近更新",
      ],
      rows.map((s) => {
        const st = students.get(s.studentId),
          c = currentClosure(s);
        return [
          s.id,
          st?.name,
          phases[s.phase],
          st?.location,
          st?.orderMonth,
          cat(st?.manager || ""),
          cat(s.teacher),
          cat(s.channel),
          s.projects.map(cat).join("、"),
          s.major,
          s.original.join("、"),
          s.targets.join("、"),
          c?.targets.join("、"),
          s.status,
          s.collection,
          s.production,
          s.progress,
          s.risk,
          s.publication,
          s.special,
          s.notes,
          c ? closureKinds[c.kind] : "",
          c?.note,
          data.applications
            .filter((a) => a.serviceId === s.id && a.admitted && !a.voided)
            .map(
              (a) => cat(a.school) + " · " + cat(a.project) + " " + a.program,
            )
            .join("\n"),
          latest.get(s.studentId + "|progress"),
          latest.get(s.studentId + "|application"),
          cat(s.rewards.teacher?.recipient || ""),
          s.rewards.teacher?.month,
          cat(s.rewards.manager?.recipient || ""),
          s.rewards.manager?.month,
          s.pauses,
          s.closures,
          s.missing?.map((k) => labels[k] || k).join("、"),
          timeLabel(s.updatedAt),
        ];
      }),
      2,
    );
  if (data.scope === "filtered") {
    serviceTable("当前筛选", data.services);
    table(
      "筛选条件",
      ["条件", "值"],
      Object.entries(data.filters)
        .filter(([, v]) => v)
        .map(([k, v]) => [
          (
            {
              q: "搜索",
              sort: "排序",
              sortDirection: "排序方向",
              intake: "入学目标",
              closure: "完成情况",
            } as Record<string, string>
          )[k] ||
            labels[k] ||
            k,
          k === "sort" ? serviceSortLabels[data.filters.sort] : cat(v) ||
            phases[v as keyof typeof phases] ||
            closureKinds[v as keyof typeof closureKinds] ||
            (
              {
                ascending: "升序",
                descending: "降序",
                none: "待分配",
              } as Record<string, string>
            )[v] ||
            v,
        ]),
    );
  } else {
    for (const [key, name] of Object.entries(phases))
      serviceTable(
        name,
        data.services.filter((s) => s.phase === key),
      );
    table(
      "学生档案",
      [
        "姓名",
        "首次接单",
        "所在地",
        "当前学管",
        "语言声明",
        "JLPT",
        "托福",
        "雅思",
        "托业",
        "待补字段",
      ],
      data.students.map((s) => [
        s.name,
        s.orderMonth,
        s.location,
        cat(s.manager),
        languageStatus(s),
        s.jlpt,
        s.toefl,
        s.ielts,
        s.toeic,
        s.missing?.map((k) => labels[k] || k),
      ]),
    );
    table(
      "学校申请",
      [
        "申请编号",
        "服务编号",
        "学校",
        "实际项目",
        "具体项目",
        "入学年月",
        "截止日",
        "工作开始月",
        "合格",
        "收到合格日期",
        "最终选择",
        "需要内诺",
        "内诺年月",
        "作废",
        "待补字段",
      ],
      data.applications.map((a) => [
        a.id,
        a.serviceId,
        cat(a.school),
        cat(a.project),
        a.program,
        a.intake,
        a.deadline,
        a.workMonth,
        a.admitted ? "已合格" : "未登记",
        a.received,
        a.final ? "是" : "",
        a.needsOffer ? "是" : "",
        a.offer,
        a.voided ? "已作废" : "",
        a.missing?.map((k) => labels[k] || k),
      ]),
      2,
    );
    for (const [kind, title] of Object.entries(entryKinds)) {
      const entries = data.entries.filter((e) => e.kind === kind && !e.voided),
        months = [
          ...new Set(
            entries.filter((e) => e.date).map((e) => e.date.slice(0, 7)),
          ),
        ].sort();
      months.push("日期待确认");
      const groups = new Map<string, Map<string, string[]>>();
      for (const e of newestEntries(entries)) {
        const buckets = groups.get(e.studentId) || new Map<string, string[]>(),
          m = e.date.slice(0, 7) || "日期待确认",
          list = buckets.get(m) || [];
        list.push(
          [
            e.date || e.rawDate || "日期待确认",
            e.body,
            e.source,
          ]
            .filter(Boolean)
            .join("  "),
        );
        buckets.set(m, list);
        groups.set(e.studentId, buckets);
      }
      table(
        title,
        ["姓名", ...months],
        Array.from(groups, ([sid, m]) => [
          studentName(sid),
          ...months.map((k) => m.get(k)?.join("\n\n") || ""),
        ]),
      );
    }
    table(
      "记录明细",
      [
        "记录编号",
        "学生姓名",
        "类别",
        "正文",
        "业务日期",
        "精度",
        "原日期文字",
        "登记时刻",
        "来源",
        "作废",
      ],
      data.entries.map((e) => [
        e.id,
        studentName(e.studentId),
        entryKinds[e.kind],
        e.body,
        e.date,
        e.precision,
        e.rawDate,
        e.recorded,
        e.source,
        e.voided ? "已作废" : "",
      ]),
      2,
    );
    table(
      "历史变更",
      [
        "顺序",
        "实体",
        "编号",
        "学生姓名",
        "服务编号",
        "版本",
        "动作",
        "操作人",
        "时间",
        "修改前",
        "修改后",
      ],
      data.revisions.map((r) => [
        r.seq,
        r.entity,
        r.entity === "students" ? "" : r.entityId,
        studentName(r.studentId),
        r.serviceId,
        r.version,
        r.action,
        r.actor,
        timeLabel(r.at),
        reportSnapshot(r.before),
        reportSnapshot(r.after),
      ]),
    );
    table(
      "业务名册",
      ["编号", "类别", "名称", "别名", "使用情况"],
      data.catalogs.filter((c) => !c.deleted).map((c) => [
        c.id,
        c.kind,
        c.name,
        c.aliases,
        c.active ? "启用" : "停用",
      ]),
    );
    table(
      "导入批次",
      ["文件摘要", "原文件名", "上传人", "登记时间", "原表结构与合并区域"],
      data.imports.map((b) => [b.id, b.name, b.actor, b.at, b.metadata]),
    );
    table(
      "来源与待核",
      [
        "来源编号",
        "工作表",
        "行",
        "行隐藏",
        "工作表状态",
        "状态",
        "问题",
        "建议",
        "关联学生姓名",
        "服务编号",
        "确认人",
        "确认时间",
        "处理记录",
      ],
      data.sources.map((r) => [
        r.id,
        r.sheet,
        r.row,
        r.raw.hidden,
        r.raw.sheetState,
        r.state,
        r.issues,
        r.proposal,
        studentName(r.student_id),
        r.service_id,
        r.reviewer,
        r.reviewed_at,
        reportSnapshot(r.resolution),
      ]),
    );
    table(
      "来源单元格",
      [
        "来源编号",
        "坐标",
        "原值",
        "原显示文字",
        "数字格式",
        "样式",
        "合并主格",
        "列隐藏",
        "批注",
      ],
      data.sources.flatMap((r) =>
        r.raw.cells.map((c) => [
          r.id,
          c.a,
          c.raw,
          c.text,
          c.format,
          c.style,
          c.master,
          c.hidden,
          c.note,
        ]),
      ),
      2,
    );
  }
  table("工作表索引", ["工作表", "资料", "首个数据列"], [...contents]);
  return book;
}
self.onmessage = async (e: MessageEvent<ExportData>) => {
  try {
    const buf = await workbook(e.data).xlsx.writeBuffer();
    const out = new Uint8Array(buf).buffer;
    self.postMessage({ ok: true, buffer: out }, { transfer: [out] });
  } catch {
    self.postMessage({ ok: false, message: "Excel 文件生成失败，请重新导出" });
  }
};
