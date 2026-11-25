import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

// The existing business and Drizzle auth layers share this subset of D1's API.
class Statement {
  constructor(statement, values = []) {
    this.statement = statement;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.statement, values);
  }
  execute() {
    if (this.statement.columns().length) {
      return { success: true, results: this.statement.all(...this.values), meta: {} };
    }
    const { changes, lastInsertRowid } = this.statement.run(...this.values);
    return { success: true, results: [], meta: { changes, last_row_id: lastInsertRowid } };
  }
  async run() {
    return this.execute();
  }
  async all() {
    return this.execute();
  }
  async first(column) {
    const row = this.statement.get(...this.values);
    if (!row) return null;
    return column === undefined ? row : row[column];
  }
  async raw() {
    this.statement.setReturnArrays(true);
    try {
      return this.statement.all(...this.values);
    } finally {
      this.statement.setReturnArrays(false);
    }
  }
}

function transaction(connection, action) {
  connection.exec("BEGIN IMMEDIATE");
  try {
    const value = action();
    connection.exec("COMMIT");
    return value;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

function migrate(connection) {
  const folder = new URL("../drizzle/", import.meta.url);
  connection.exec("CREATE TABLE IF NOT EXISTS sprofile_migrations (name TEXT PRIMARY KEY)");
  const applied = connection.prepare("SELECT 1 FROM sprofile_migrations WHERE name=?");
  const mark = connection.prepare("INSERT INTO sprofile_migrations(name) VALUES(?)");
  for (const file of readdirSync(folder).filter((name) => name.endsWith(".sql")).sort()) {
    transaction(connection, () => {
      if (applied.get(file)) return;
      connection.exec(readFileSync(new URL(file, folder), "utf8"));
      mark.run(file);
    });
  }
}

function fileBucket(directory) {
  function pathFor(key) {
    const file = resolve(directory, key);
    if (!file.startsWith(directory + sep)) throw new Error("Invalid storage key");
    return file;
  }
  return {
    async put(key, value) {
      const target = pathFor(key);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const temporary = target + "." + randomUUID() + ".tmp";
      try {
        const contents = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async get(key) {
      try {
        return new Response(await readFile(pathFor(key)));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

export function openStorage(directory) {
  const objects = resolve(directory, "objects");
  mkdirSync(objects, { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(join(directory, "profile.sqlite"));
  try {
    connection.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON");
    migrate(connection);
  } catch (error) {
    connection.close();
    throw error;
  }
  return {
    DB: {
      prepare(sql) {
        return new Statement(connection.prepare(sql));
      },
      async batch(statements) {
        return transaction(connection, () => statements.map((statement) => statement.execute()));
      },
    },
    BUCKET: fileBucket(objects),
    ready() {
      connection.prepare('SELECT 1 FROM "user" LIMIT 1').get();
    },
    close() {
      connection.close();
    },
  };
}
