import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createRailwayApp } from "../railway/server.mjs";
import { openStorage } from "../railway/storage.mjs";
import { entryFormatMigration } from "../railway/entry-migration.mjs";

export async function createRailwayTestRuntime() {
  const scratch = await mkdtempDisposable(join(tmpdir(), "sprofile-railway-"));
  const key = randomBytes(32).toString("hex");
  const databaseUrl = process.env.SPROFILE_TEST_PG_URL;
  if (databaseUrl) {
    const target = new URL(databaseUrl);
    if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/sprofile_test_")) {
      throw new Error("The PostgreSQL integration fixture requires a local test database.");
    }
  }
  const config = {
    directory: scratch.path,
    origin: "http://127.0.0.1",
    secret: randomBytes(48).toString("hex"),
    ownerDigest: createHash("sha256").update(key).digest("hex"),
    databaseUrl: process.argv.includes("--cutover") ? undefined : databaseUrl,
  };
  let server, close, address;
  async function start() {
    const runtime = await createRailwayApp(config);
    close = runtime.close;
    await new Promise((ready) => {
      server = serve({
        fetch: runtime.app.fetch,
        hostname: "127.0.0.1",
        port: 0,
        overrideGlobalObjects: false,
      }, ({ port }) => {
        address = "http://127.0.0.1:" + port;
        ready();
      });
    });
  }
  async function stop() {
    await new Promise((finish, reject) => server.close((error) => error ? reject(error) : finish()));
    await close();
  }
  await start();
  return {
    key,
    dispatchFetch(url, init) {
      const { pathname, search } = new URL(url);
      return fetch(address + pathname + search, init);
    },
    async restartWithLegacyEntry(id, originalBody) {
      await stop();
      const originalStore = await openStorage(scratch.path, config.databaseUrl);
      const query = "SELECT data,version,updated_at FROM entries WHERE id=?";
      const revision = "SELECT seq,after FROM revisions WHERE entity='entries' AND entity_id=? ORDER BY seq DESC LIMIT 1";
      let original, historical;
      try {
        const db = originalStore.DB;
        original = await db.prepare(query).bind(id).first();
        historical = await db.prepare(revision).bind(id).first();
        const entry = JSON.parse(original.data);
        const fields = { body: originalBody, author: "原表作者" };
        historical.after = JSON.stringify({ ...JSON.parse(historical.after), ...fields });
        await db.batch([
          db.prepare("UPDATE entries SET data=? WHERE id=?").bind(JSON.stringify({ ...entry, ...fields }), id),
          db.prepare("UPDATE revisions SET after=? WHERE seq=?").bind(historical.after, historical.seq),
          db.prepare("DELETE FROM sprofile_migrations WHERE name=?").bind(entryFormatMigration),
          db.prepare("INSERT INTO sprofile_migrations(name) VALUES(?) ON CONFLICT(name) DO NOTHING").bind("entry-date-heading-v1"),
        ]);
      } finally {
        await originalStore.close();
      }
      config.databaseUrl = databaseUrl;
      await start();
      const migrated = await openStorage(scratch.path, config.databaseUrl);
      try {
        const current = await migrated.DB.prepare(query).bind(id).first();
        assert.deepEqual(JSON.parse(current.data), JSON.parse(original.data));
        assert.equal(current.version, original.version);
        assert.equal(current.updated_at, original.updated_at);
        assert.equal((await migrated.DB.prepare(revision).bind(id).first()).after, historical.after);
        return historical.seq;
      } finally {
        await migrated.close();
      }
    },
    async dispose() {
      await stop();
      await scratch.remove();
    },
  };
}
