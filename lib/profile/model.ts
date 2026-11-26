export const phases = {
  progress: "进行中",
  paused: "暂停中",
  applying: "出愿中",
  completed: "已完成",
} as const;
export type Phase = keyof typeof phases;
export const closureKinds = {
  admission: "学校结果",
  refund: "退款",
  abandoned: "学生放弃",
  closed_other: "服务结束（已结单）",
} as const;
export type ClosureKind = keyof typeof closureKinds;
export const roles = { teacher: "教务", manager: "学管" } as const;
export const catalogs = {
  channel: "渠道",
  teacher: "教务",
  manager: "学管",
  project: "项目",
  school: "学校",
} as const;
export type Kind = keyof typeof catalogs;
export const initialCatalogs: Record<Kind, string[]> = {
  channel: [
    "西安途洋",
    "东京行知",
    "上海行知",
    "大连行知",
    "京都行知",
    "西安华唯",
    "深圳翼丰",
    "广州行知",
    "广西昭延",
    "上海灏陆",
  ],
  teacher: [
    "吴怡丹",
    "沈沛青",
    "王瑜",
    "罗士轩",
    "朱俊杰",
    "田松源",
    "罗钰",
    "王梦",
    "雒美敏",
    "赵和光",
    "金明月",
    "夏晗夜",
  ],
  manager: ["刘靓", "崔佳", "边李欣", "张月出"],
  project: [
    "修士研究生",
    "博士研究生",
    "修士",
    "博士",
    "修士SGU",
    "本科SGU",
    "本科EJU申请",
    "研究计划书指导",
  ],
  school: [],
};
export const choices = {
  location: ["中国", "日本", "欧美"],
  declaration: ["已有成绩", "暂无语言成绩"],
  jlpt: ["N1合格", "N2合格", "N3合格", "N4合格", "N5合格", "暂无日语成绩"],
  status: ["未开始", "当期申请", "延期"],
  collection: ["尚未收集", "收集中", "收集完成"],
  production: ["尚未制作", "制作中", "制作完成"],
  progress: [
    "未开始",
    "发邮件中",
    "研究计划",
    "拿到内诺",
    "出愿中",
    "出现问题",
    "完成申请",
    "确定退款",
  ],
  risk: [
    "语言风险",
    "配合风险",
    "目标风险",
    "时间风险",
    "退款风险",
    "方向风险",
    "暂无风险",
  ],
  publication: ["未发布", "已发布"],
};
export const entryKinds = {
  progress: "常规进度",
  application: "出愿情况",
} as const;
export const requiresActiveStatus = (progress: string) =>
  ["发邮件中", "拿到内诺", "出愿中", "完成申请"].includes(progress);
