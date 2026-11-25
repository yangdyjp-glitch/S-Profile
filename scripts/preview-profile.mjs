import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

// Wrangler reads .dev.vars beside the configuration. Keep this local-only
// configuration in the checkout root, outside the deployable server archive.
const generated = resolve("dist/server/wrangler.json");
if (!existsSync(generated)) throw new Error("请先运行 npm run build。");
const config = JSON.parse(readFileSync(generated, "utf8"));
config.main = resolve("dist/server", config.main);
config.base_dir = resolve("dist/server");
config.assets.directory = resolve("dist/server", config.assets.directory);
for (const db of config.d1_databases) db.migrations_dir = "./drizzle";
const local = resolve(".sprofile.local.json");
writeFileSync(local, JSON.stringify(config));
const setup = process.argv[2] === "setup";
if (setup && !existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    "BETTER_AUTH_SECRET=" +
      randomBytes(48).toString("base64url") +
      "\nLOCAL_SETUP=loopback\n",
    { mode: 0o600, flag: "wx" },
  );
}
const args = setup
  ? ["d1", "migrations", "apply", "DB", "--local"]
  : ["dev", "--local", "--ip", "127.0.0.1", "--inspector-port", "0"];
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    ...args,
    "--config",
    local,
    "--persist-to",
    ".wrangler/state",
    ...process.argv.slice(setup ? 3 : 2),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
