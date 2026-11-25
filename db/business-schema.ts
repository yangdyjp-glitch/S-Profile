import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";

const fields = () => ({
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const catalogs = sqliteTable(
  "catalogs",
  {
    ...fields(),
    kind: text("kind").notNull(),
    nameKey: text("name_key").notNull(),
  },
  (t) => [uniqueIndex("catalog_name").on(t.kind, t.nameKey)],
);
export const students = sqliteTable("students", {
  ...fields(),
  identity: text("identity").notNull().unique(),
});
export const services = sqliteTable(
  "services",
  {
    ...fields(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
  },
  (t) => [index("services_student").on(t.studentId)],
);
export const applications = sqliteTable(
  "applications",
  {
    ...fields(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id),
  },
  (t) => [index("applications_service").on(t.serviceId)],
);
export const entries = sqliteTable(
  "entries",
  {
    ...fields(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
  },
  (t) => [index("entries_student").on(t.studentId)],
);
export const revisions = sqliteTable(
  "revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    studentId: text("student_id").notNull(),
    serviceId: text("service_id").notNull(),
    version: integer("version").notNull(),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    actorId: text("actor_id").notNull(),
    at: text("at").notNull(),
    before: text("before"),
    after: text("after").notNull(),
  },
  (t) => [
    index("history_student").on(t.studentId, t.seq),
    index("history_service").on(t.serviceId, t.seq),
    uniqueIndex("entity_version").on(t.entity, t.entityId, t.version),
  ],
);
export const mutations = sqliteTable("mutations", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  result: text("result").notNull(),
});
// A failed predicate aborts *all* statements in the same D1 batch.
export const guards = sqliteTable(
  "guards",
  { ok: integer("ok").notNull() },
  (t) => [check("version_guard", sql`${t.ok} = 1`)],
);
export const setup = sqliteTable("setup_tickets", {
  digest: text("digest").primaryKey(),
  expires: integer("expires").notNull(),
});
export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  actor: text("actor").notNull(),
  at: text("at").notNull(),
  state: text("state").notNull(),
  metadata: text("metadata").notNull(),
  objectKey: text("object_key").notNull(),
});
export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => imports.id),
    sheet: text("sheet").notNull(),
    row: integer("row").notNull(),
    phase: text("phase").notNull(),
    name: text("name").notNull(),
    identity: text("identity").notNull(),
    raw: text("raw").notNull(),
    proposal: text("proposal").notNull(),
    issues: text("issues").notNull(),
    state: text("state").notNull(),
    studentId: text("student_id"),
    serviceId: text("service_id"),
    reviewer: text("reviewer"),
    reviewedAt: text("reviewed_at"),
    resolution: text("resolution"),
  },
  (t) => [
    index("source_batch").on(t.batchId, t.state, t.sheet, t.row),
    index("source_identity").on(t.batchId, t.identity),
  ],
);
