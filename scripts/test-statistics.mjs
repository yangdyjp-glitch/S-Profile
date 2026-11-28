import assert from "node:assert/strict";
import { studentStatistics, targetCombination } from "../lib/profile/statistics.ts";

const students = [
  { id: "a", name: "同名", manager: "m1" }, { id: "b", name: "同名", manager: "m2" },
  { id: "c", name: "待分配", manager: "" }, { id: "d", name: "仅有档案", manager: "m1" },
  { id: "e", name: "仅有结案", manager: "m1" },
];
const catalogs = [
  ["teacher", "t1"], ["teacher", "t2"], ["teacher", "t0"], ["teacher", "t-old"],
  ["manager", "m1"], ["manager", "m2"], ["project", "p1"], ["project", "p2"], ["project", "p0"], ["project", "p-old"],
].map(([kind, id]) => ({ id, kind, name: id, active: !id.endsWith("-old"), deleted: id.endsWith("-old") }));
const service = (id, studentId, phase, teacher, projects, targets, status, closures = []) =>
  ({ id, studentId, phase, teacher, projects, targets, status, closures });
const services = [
  service("a1", "a", "applying", "t1", ["p1", "p2", "p1"], ["2027-10", "2027-04"], "延期"),
  service("a2", "a", "progress", "t1", ["p2"], ["2027-04"], "当期申请"),
  service("a3", "a", "paused", "t2", ["p1"], ["2027-10"], ""),
  service("b1", "b", "applying", "t2", ["p1"], ["2027-04", "2027-10", "2027-04"], "当期申请"),
  service("c1", "c", "progress", "", [], [], ""),
  service("a4", "a", "completed", "t2", ["p1"], ["2027-04"], "当期申请", [{ phase: "progress", status: "延期", undone: "" }]),
  service("e1", "e", "completed", "t-old", ["p-old"], ["2027-10"], "",
    [{ phase: "paused", status: "暂停中", undone: "" }, { phase: "progress", status: "当期申请", undone: "已撤回" }]),
];
const applications = [
  { serviceId: "a1", school: "校一", voided: false }, { serviceId: "a1", school: "校二", voided: false },
  { serviceId: "b1", school: "校三", voided: true }, { serviceId: "b1", school: "", voided: false },
  { serviceId: "c1", school: "校四", voided: false }, { serviceId: "e1", school: "校五", voided: false },
];
const data = { students, services, applications, catalogs };
const ids = (metric) => [...metric.members.keys()].sort().join("");
const teacher = studentStatistics(data, "active", "teacher");
assert.equal(targetCombination(["2027-10", " 2027-04 ", "", "2027-10"]), "2027-04 / 2027-10");
assert.equal(ids(teacher.total), "abc");
assert.deepEqual([...teacher.statuses].map(([label, group]) => [label, ids(group)]), [
  ["当期申请", "ab"], ["延期", "a"], ["暂停中", "a"], ["未开始", ""], ["状况待补", "c"],
]);
assert.deepEqual(teacher.targets.map((t) => [t.label, ids(t.total), ids(t.applying), ids(t.submitted)]), [
  ["2027-04", "a", "", ""], ["2027-04 / 2027-10", "ab", "ab", "a"],
  ["2027-10", "a", "", ""], ["目标待补", "c", "", "c"],
]);
const t1 = teacher.staff.find((row) => row.id === "t1"), t2 = teacher.staff.find((row) => row.id === "t2");
assert.equal(ids(t1.total), "a");
assert.equal(ids(t2.total), "ab");
assert.equal(ids(t2.phases.get("paused")), "a");
assert.equal(ids(teacher.staff.find((row) => row.id === "").total), "c");
assert.ok(teacher.staff.some((row) => row.id === "t0" && !row.total.members.size));
assert.ok(!teacher.staff.some((row) => row.id === "t-old"));
assert.equal(ids(teacher.projects.find((row) => row.id === "p1").total), "ab");
assert.equal(ids(teacher.projects.find((row) => row.id === "").total), "c");
assert.equal(t1.projects.get("p1").members.get("a").services.length, 1);
assert.deepEqual(t1.projects.get("p2").members.get("a").services.map((s) => s.id), ["a1", "a2"]);
const manager = studentStatistics(data, "active", "manager");
const m1 = manager.staff.find((row) => row.id === "m1");
assert.deepEqual(m1.total.members.get("a").services.map((s) => s.id), ["a1", "a2", "a3"]);
assert.equal(ids(manager.staff.find((row) => row.id === "m2").projects.get("p1")), "b");
const completed = studentStatistics(data, "completed", "teacher");
assert.equal(ids(completed.total), "ae");
assert.deepEqual(completed.phaseColumns, ["completed"]);
assert.equal(ids(completed.statuses.get("暂停中")), "e");
assert.equal(ids(completed.statuses.get("延期")), "a");
assert.equal(ids(completed.targets.find((row) => row.label === "2027-10").submitted), "e");
assert.ok(completed.targets.every((row) => !row.applying.members.size));
assert.equal(completed.staff.find((row) => row.id === "t-old").name, "t-old（已删除）");
assert.equal(ids(completed.projects.find((row) => row.id === "p-old").total), "e");
const all = studentStatistics(data, "all", "manager");
assert.equal(ids(all.total), "abce");
assert.equal(all.phaseColumns.length, 4);
for (const report of [teacher, manager, completed, all]) {
  for (const [key, group] of report.metrics) {
    assert.equal(group.key, key);
    for (const [studentId, match] of group.members) {
      assert.equal(match.student.id, studentId);
      assert.ok(match.services.length && match.services.every((s) => s.studentId === studentId));
      assert.equal(new Set(match.services.map((s) => s.id)).size, match.services.length);
    }
  }
}
const empty = studentStatistics({ ...data, services: [] }, "active", "teacher");
assert.equal(empty.targets.length, 0);
assert.equal(empty.total.members.size, 0);
