import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { api } from "../dist/railway/server/api.mjs";
import { openStorage } from "./storage.mjs";
import { readTyai, oldEntry } from "./tyai-assertion.mjs";
import { profileIdentity } from "./tyai-users.mjs";

export async function createRailwayApp({ directory, origin, secret, ownerDigest, databaseUrl }) {
  if (!directory || !secret || secret.length < 32) {
    throw new Error("A persistent data directory and a session secret of at least 32 characters are required.");
  }
  const base = new URL(origin);
  const ownerHash = /^[0-9a-f]{64}$/i.test(ownerDigest || "")
    ? Buffer.from(ownerDigest, "hex")
    : null;
  const storage = await openStorage(directory, databaseUrl);
  const bindings = { DB: storage.DB, BUCKET: storage.BUCKET, BETTER_AUTH_SECRET: secret };
  const app = new Hono();
  app.use("*", async (c, next) => {
    if(c.req.path==="/healthz")return next();
    try {
      const url=new URL(c.req.url);
      const claim=readTyai(c.req.header("x-tyai-identity"),"s-profile",c.req.method,url.pathname+url.search);
      if(url.pathname==="/api/tyai/identities"){
        if(claim?.kind!=="directory"&&claim?.kind!=="provision")return c.json({error:"需要平台授权"},403);
        return c.json(await profileIdentity(storage.DB,claim));
      }
      if(claim){
        if(claim.kind!=="user")return c.json({error:"请求用途无效"},403);
        c.set("tyai",claim);
      } else if(process.env.TYAI_ONLY==="1"){
        if(c.req.method==="GET"&&!url.pathname.startsWith("/api/"))return c.redirect(oldEntry("s-profile",url.pathname+url.search),302);
        return c.json({error:"请通过 TYAI 登录"},401);
      }
    } catch(error){ if(error.status)return c.json({error:error.message},error.status);throw error; }
    return next();
  });
  app.get("/healthz", async (c) => {
    await storage.ready();
    return c.json({ status: "ok", database: storage.backend }, 200, { "Cache-Control": "no-store" });
  });
  const compressData = compress({ threshold: 1500, contentTypeFilter: /^application\/json\b/ });
  app.use("/api/*", (c, next) => /^\/api\/(?:auth|setup)\//.test(c.req.path) ? next() : compressData(c, next));
  app.all("/api/*", async (c) => {
    const req = c.req.raw;
    const claim=c.get("tyai");
    const url = new URL(claim ? process.env.TYAI_ORIGIN : base);
    const incoming = new URL(req.url);
    url.pathname = incoming.pathname;
    url.search = incoming.search;
    const headers = new Headers(req.headers);
    const setupKey = headers.get("x-s-profile-setup");
    const isOwner = Boolean(
      ownerHash && setupKey &&
      timingSafeEqual(ownerHash, createHash("sha256").update(setupKey).digest()),
    );
    headers.delete("x-s-profile-setup");
    headers.delete("oai-authenticated-user-email");
    headers.delete("cf-connecting-ip");
    const ip = headers.get("x-real-ip");
    if (ip && isIP(ip)) headers.set("cf-connecting-ip", ip);
    const request = new Request(url, {
      method: req.method,
      headers,
      signal: req.signal,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      duplex: "half",
    });
    if(!claim)return api(request, bindings, isOwner);
    try { return api(request,bindings,false,await profileIdentity(storage.DB,claim)); }
    catch(error){if(error.status)return c.json({error:error.message},error.status);throw error;}
  });
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.ok) return;
    const asset = c.req.path.startsWith("/assets/");
    const cache = asset ? "public, max-age=31536000, immutable"
      : c.req.path === "/campus.webp" ? "public, max-age=86400" : "no-cache";
    c.header("Cache-Control", cache);
    if (asset && /\.(js|css)$/.test(c.req.path)) c.header("Vary", "Accept-Encoding");
  });
  app.use("*", serveStatic({ root: "./dist/railway/client", precompressed: true }));
  return { app, close: () => storage.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const env = process.env;
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (env.RAILWAY_ENVIRONMENT_ID && !mount) {
    throw new Error("Attach a Railway volume before starting the student service.");
  }
  if (env.RAILWAY_ENVIRONMENT_ID && !env.DATABASE_URL) {
    throw new Error("Configure DATABASE_URL before starting the Railway service.");
  }
  const { app, close } = await createRailwayApp({
    directory: mount ? join(mount, "s-profile") : env.SPROFILE_DATA_DIR,
    origin: env.SPROFILE_ORIGIN || (env.RAILWAY_PUBLIC_DOMAIN && "https://" + env.RAILWAY_PUBLIC_DOMAIN),
    secret: env.BETTER_AUTH_SECRET,
    ownerDigest: env.SPROFILE_SETUP_SHA256,
    databaseUrl: env.DATABASE_URL,
  });
  const server = serve({
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: Number(env.PORT || 8787),
    overrideGlobalObjects: false,
  }, ({ port }) => console.log("S-Profile listening on port " + port));
  const stop = () => server.close(close);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
