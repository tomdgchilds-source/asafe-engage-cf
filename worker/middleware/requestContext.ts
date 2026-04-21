import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../types";
import { createLogger } from "../lib/logger";

// ─────────────────────────────────────────────────────────
// Request-scoped context middleware.
//
// Stamps every request with a stable id (preferring the one Cloudflare
// injects via `cf-request-id`, otherwise minting a crypto-random UUID)
// and a per-request structured logger. Downstream handlers pull both
// via `c.get("requestId")` / `c.get("log")`. The id is echoed in the
// response as `X-Request-Id` so a user can quote it in a bug report
// and we can find the log line instantly.
//
// Mounted EARLY in worker/index.ts — before CORS and auth — so even
// rejected requests (CORS failures, auth failures) get logged + tagged.
// User id is populated lazily: it's only available after auth has run,
// so the logger falls back to requestId-only for unauthed calls. For
// authed calls the logger picks up the user after auth sets `user`.
// ─────────────────────────────────────────────────────────

export const requestContext = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const headerId = c.req.header("cf-request-id");
  const requestId =
    headerId && headerId.trim().length > 0 ? headerId.trim() : crypto.randomUUID();

  // At this point auth hasn't run yet, so user will almost always be
  // undefined. The inner `next()` may set it — we re-read afterwards
  // to log the real userId on the summary line.
  const preSession = c.get("user");
  const preUserId = preSession?.claims?.sub;
  const log = createLogger({ requestId, userId: preUserId });
  c.set("requestId", requestId);
  c.set("log", log);
  c.header("X-Request-Id", requestId);

  const started = Date.now();
  try {
    await next();
  } finally {
    const ms = Date.now() - started;
    const status = c.res.status;
    const postSession = c.get("user");
    const postUserId = postSession?.claims?.sub;
    let path = c.req.path;
    try {
      path = new URL(c.req.url).pathname;
    } catch {
      // Fall back to the raw path if URL parsing fails.
    }
    const summaryLog = postUserId && postUserId !== preUserId
      ? log.child({ userId: postUserId })
      : log;
    summaryLog.info("req", {
      method: c.req.method,
      path,
      status,
      ms,
    });
  }
});

export default requestContext;
