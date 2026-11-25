import type {
  Account,
  Application,
  Catalog,
  Entry,
  Revision,
  Row,
  Service,
  Student,
  Workspace,
} from "./model";
import { identity } from "./model";
import { Problem, stamp } from "./validation";
export type Table =
  "students" | "services" | "applications" | "entries" | "catalogs";
export type Entity = Student | Service | Application | Entry | Catalog;
export type Input = Record<string, unknown>;
type SqlRow = { id: string; data: string; version: number; updated_at: string };
export function unpack<T>(r: SqlRow): T {
  return {
    ...JSON.parse(r.data),
    id: r.id,
    version: r.version,
    updatedAt: r.updated_at,
  };
}
export async function all<T>(
  db: D1Database,
  table: Table,
  where = "",
  args: unknown[] = [],
): Promise<T[]> {
  const result = await db
    .prepare(`SELECT id,data,version,updated_at FROM ${table} ${where}`)
    .bind(...args)
    .all<SqlRow>();
  return result.results.map((r) => unpack<T>(r));
}
export async function one<T extends Row>(
  db: D1Database,
  table: Table,
  id: string,
): Promise<T> {
  const r = await db
    .prepare(`SELECT * FROM ${table} WHERE id=?`)
    .bind(id)
    .first<SqlRow>();
  if (!r) throw new Problem(404, "这条记录不存在");
  return unpack<T>(r);
}
export const tables: Table[] = [
  "students",
  "services",
  "applications",
  "entries",
  "catalogs",
];
export const workspaceQueries = (db: D1Database) =>
  tables.map((t) => db.prepare(`SELECT id,data,version,updated_at FROM ${t}`));
export function unpackWorkspace(results: D1Result[]): Workspace {
  return Object.fromEntries(
    tables.map((t, i) => [
      t,
      results[i].results.map((r) => unpack(r as SqlRow)),
    ]),
  ) as unknown as Workspace;
}
export async function snapshot(db: D1Database) {
  return unpackWorkspace(await db.batch(workspaceQueries(db)));
}
export function expect(row: Row, v: unknown) {
  if (row.version !== v)
    throw new Problem(
      409,
      "其他成员已修改此记录。请核对最新版本，再保存当前输入。",
      "",
      row,
    );
}
export function guard(db: D1Database, test: string, ...params: unknown[]) {
  return db
    .prepare(`INSERT INTO guards(ok) SELECT 0 WHERE NOT (${test})`)
    .bind(...params);
}
export function record(
  db: D1Database,
  table: Table,
  prior: Entity | null,
  next: Entity,
  actor: Account,
  action: string,
  studentId = "",
  serviceId = "",
): D1PreparedStatement[] {
  const { id, version, updatedAt, ...body } = next;
  const extras: Record<string, string> = {};
  if (table === "students") extras.identity = identity((next as Student).name);
  if (table === "catalogs") {
    const c = next as Catalog;
    extras.kind = c.kind;
    extras.name_key = c.name.trim().toLowerCase();
  }
  if (table === "services" || table === "entries")
    extras.student_id = (next as Service | Entry).studentId;
  if (table === "applications")
    extras.service_id = (next as Application).serviceId;
  const cols = Object.keys(extras),
    vals = Object.values(extras),
    data = JSON.stringify(body);
  const sqls: D1PreparedStatement[] = [];
  if (prior) {
    sqls.push(
      guard(
        db,
        `EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?)`,
        id,
        prior.version,
      ),
    );
    sqls.push(
      db
        .prepare(
          `UPDATE ${table} SET data=?,version=?,updated_at=?,${cols.map((k) => k + "=?").join(",")} WHERE id=?`,
        )
        .bind(data, version, updatedAt, ...vals, id),
    );
  } else {
    sqls.push(
      db
        .prepare(
          `INSERT INTO ${table}(id,data,version,updated_at,${cols.join(",")}) VALUES(?,?,?,?${",?".repeat(cols.length)})`,
        )
        .bind(id, data, version, updatedAt, ...vals),
    );
  }
  sqls.push(
    db
      .prepare(
        "INSERT INTO revisions(entity,entity_id,student_id,service_id,version,action,actor,actor_id,at,before,after) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        table,
        id,
        studentId,
        serviceId,
        version,
        action,
        actor.name,
        actor.id,
        updatedAt,
        prior ? JSON.stringify(prior) : null,
        JSON.stringify(next),
      ),
  );
  return sqls;
}
export const bump = <T extends Row>(r: T): T => ({
  ...r,
  version: r.version + 1,
  updatedAt: stamp(),
});
export const meta = (id: string) => ({ id, version: 1, updatedAt: stamp() });
export async function digest(data: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505" ||
    String(error).includes("UNIQUE constraint failed");
}
export async function commit(
  db: D1Database,
  actor: Account,
  key: string | null,
  route: string,
  input: Input,
  plan: () => Promise<{ sql: D1PreparedStatement[]; result: unknown }>,
) {
  if (!key || !/^[\w-]{12,100}$/.test(key))
    throw new Problem(422, "请求标识无效，请重试");
  const signature = await digest(route + " " + JSON.stringify(input));
  const previous = async () => {
    const r = await db
      .prepare("SELECT * FROM mutations WHERE id=?")
      .bind(key)
      .first<{ actor_id: string; fingerprint: string; result: string }>();
    if (r && (r.actor_id !== actor.id || r.fingerprint !== signature))
      throw new Problem(409, "请求内容已变化，请重新保存");
    return r ? JSON.parse(r.result) : null;
  };
  const done = await previous();
  if (done) return done;
  try {
    const { sql, result } = await plan();
    await db.batch([
      db
        .prepare(
          "INSERT INTO mutations(id,actor_id,fingerprint,result) VALUES(?,?,?,?)",
        )
        .bind(key, actor.id, signature, JSON.stringify(result)),
      ...sql,
    ]);
    return result;
  } catch (e) {
    const raced = await previous();
    if (raced) return raced;
    const msg = String(e);
    if (/version_guard|CHECK constraint failed/.test(msg))
      throw new Problem(409, "资料已更新，请核对最新版本后保存");
    if (isUniqueViolation(e))
      throw new Problem(409, "已有同名记录，请选择已有档案或名册项");
    throw e;
  }
}
export const revisionSelect =
  'SELECT seq,entity,entity_id AS "entityId",student_id AS "studentId",service_id AS "serviceId",version,action,actor,at,before,after FROM revisions';
export async function history(
  db: D1Database,
  type: string,
  id: string,
  before: number,
) {
  const where =
    type === "students"
      ? "student_id"
      : type === "services"
        ? "service_id"
        : "entity_id";
  const res = await db
    .prepare(
      `${revisionSelect} WHERE ${where}=? AND seq<? ORDER BY seq DESC LIMIT 50`,
    )
    .bind(id, before)
    .all<Revision>();
  return res.results;
}
