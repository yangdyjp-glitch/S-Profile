import { createHash, randomBytes } from "node:crypto";
import { mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createRailwayApp } from "../railway/server.mjs";

export async function createRailwayTestRuntime() {
  const scratch = await mkdtempDisposable(join(tmpdir(), "sprofile-railway-"));
  const key = randomBytes(32).toString("hex");
  const config = {
    directory: scratch.path,
    origin: "http://127.0.0.1",
    secret: randomBytes(48).toString("hex"),
    ownerDigest: createHash("sha256").update(key).digest("hex"),
  };
  let server, close, address;
  async function start() {
    const runtime = createRailwayApp(config);
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
    close();
  }
  await start();
  return {
    key,
    dispatchFetch(url, init) {
      const { pathname, search } = new URL(url);
      return fetch(address + pathname + search, init);
    },
    async restart() {
      await stop();
      await start();
    },
    async dispose() {
      await stop();
      await scratch.remove();
    },
  };
}
