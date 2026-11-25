import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Parent tables precede their dependants so every foreign key is checked on import.
const tables = [
  "user", "account", "session", "verification", "rate_limit", "students", "catalogs",
  "services", "applications", "entries", "imports", "sources", "guards", "mutations",
  "revisions", "setup_tickets",
];
const identifier = (name) => '"' + name.replaceAll('"', '""') + '"';

async function copyRows(client, table, columns, rows) {
  const names = columns.map(identifier).join(",");
  let index = 0;
  const slots = rows.map((row) => "(" + row.map(() => "$" + ++index).join(",") + ")");
  const inserted = await client.query({
    text: `INSERT INTO ${identifier(table)} (${names}) VALUES ${slots.join(",")} RETURNING ${names}`,
    values: rows.flat(),
    rowMode: "array",
  });
  const encode = (items) => items.map((row) => JSON.stringify(row)).sort();
  const expected = encode(rows);
  const actual = encode(inserted.rows);
  if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) {
    throw new Error("SQLite transfer verification failed for " + table);
  }
}

async function transferSqlite(client, directory) {
  const file = join(directory, "profile.sqlite");
  if (!existsSync(file)) return;
  const source = new DatabaseSync(file, { readOnly: true });
  const counts = {};
  try {
    source.exec("BEGIN");
    const sourceTables = source.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all();
    if (sourceTables.some(({ name }) => !name.startsWith("sqlite_") &&
      name !== "sprofile_migrations" && !tables.includes(name))) {
      throw new Error("The SQLite snapshot contains an unrecognized application table.");
    }
    for (const table of tables) {
      const name = identifier(table);
      if ((await client.query(`SELECT 1 FROM ${name} LIMIT 1`)).rowCount) {
        throw new Error("Supabase already contains data without a completed transfer marker: " + table);
      }
      const stmt = source.prepare(`SELECT * FROM ${name}`);
      const columns = stmt.columns().map((column) => column.name);
      stmt.setReturnArrays(true);
      let batch = [];
      for (const row of stmt.iterate()) {
        batch.push(row);
        if (batch.length === 100) {
          await copyRows(client, table, columns, batch);
          batch = [];
        }
      }
      if (batch.length) await copyRows(client, table, columns, batch);
      const count = source.prepare(`SELECT count(*) AS n FROM ${name}`).get().n;
      if ((await client.query(`SELECT count(*) AS n FROM ${name}`)).rows[0].n !== count) {
        throw new Error("SQLite row count differs after transferring " + table);
      }
      counts[table] = count;
    }
    await client.query(`SELECT setval(pg_get_serial_sequence('revisions','seq'),
      coalesce(max(seq), 1), max(seq) IS NOT NULL) FROM revisions`);
  } finally {
    source.close();
  }
  return counts;
}

export async function initializePostgres(client, directory) {
  // DDL, the old volume's snapshot and its marker commit together on first start.
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sprofile.migrations'))");
    await client.query("CREATE TABLE IF NOT EXISTS sprofile_migrations(name text PRIMARY KEY)");
    const applied = new Set((await client.query("SELECT name FROM sprofile_migrations")).rows.map((r) => r.name));
    const folder = new URL("./postgres/", import.meta.url);
    const mark = (name) => client.query("INSERT INTO sprofile_migrations(name) VALUES ($1)", [name]);
    for (const file of readdirSync(folder).filter((f) => f.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      await client.query(readFileSync(new URL(file, folder), "utf8"));
      await mark(file);
    }
    let counts;
    if (!applied.has("railway-sqlite-transfer-v1")) {
      counts = await transferSqlite(client, directory);
      await mark("railway-sqlite-transfer-v1");
    }
    await client.query("COMMIT");
    if (counts) console.info("Verified SQLite transfer to PostgreSQL", JSON.stringify(counts));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
