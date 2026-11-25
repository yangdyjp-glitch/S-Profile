import {
  accountAdmin,
  authentication,
  bootstrap,
  member,
  setupAvailable,
} from "./auth";
import { business } from "./business";
import {
  automatic,
  batches,
  original,
  prepare,
  resolve,
  review,
  sourceRow,
  upload,
} from "./imports";
import { exportData } from "./exports";
import { all, commit, history, one, snapshot, type Input } from "./store";
import { Problem } from "./validation";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function api(
  request: Request,
  env: Cloudflare.Env,
  isSetupOwner?: boolean,
) {
  try {
    const url = new URL(request.url),
      p = url.pathname
        .slice(5)
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
    const [section, key, child, arg] = p,
      method = request.method,
      db = env.DB;
    if (!db) throw new Problem(503, "数据库暂不可用");
    if (
      !["GET", "HEAD"].includes(method) &&
      request.headers.get("origin") !== url.origin
    )
      throw new Problem(403, "请求来源无效，请刷新后再试");
    const auth = authentication(env, url.origin);
    if (section === "auth") {
      const path = p.slice(1).join("/");
      if (
        method !== "POST" ||
        !["sign-in/username", "sign-out", "change-password"].includes(path)
      )
        throw new Problem(404, "认证接口不存在");
      let req = request;
      if (path === "change-password") {
        const body = (await request.json()) as Input;
        req = new Request(request, {
          body: JSON.stringify({ ...body, revokeOtherSessions: true }),
        });
      }
      const res = await auth.handler(req),
        h = new Headers(res.headers);
      h.set("Cache-Control", "private, no-store");
      h.set("Vary", "Cookie");
      if (path === "sign-in/username" && !res.ok)
        return json(
          {
            message:
              res.status === 429
                ? "尝试过于频繁，请稍后再试"
                : "用户名或密码不正确，或账号已停用",
          },
          res.status,
        );
      if (res.ok)
        return new Response(JSON.stringify({ ok: true }), {
          headers: h,
          status: 200,
        });
      return new Response(res.body, { status: res.status, headers: h });
    }
    const body = async (): Promise<Input> => {
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new Problem(422, "请使用 JSON 提交表单");
      try {
        const v = await request.json();
        if (v && typeof v === "object" && !Array.isArray(v)) return v as Input;
      } catch {
        /* invalid body */
      }
      throw new Problem(422, "提交内容无效");
    };
    if (section === "setup" && method === "POST")
      return json(
        await bootstrap(request, env, auth, key, await body(), isSetupOwner),
      );
    const actor = await member(auth, request.headers);
    if (section === "access" && method === "GET")
      return json({
        user: actor,
        canSetup: !actor && (await setupAvailable(request, env, isSetupOwner)),
      });
    if (!actor) throw new Problem(401, "请先使用内部账号登录");
    if (section === "workspace" && method === "GET")
      return json(await snapshot(db));
    if (section === "admin" && key === "users")
      return json(
        await accountAdmin(
          db,
          auth,
          actor,
          method,
          child,
          method === "GET" ? {} : await body(),
        ),
      );
    if (section === "history" && method === "GET")
      return json(
        await history(
          db,
          key,
          child,
          Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER,
        ),
      );
    if (section === "exports" && method === "POST")
      return json(await exportData(db, env.BUCKET!, await body()));
    if (section === "imports") {
      if (!env.BUCKET) throw new Problem(503, "文件存储暂不可用");
      if (!key && method === "GET") return json(await batches(db));
      if (!key && method === "POST")
        return json(await upload(request, db, env.BUCKET, actor));
      if (child === "original" && method === "GET")
        return await original(db, env.BUCKET, key);
      if (child === "prepare" && method === "POST")
        return json(await prepare(db, env.BUCKET, key));
      if (child === "advance" && method === "POST")
        return json(await automatic(db, env.BUCKET, actor, key));
      if (child === "review" && method === "GET")
        return json(
          arg
            ? await sourceRow(db, env.BUCKET, key, arg)
            : await review(
                db,
                key,
                url.searchParams.get("state") || "pending",
                Math.max(0, Number(url.searchParams.get("offset")) || 0),
              ),
        );
      if (child === "resolve" && method === "POST") {
        const input = await body();
        return json(
          await commit(
            db,
            actor,
            request.headers.get("idempotency-key"),
            url.pathname,
            input,
            () => resolve(db, env.BUCKET!, actor, key, input),
          ),
        );
      }
      throw new Problem(404, "导入操作不存在");
    }
    if (method === "GET") {
      if (section === "students" && child === "entries")
        return json(await all(db, "entries", "WHERE student_id=?", [key]));
      if (section === "services" && child === "applications")
        return json(await all(db, "applications", "WHERE service_id=?", [key]));
      if (section === "catalogs")
        return json(await all(db, "catalogs", "WHERE kind=?", [key]));
      if (
        section === "students" ||
        section === "services" ||
        section === "applications" ||
        section === "entries"
      )
        return json(key ? await one(db, section, key) : await all(db, section));
      throw new Problem(404, "接口不存在");
    }
    const input = await body();
    return json(
      await commit(
        db,
        actor,
        request.headers.get("idempotency-key"),
        method + " " + url.pathname,
        input,
        () => business(db, actor, method, p, input),
      ),
    );
  } catch (e) {
    if (e instanceof Problem)
      return json(
        { message: e.message, field: e.field, latest: e.latest },
        e.status,
      );
    const message = String(e);
    if (/UNIQUE constraint failed/.test(message))
      return json({ message: "名称或用户名已存在" }, 409);
    if (/version_guard/.test(message))
      return json({ message: "资料已更新，请重新核对" }, 409);
    console.error(
      "S-Profile request failed",
      request.method,
      new URL(request.url).pathname,
      e instanceof Error ? e.name : "Error",
    );
    return json(
      { message: "操作暂未完成，请重试；如持续出现，请联系管理员。" },
      500,
    );
  }
}
