import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const scratch = await mkdtempDisposable(join(tmpdir(), "sprofile-pg-"));
const data = join(scratch.path, "cluster");
const password = randomBytes(32).toString("hex");
const passwordFile = join(scratch.path, "init-password");
await writeFile(passwordFile, password, { mode: 0o600 });
const listener = createServer();
await new Promise((ready) => listener.listen(0, "127.0.0.1", ready));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
function command(name, args, options = {}) {
  const result = spawnSync(name, args, { stdio: "inherit", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(name + " exited with " + result.status);
}
const url = (user, db) => `postgresql://${user}:${password}@127.0.0.1:${port}/${db}`;
let running = false;
try {
  command("initdb", ["-D", data, "--username=sprofile_test_owner", "--auth=scram-sha-256",
    "--encoding=UTF8", "--no-locale", "--no-sync", "--pwfile=" + passwordFile]);
  command("pg_ctl", ["-D", data, "-l", join(scratch.path, "postgres.log"), "-o",
    "-h 127.0.0.1 -p " + port, "-w", "start"]);
  running = true;
  const admin = new pg.Client({ connectionString: url("sprofile_test_owner", "postgres") });
  await admin.connect();
  try {
    await admin.query("CREATE ROLE sprofile_test_app LOGIN PASSWORD '" + password + "'");
    for (const mode of ["fresh", "cutover"]) {
      const db = "sprofile_test_" + mode;
      await admin.query("CREATE DATABASE " + db);
      const owner = new pg.Client({ connectionString: url("sprofile_test_owner", db) });
      await owner.connect();
      try {
        await owner.query("CREATE SCHEMA sprofile; GRANT USAGE, CREATE ON SCHEMA sprofile TO sprofile_test_app");
      } finally {
        await owner.end();
      }
      const args = ["--import", "./scripts/sites-env.mjs", "./scripts/test-profile.mjs", "--railway"];
      if (mode === "cutover") args.push("--cutover");
      command(process.execPath, args, {
        env: { ...process.env, SPROFILE_TEST_PG_URL: url("sprofile_test_app", db) },
      });
    }
  } finally {
    await admin.end();
  }
} finally {
  if (running) command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  await scratch.remove();
}
