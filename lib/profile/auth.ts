import { betterAuth } from "better-auth/minimal";
import { username } from "better-auth/plugins/username";
import { admin } from "better-auth/plugins/admin";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/auth-schema";
import {
  initialCatalogs,
  type Account,
  type Catalog,
  type Kind,
} from "./model";
import { digest, guard, meta, record, type Input } from "./store";
import { fail, id, Problem, string } from "./validation";

export function authentication(env: Cloudflare.Env, origin: string) {
  if (!env.BETTER_AUTH_SECRET) throw new Problem(503, "登录服务尚未配置");
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB!, { schema }), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    session: { cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: origin.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: { enabled: true, storage: "database" },
    plugins: [username({ maxUsernameLength: 40 }), admin()],
  });
}
export type Auth = ReturnType<typeof authentication>;
export async function member(
  auth: Auth,
  headers: Headers,
): Promise<Account | null> {
  const result = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!result || result.user.banned) return null;
  const u = result.user;
  return {
    id: u.id,
    name: u.name,
    role: u.role || "user",
    username: u.username || "",
  };
}
function owner(request: Request, env: Cloudflare.Env) {
  const hostname = new URL(request.url).hostname;
  if (
    env.LOCAL_SETUP === "loopback" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(hostname)
  )
    return true;
  const email = request.headers.get("oai-authenticated-user-email");
  return (
    !!env.SETUP_OWNER_EMAIL &&
    !!email &&
    email.toLowerCase() === env.SETUP_OWNER_EMAIL.toLowerCase()
  );
}
export async function setupAvailable(
  request: Request,
  env: Cloudflare.Env,
  isOwner = owner(request, env),
) {
  return (
    isOwner &&
    !(await env.DB!.prepare('SELECT 1 FROM "user" LIMIT 1').first())
  );
}
function credentials(input: Input) {
  const username = string(input.username).toLowerCase(),
    password = typeof input.password === "string" ? input.password : "",
    name = string(input.name);
  if (!/^[a-z0-9._]{3,40}$/.test(username))
    fail("username", "用户名需为 3–40 位字母、数字、点或下划线");
  passwordCheck(password);
  if (!name) fail("name", "请填写成员姓名");
  return { username, password, name };
}
function passwordCheck(password: string) {
  if (password.length < 10 || password.length > 128)
    fail("password", "密码长度须为 10–128 个字符");
}
async function accountPlan(
  db: D1Database,
  auth: Auth,
  input: Input,
  role: string,
) {
  const { username, password, name } = credentials(input),
    at = Date.now(),
    uid = id("U"),
    aid = id("AC");
  const hash = await (await auth.$context).password.hash(password);
  return {
    uid,
    sql: [
      db
        .prepare(
          'INSERT INTO "user"(id,name,email,email_verified,username,display_username,role,banned,created_at,updated_at) VALUES(?,?,?,0,?,?,?,0,?,?)',
        )
        .bind(
          uid,
          name,
          crypto.randomUUID() + "@accounts.invalid",
          username,
          username,
          role,
          at,
          at,
        ),
      db
        .prepare(
          'INSERT INTO "account"(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(?,?,?, ?,?,?,?)',
        )
        .bind(aid, uid, "credential", uid, hash, at, at),
    ],
  };
}
export async function bootstrap(
  request: Request,
  env: Cloudflare.Env,
  auth: Auth,
  action: string,
  input: Input,
  isOwner?: boolean,
) {
  if (!(await setupAvailable(request, env, isOwner)))
    throw new Problem(403, "初始化入口已关闭或当前访问者无权初始化");
  const db = env.DB!;
  if (action === "ticket") {
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    await db.batch([
      db
        .prepare("DELETE FROM setup_tickets WHERE expires < ?")
        .bind(Date.now()),
      db
        .prepare("INSERT INTO setup_tickets(digest,expires) VALUES(?,?)")
        .bind(await digest(ticket), Date.now() + 600000),
    ]);
    return { ticket };
  }
  if (action !== "complete") throw new Problem(404, "初始化操作不存在");
  const key = await digest(string(input.ticket));
  if (
    !(await db
      .prepare("SELECT 1 FROM setup_tickets WHERE digest=? AND expires>?")
      .bind(key, Date.now())
      .first())
  )
    throw new Problem(403, "初始化凭证已过期，请重新打开初始化表单");
  const { sql, uid } = await accountPlan(db, auth, input, "admin");
  const actor = {
    id: uid,
    name: string(input.name),
    username: string(input.username),
    role: "admin",
  };
  for (const [kind, names] of Object.entries(initialCatalogs)) {
    for (const name of names) {
      const c: Catalog = {
        ...meta(id("C")),
        kind: kind as Kind,
        name,
        active: true,
        aliases: [],
      };
      sql.push(...record(db, "catalogs", null, c, actor, "初始化名册"));
    }
  }
  await db.batch([
    guard(
      db,
      'NOT EXISTS(SELECT 1 FROM "user") AND EXISTS(SELECT 1 FROM setup_tickets WHERE digest=? AND expires>?)',
      key,
      Date.now(),
    ),
    ...sql,
    db.prepare("DELETE FROM setup_tickets"),
  ]);
  return { ok: true };
}
export async function accountAdmin(
  db: D1Database,
  auth: Auth,
  actor: Account,
  method: string,
  target: string | undefined,
  input: Input,
) {
  if (actor.role !== "admin") throw new Problem(403, "账号管理仅向管理员开放");
  if (method === "GET")
    return (
      await db
        .prepare(
          'SELECT id,name,username,role,banned FROM "user" ORDER BY created_at',
        )
        .all()
    ).results;
  if (!target && method === "POST") {
    const { sql, uid } = await accountPlan(
      db,
      auth,
      input,
      input.role === "admin" ? "admin" : "user",
    );
    await db.batch(sql);
    return { id: uid };
  }
  if (!target || method !== "PATCH") throw new Problem(404, "账号操作不存在");
  const u = await db
    .prepare('SELECT id FROM "user" WHERE id=?')
    .bind(target)
    .first();
  if (!u) throw new Problem(404, "账号不存在");
  const sql: D1PreparedStatement[] = [];
  if (input.action === "reset") {
    const password = typeof input.password === "string" ? input.password : "";
    passwordCheck(password);
    sql.push(
      db
        .prepare(
          "UPDATE account SET password=?,updated_at=? WHERE user_id=? AND provider_id=?",
        )
        .bind(
          await (await auth.$context).password.hash(password),
          Date.now(),
          target,
          "credential",
        ),
    );
  } else if (input.action === "disable" || input.action === "enable") {
    if (target === actor.id && input.action === "disable")
      fail("id", "不能停用自己正在使用的账号");
    sql.push(
      db
        .prepare('UPDATE "user" SET banned=?,updated_at=? WHERE id=?')
        .bind(input.action === "disable" ? 1 : 0, Date.now(), target),
    );
  } else fail("action", "未知账号操作");
  sql.push(db.prepare("DELETE FROM session WHERE user_id=?").bind(target));
  await db.batch(sql);
  return { ok: true };
}