export type EntryKind = keyof typeof entryKinds;
export interface Row {
  id: string;
  version: number;
  updatedAt: string;
}
export interface Student extends Row {
  name: string;
  orderMonth: string;
  manager: string;
  location: string;
  declaration: string;
  jlpt: string;
  toefl: string;
  ielts: string;
  toeic: string;
  missing?: string[];
}
export interface Pause {
  from: Phase | "";
  status: string;
  reason: string;
  start: string;
  end: string;
}
export interface Closure {
  kind: ClosureKind;
  note: string;
  targets: string[];
  phase: Phase | "";
  status: string;
  at: string;
  undone: string;
  actor: string;
}
export interface Reward {
  recipient: string;
  month: string;
  confirmed: boolean;
}
export interface Service extends Row {
  studentId: string;
  phase: Phase;
  channel: string;
  teacher: string;
  projects: string[];
  major: string;
  original: string[];
  targets: string[];
  status: string;
  collection: string;
  production: string;
  progress: string;
  risk: string;
  publication: string;
  special: string;
  notes: string;
  pauses: Pause[];
  closures: Closure[];
  rewards: Partial<Record<keyof typeof roles, Reward>>;
  missing?: string[];
}
export interface Application extends Row {
  serviceId: string;
  school: string;
  project: string;
  program: string;
  intake: string;
  deadline: string;
  workMonth: string;
  admitted: boolean;
  received: string;
  final: boolean;
  needsOffer: boolean;
  offer: string;
  voided: boolean;
  missing?: string[];
}
export interface Entry extends Row {
  studentId: string;
  kind: EntryKind;
  body: string;
  date: string;
  precision: "date" | "month" | "unknown";
  rawDate: string;
  recorded: string;
  voided: boolean;
  source: string;
}
export interface Catalog extends Row {
  kind: Kind;
  name: string;
  active: boolean;
  aliases: string[];
  deleted?: boolean;
}
export interface Revision {
  seq: number;
  entity: string;
  entityId: string;
  studentId: string;
  serviceId: string;
  version: number;
  action: string;
  actor: string;
  at: string;
  before: string | null;
  after: string;
}
export const passwordLength = { min: 6, max: 128 } as const;
export interface Account {
  id: string;
  name: string;
  username: string;
  role: string;
  banned?: boolean;
}
export interface Workspace {
  students: Student[];
  services: Service[];
  applications: Application[];
  entries: Entry[];
  catalogs: Catalog[];
}
export const emptyWorkspace: Workspace = {
  students: [],
  services: [],
  applications: [],
  entries: [],
  catalogs: [],
};
export const emptyStudent = {
  name: "",
  orderMonth: "",
  manager: "",
  location: "",
  declaration: "",
  jlpt: "",
  toefl: "",
  ielts: "",
  toeic: "",
};
export const emptyService = {
  channel: "",
  teacher: "",
  projects: [] as string[],
  major: "",
  original: [] as string[],
  targets: [] as string[],
  status: "",
  collection: "",
  production: "",
  progress: "",
  risk: "",
  publication: "未发布",
  special: "",
  notes: "",
};
export const emptyApplication = {
  school: "",
  project: "",
  program: "",
  intake: "",
  deadline: "",
  workMonth: "",
  admitted: false,
  received: "",
  final: false,
  needsOffer: false,
  offer: "",
};
export const identity = (v: string) =>
  v.replace(/[*＊✱★☆⭐🌟✰✴✳]\uFE0F?|\s/gu, "").trim();
const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export const tokyoDay = (d = new Date()) => dayFormat.format(d);
export const timeLabel = (s: string) => s ? timeFormat.format(new Date(s)) : "时间待核";
export const currentClosure = (s: Service) =>
  [...s.closures].reverse().find((c) => !c.undone);
export const labelOf = (list: Catalog[], id: string, fallback = "待补") =>
  list.find((c) => c.id === id)?.name || fallback;
export const catalogOptionLabel = (c: Catalog) => c.deleted ? c.name + "（已删除）" : c.name;
export const labels: Record<string, string> = {
  name: "学生姓名",
  orderMonth: "首次签单年月",
  manager: "学管",
  location: "所在地",
  declaration: "语言成绩",
  jlpt: "JLPT",
  toefl: "托福",
  ielts: "雅思",
  toeic: "托业",
  phase: "服务阶段",
  channel: "甲方渠道",
  teacher: "教务",
  projects: "合同项目",
  major: "专业方向",
  original: "原合同入学目标",
  targets: "当前入学目标",
  status: "学生状况",
  collection: "材料准备情况",
  production: "材料制作",
  progress: "申请进度",
  risk: "申请风险",
  publication: "出愿材料",
  special: "特记事项",
  notes: "备注",
  pauses: "暂停记录",
  closures: "结案记录",
  rewards: "奖励结算",
  school: "学校名称",
  project: "实际项目",
  program: "具体项目名称",
  intake: "学校入学时间",
  deadline: "出愿截止日期",
  workMonth: "出愿工作月份",
  admitted: "正式合格",
  received: "收到合格日期",
  final: "最终选择",
  needsOffer: "需要内诺",
  offer: "内诺年月",
  voided: "已作废",
  body: "记录正文",
  date: "业务日期",
  kind: "类别",
  active: "启用",
  aliases: "别名",
  missing: "历史待补字段",
  rawDate: "原日期文字",
  source: "来源",
  precision: "日期精度",
  recorded: "登记时间",
  studentId: "学生编号",
  serviceId: "服务编号",
};
export const orderedApps = (list: Application[]) =>
  [...list].sort(
    (a, b) =>
      (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
      a.id.localeCompare(b.id),
  );
export const compareNewestEntry = (a: Entry, b: Entry) =>
  b.date.localeCompare(a.date) || b.recorded.localeCompare(a.recorded);
export const newestEntries = (list: Entry[]) => [...list].sort(compareNewestEntry);
