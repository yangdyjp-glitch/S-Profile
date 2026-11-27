import { fileURLToPath } from "node:url";
import pg from "pg";
import { initializePostgres } from "./postgres-migrations.mjs";

// Only trusted query templates are translated. Values are sent separately to pg.
function postgresSql(sql) {
  let n = 0;
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|\?|\bjson_(?:group_)?array(?=\s*\()/gi, (token) => {
    if (token === "?") return "$" + ++n;
    // Drizzle's SQLite relational queries encode joined rows as JSON arrays.
    switch (token.toLowerCase()) {
      case "json_array": return "json_build_array";
      case "json_group_array": return "json_agg";
      default: return token;
    }
  });
}

function poolFor(connectionString) {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  if (url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co")) {
    if (url.port === "6543") throw new Error("Use a Supabase session pooler URL on port 5432.");
    if (!url.searchParams.has("sslrootcert")) {
      url.searchParams.set("sslrootcert", fileURLToPath(new URL("./supabase-ca.crt", import.meta.url)));
    }
  }
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 4,
    pipeline: true,
    idleTimeoutMillis: 120000,
    connectionTimeoutMillis: 15000,
    application_name: "S-Profile",
    types: {
      getTypeParser(oid, format) {
        if (oid !== pg.types.builtins.INT8 || format === "binary") return pg.types.getTypeParser(oid, format);
        return (value) => {
          const integer = Number(value);
          if (!Number.isSafeInteger(integer)) throw new RangeError("PostgreSQL integer exceeds the supported range.");
          return integer;
        };
      },
    },
    async onConnect(client) {
      await client.query("SET search_path TO sprofile");
      const { rows } = await client.query("SELECT current_schema() AS name");
      if (rows[0].name !== "sprofile") throw new Error("The application role needs access to the sprofile schema.");
    },
  });
  pool.on("error", (error) => console.error("PostgreSQL idle connection closed", error.code || error.name));
  return pool;
}

class Statement {
  constructor(pool, text, values = []) {
    this.pool = pool;
    this.text = text;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.pool, this.text, values);
  }
  async run(client = this.pool) {
    const result = await client.query(this.text, this.values);
    return { success: true, results: result.rows, meta: { changes: result.rowCount } };
  }
  all() { return this.run(); }
  async first(column) {
    const { rows } = await this.pool.query(this.text, this.values);
    if (!rows.length) return null;
    return column === undefined ? rows[0] : rows[0][column];
  }
  async raw() {
    const { rows } = await this.pool.query({ text: this.text, values: this.values, rowMode: "array" });
    return rows;
  }
}

export async function openPostgres(connectionString, directory) {
  const pool = poolFor(connectionString);
  try {
    const client = await pool.connect();
    try {
      await initializePostgres(client, directory);
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    backend: "postgresql",
    DB: {
      prepare(sql) { return new Statement(pool, postgresSql(sql)); },
      async batch(statements) {
        const readOnly = statements.every((stmt) => /^\s*SELECT\b/i.test(stmt.text));
        const client = await pool.connect();
        try {
          await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
          // One connection executes these in order. Guards run after the write lock and
          // see the prior writer's commit, without a network wait between statements.
          const lock = readOnly ? null : client.query("SELECT pg_advisory_xact_lock(hashtext('sprofile.writes'))");
          const [, result] = await Promise.all([lock, Promise.all(statements.map((stmt) => stmt.run(client)))]);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    },
    ready() { return pool.query('SELECT 1 FROM "user" LIMIT 1'); },
    close() { return pool.end(); },
  };
}
