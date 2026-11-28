import type { Student } from "./model";

export const studentColumns = [
  ["name", "学生姓名"],
  ["orderMonth", "首次签单"],
  ["location", "所在地"],
  ["language", "语言情况"],
  ["managerName", "学管"],
  ["serviceCount", "服务数"],
] as const;

export type StudentSort = {
  field: (typeof studentColumns)[number][0];
  direction: "ascending" | "descending";
};
export const studentNameOrder: StudentSort = { field: "name", direction: "ascending" };
export type StudentListRow = Pick<Student, "id" | "name" | "orderMonth" | "location"> & {
  language: string;
  managerName: string;
  serviceCount: number;
};

export const compareStudentNames = new Intl.Collator("zh-CN").compare;
const compareText = new Intl.Collator("zh-CN", { numeric: true }).compare;

export function studentListRows(
  students: StudentListRow[], term: string, entryMatches: ReadonlySet<string>, sort: StudentSort | null,
) {
  const nameMatches = (row: StudentListRow) => row.name.toLowerCase().includes(term);
  const rows = students.filter((row) => !term || nameMatches(row) || entryMatches.has(row.id));
  const { field, direction } = sort ?? studentNameOrder;
  const compare = field === "name" ? compareStudentNames : compareText;
  const sign = direction === "ascending" ? 1 : -1;
  return rows.sort((a, b) => {
    if (!sort && term) {
      const byRelevance = Number(nameMatches(b)) - Number(nameMatches(a));
      if (byRelevance) return byRelevance;
    }
    const left = a[field], right = b[field];
    if ((left === "") !== (right === "")) return left === "" ? 1 : -1;
    const byField = typeof left === "number" && typeof right === "number"
      ? left - right
      : compare(String(left), String(right));
    return sign * byField || compareStudentNames(a.name, b.name) || a.id.localeCompare(b.id);
  });
}
