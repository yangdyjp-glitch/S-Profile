import ExcelJS from "exceljs/dist/exceljs.min.js";
import type { Cell, Worksheet } from "exceljs";
import * as SSF from "ssf";
import { choices, identity, initialCatalogs, type Phase } from "./model";
import { day, intake, month } from "./validation";
import type {
  Proposal,
  ProposedEntry,
  ProposedSchool,
  SourceCell,
  RawRow,
} from "./excel-model";
const txt = (c: Cell) => {
  const v = c.value;
  if (v instanceof Date)
    return SSF.format(c.numFmt || "yyyy-mm-dd", v, { date1904: false });
  const value = v && typeof v === "object" && "result" in v ? v.result : v;
  if (typeof value === "number" && c.numFmt) {
    try {
      return SSF.format(c.numFmt, value);
    } catch {
      /* keep raw number */
    }
  }
  return c.text.trim();
};
function phaseOf(s: string): Phase | "" {
  if (s.includes("暂停")) return "paused";
  if (s.includes("出愿")) return "applying";
  if (s.includes("完成")) return "completed";
  if (s.includes("进行")) return "progress";
  return "";
}
function calendar(s: string) {
  const m = s
    .trim()
    .match(
      /^([12]\d{3})\s*[./年-]\s*(\d{1,2})(?:\s*[./月-]\s*(\d{1,2})日?)?月?$/,
    );
  if (!m) return "";
  const y = m[1] + "-" + m[2].padStart(2, "0");
  const v = m[3] ? y + "-" + m[3].padStart(2, "0") : y;
  return (m[3] ? day(v) : month(v)) ? v : "";
}
function dates(s: string) {
  return [
    ...new Set(
      s
        .split(/[、，,；;\s\n]+/)
        .map(calendar)
        .map((v) => v.slice(0, 7))
        .filter(intake),
    ),
  ];
}
const headerName = /^(?:学生姓名|姓名[（(]学生[)）]|姓名|学生名|学生)$/;
function propose(
  sheet: Worksheet,
  cells: SourceCell[],
  head: Map<number, string>,
  phase: Phase | "",
) {
  const issues: string[] = [];
  const by = (re: RegExp) =>
    cells.find(
      (c) => !c.master && re.test(head.get(c.col)?.replace(/\s/g, "") || ""),
    )?.text || "";
  const at = (n: number) =>
    cells.find((c) => c.col === n && !c.master)?.text || "";
  const safe = (k: keyof typeof choices, raw: string) => {
    const v = raw.trim();
    if (!v || choices[k].includes(v)) return v;
    issues.push(v + " 的字段含义待核");
    return "";
  };
  const name = by(headerName),
    rawOrder = by(/签单|首次接单/),
    order = calendar(rawOrder).slice(0, 7);
  if (rawOrder && !order) issues.push("首次签单年月待核");
  const projects = by(/^(申请项目|合同项目|服务项目|项目)$/)
    .split(/[、,，+＋\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const rawGoal =
    phase === "completed"
      ? at(1)
      : by(/原合同|合同入学|目标批次|^申请时间$|^目标入学/);
  const goals = dates(rawGoal);
  if (rawGoal && (!goals.length || phase === "completed"))
    issues.push(
      phase === "completed" ? "结案目标与原合同目标需分别核对" : "入学目标待核",
    );
  const rawLanguage = by(/掌握语言|语言成绩|^语言$/),
    matchJL = rawLanguage.match(/N[1-5]/i);
  const declaration = /暂无语言成绩|无语言成绩/.test(rawLanguage)
    ? "暂无语言成绩"
    : "";
  const languages = {
    jlpt: matchJL ? matchJL[0].toUpperCase() + "合格" : "",
    toefl: "",
    ielts: "",
    toeic: "",
  };
  for (const [key, re] of [
    ["toefl", /(?:托福|TOEFL)[^0-9]{0,5}(\d+(?:\.\d+)?)/i],
    ["ielts", /(?:雅思|IELTS)[^0-9]{0,5}(\d+(?:\.\d+)?)/i],
    ["toeic", /(?:托业|TOEIC)[^0-9]{0,5}(\d+(?:\.\d+)?)/i],
  ] as const)
    languages[key] = rawLanguage.match(re)?.[1] || "";
  const has = Object.values(languages).some(Boolean);
  if (rawLanguage && !has && !declaration)
    issues.push("语言成绩类型或结果待核");
  const rawLocation = by(/所在地|居住地/);
  const location = choices.location.includes(rawLocation) ? rawLocation : "";
  if (
    phase === "paused" &&
    (at(12) || at(15)) &&
    (!location || (at(12) && !choices.location.includes(at(12))))
  )
    issues.push("L／O 列人员与所在地需核对");
  let statusText = by(/^学生状况$|^学生状态$/);
  if (!statusText && phase === "applying") statusText = at(4);
  const status =
    statusText === "暂停中" && phase === "paused"
      ? "暂停中"
      : safe("status", statusText);
  const p: Proposal = {
    name,
    orderMonth: order,
    location,
    manager: by(/^学生管理$|^学管(?:老师)?$/),
    declaration: has ? "已有成绩" : declaration,
    ...languages,
    channel: by(/^甲方$|渠道/),
    teacher: by(/^教务(?:老师)?$/),
    projects,
    major: by(/专业方向|目标专业/),
    original: phase === "completed" ? [] : goals,
    targets: goals,
    status,
    collection: safe("collection", by(/材料准备|材料收集/)),
    production: safe("production", by(/材料制作/)),
    progress: safe(
      "progress",
      phase === "applying"
        ? cells.find(
            (c) => c.col !== 15 && /申请进度/.test(head.get(c.col) || ""),
          )?.text || ""
        : by(/^申请进度$/),
    ),
    risk: safe("risk", by(/申请风险|^风险$/)),
    publication: safe(
      "publication",
      phase === "applying" ? at(13) : by(/^出愿材料$/),
    ),
    special: phase === "applying" ? at(19) : by(/特记事项|特殊事项/),
    notes:
      phase === "applying" ? at(20) : phase === "completed" ? "" : by(/^备注$/),
    pauseReason: by(/暂停原因|暂停说明/),
    closureKind: "",
    closureNote: "",
    schools: [],
    entries: [],
    rewards: {},
  };
  if (!name) issues.push("学生身份待确认");
  if (!phase) issues.push("工作表阶段待确认");
  if (cells.some((c) => c.master)) issues.push("含合并单元格，需核对归属");
  const addEntry = (c: SourceCell, kind: ProposedEntry["kind"]) => {
    if (!c.text.trim() || c.master) return;
    const header = head.get(c.col) || "";
    const inHeader = calendar(header),
      prefix =
        c.text.match(
          /^\s*([12]\d{3}[年./-]\d{1,2}(?:[月./-]\d{1,2}日?)?)/,
        )?.[1] || "";
    const inText = calendar(prefix),
      conflict =
        inHeader && inText && inHeader.slice(0, 7) !== inText.slice(0, 7);
    const date = conflict ? "" : inText || inHeader;
    if (!date) issues.push(c.a + " 的记录日期待核");
    p.entries.push({
      kind,
      body: c.text,
      date,
      precision: date.length === 10 ? "date" : date ? "month" : "unknown",
      rawDate: header,
      cell: c.a,
    });
  };
  for (const c of cells) {
    if (phase === "progress" && c.col >= 18 && c.col <= 25)
      addEntry(c, "progress");
    if (phase === "paused" && c.col >= 17 && c.col <= 20 && c.text) {
      issues.push(c.a + " 内容类别待核");
      addEntry(c, "progress");
    }
    if (phase === "applying" && c.col === 14) addEntry(c, "application");
  }
  const schoolCells =
    phase === "applying"
      ? cells.filter((c) => c.col >= 16 && c.col <= 18)
      : phase === "completed"
        ? cells.filter((c) =>
            /学校|合格院校|合格大学/.test(head.get(c.col) || ""),
          )
        : [];
  for (const c of schoolCells.filter((c) => c.text && !c.master)) {
    const header = head.get(c.col) || "",
      admitted = /合格学校|合格院校|合格大学/.test(header);
    const school: ProposedSchool = {
      name: c.text,
      project: projects.length === 1 ? projects[0] : "",
      program: "",
      intake: phase === "applying" ? dates(at(5))[0] || "" : "",
      deadline: "",
      workMonth: phase === "completed" ? calendar(at(2)).slice(0, 7) : "",
      admitted,
      received:
        phase === "completed" && day(calendar(at(11))) ? calendar(at(11)) : "",
      final: false,
      needsOffer: false,
      offer: phase === "completed" ? calendar(at(10)).slice(0, 7) : "",
      submitted: /已递交/.test(header),
    };
    p.schools.push(school);
    issues.push(c.a + " 需确认学校、实际项目及递交情况");
  }
  if (phase === "completed") {
    const t = at(12);
    p.closureNote = t;
    const gray = cells.some((c) => {
      const fill = sheet.getCell(c.a).fill;
      if (fill?.type !== "pattern" || fill.pattern !== "solid") return false;
      const rgb = fill.fgColor?.argb?.slice(-6) || "";
      return /^(808080|999999|a6a6a6|bfbfbf|c0c0c0|d9d9d9)$/i.test(rgb);
    });
    if (/已退款|已退清|退款完成|全部退/.test(t) || gray)
      p.closureKind = "refund";
    else if (/放弃/.test(t)) p.closureKind = "abandoned";
    else if (/已结单|服务结束/.test(t)) p.closureKind = "closed_other";
    else if (/合格/.test(t) || p.schools.some((s) => s.admitted))
      p.closureKind = "admission";
    if (gray) issues.push("灰色退款标记，需核对说明及同列学校文字");
    if (!p.closureKind || p.closureKind !== "closed_other" || p.schools.length)
      issues.push("需确认完成类型及学校、退款或终止依据");
    const notes = at(13);
    if (notes) {
      issues.push("需核对历史奖励归属及工资年月");
      for (const [key, mark] of [
        ["teacher", "教务"],
        ["manager", "学管"],
      ] as const) {
        const segment = notes.split(/[;；\n，,]/).find((v) => v.includes(mark));
        if (!segment) continue;
        const who = initialCatalogs[key].find((n) => segment.includes(n)),
          m = segment.match(/([12]\d{3})[年./-](\d{1,2})月?/);
        if (who)
          p.rewards[key] = {
            name: who,
            month: m ? calendar(m[0]).slice(0, 7) : "",
          };
      }
    }
  }
  if (status === "延期") issues.push("需确认延期后的目标");
  if (
    p.status === "未开始" &&
    (["发邮件中", "拿到内诺", "出愿中", "完成申请"].includes(p.progress) ||
      p.schools.some((a) => a.submitted))
  )
    issues.push("学生状况与实际申请进度冲突");
  return { proposal: p, issues: [...new Set(issues)] };
}
export async function parseBook(buffer: ArrayBuffer, batch: string) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const rows: {
    id: string;
    sheet: string;
    row: number;
    phase: string;
    name: string;
    identity: string;
    raw: RawRow;
    proposal: Proposal;
    issues: string[];
    state: string;
  }[] = [];
  const metadata = [];
  const seen = new Map<string, number>();
  for (const [si, sheet] of book.worksheets.entries()) {
    const phase = phaseOf(sheet.name),
      headers = new Map<number, string>();
    let header = 0;
    sheet.eachRow((r) => {
      if (!header && r.number <= 60)
        r.eachCell((c) => {
          if (headerName.test(txt(c).replace(/\s/g, ""))) header = r.number;
        });
    });
    if (header)
      sheet.getRow(header).eachCell((c) => headers.set(Number(c.col), txt(c)));
    const merges = sheet.model.merges || [];
    metadata.push({
      sheet: sheet.name,
      state: sheet.state,
      merges,
      header,
      columns: (sheet.columns || []).map((c) => ({
        number: c.number,
        hidden: c.hidden,
        width: c.width,
        style: c.style,
      })),
      headers: Object.fromEntries(headers),
    });
    const lastRow = sheet.rowCount;
    for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
      const r = sheet.findRow(rowNumber);
      if (!r) continue;
      const cs: SourceCell[] = [];
      r.eachCell({ includeEmpty: true }, (c) => {
        if (c.value === null && !Object.keys(c.style || {}).length && !c.note)
          return;
        cs.push({
          a: c.address,
          col: Number(c.col),
          text: txt(c),
          raw: c.value,
          format: c.numFmt || "",
          style: c.style || {},
          master:
            c.isMerged && c.master.address !== c.address
              ? c.master.address
              : undefined,
          hidden: !!sheet.getColumn(Number(c.col)).hidden,
          note: c.note,
        });
      });
      if (!cs.length && !r.hidden && !r.height) continue;
      const { proposal, issues } = propose(sheet, cs, headers, phase);
      const covered = merges.filter((m) => {
        const pair = m.split(":").map((x) => Number(x.match(/\d+$/)?.[0]));
        return (
          pair.length === 2 &&
          pair[0] !== pair[1] &&
          r.number >= pair[0] &&
          r.number <= pair[1]
        );
      });
      if (covered.length) issues.push("跨行合并 " + covered.join("、"));
      const state =
          r.number === header || !cs.some((c) => c.text || c.note)
            ? "source"
            : "pending",
        name = r.number === header ? "" : proposal.name;
      const key = identity(name);
      if (key) seen.set(key, (seen.get(key) || 0) + 1);
      rows.push({
        id: batch + "." + si + "." + r.number,
        sheet: sheet.name,
        row: r.number,
        phase,
        name,
        identity: key,
        raw: {
          hidden: !!r.hidden,
          cells: cs,
          sheetState: sheet.state,
          height: r.height,
          style: r.model?.style,
        },
        proposal,
        issues,
        state,
      });
    }
  }
  for (const r of rows) {
    if (r.identity && (seen.get(r.identity) || 0) > 1)
      r.issues.push("同名来源，需确认学生及服务归属");
  }
  return { rows, metadata };
}
