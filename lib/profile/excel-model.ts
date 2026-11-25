import type { ClosureKind, EntryKind, Phase } from "./model";
export interface SourceCell {
  a: string;
  col: number;
  text: string;
  raw: unknown;
  format: string;
  style: unknown;
  master?: string;
  hidden?: boolean;
  note?: unknown;
}
export interface RawRow {
  style?: unknown;
  hidden: boolean;
  cells: SourceCell[];
  sheetState: string;
  height?: number;
}
export interface ProposedEntry {
  kind: EntryKind;
  body: string;
  date: string;
  precision: "date" | "month" | "unknown";
  rawDate: string;
  cell: string;
}
export interface ProposedSchool {
  name: string;
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
  submitted: boolean;
}
export interface Proposal {
  name: string;
  orderMonth: string;
  location: string;
  manager: string;
  declaration: string;
  jlpt: string;
  toefl: string;
  ielts: string;
  toeic: string;
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
  pauseReason: string;
  closureKind: ClosureKind | "";
  closureNote: string;
  schools: ProposedSchool[];
  entries: ProposedEntry[];
  rewards: Partial<
    Record<"teacher" | "manager", { name: string; month: string }>
  >;
}
export interface Source {
  id: string;
  batch_id: string;
  sheet: string;
  row: number;
  phase: Phase | "";
  name: string;
  identity: string;
  raw: RawRow;
  proposal: Proposal;
  issues: string[];
  state: string;
  student_id: string | null;
  service_id: string | null;
  reviewer: string | null;
  reviewed_at: string | null;
  resolution: string | null;
}
export interface Batch {
  id: string;
  name: string;
  actor: string;
  at: string;
  state: string;
  total: number;
  pending: number;
  linked: number;
  saved: number;
  metadata?: string;
}
