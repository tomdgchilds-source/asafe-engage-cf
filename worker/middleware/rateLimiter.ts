import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env, Variables } from "../types";

// ─────────────────────────────────────────────────────────
// KV-backed fixed-window rate limiter.
//
// Storage: `KV_SESSIONS` (already bound — see wrangler.toml). Keys use
// the prefix `rl:` so they never collide with real session keys
// (`session:<uuid>`) or OAuth state keys (`oauth_state:<uuid>`).
//
// Key shape:  rl:<endpoint>:<ip>:<window-start-epoch-seconds>
// TTL:        `windowSeconds` — KV expires the counter on its own.
//
// This is a *fixed* window, not sliding. Fixed is fine here because:
//   (a) Workers' KV has no atomic increment primitive, and
//   (b) the attack model is credential stuffing / brute force, not
//       millisecond-precision throttling.
//
// We do a read → +1 → put back. Two concurrent requests might both
// read N and both write N+1, so the counter undercounts by up to
// concurrent-request-count. The limits below are low enough that
// that's acceptable.
//
// Over-limit responses carry a `Retry-After` header with the number of
// seconds until the current window ends.
// ─────────────────────────────────────────────────────────

export type RateLimitOptions = {
  /** Short label used in KV keys and error payloads. */
  endpoint: string;
  /** Max requests allowed in the window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Optional override for the key subject — defaults to IP address. */
  keyFn?: (c: Context<{ Bindings: Env; Variables: Variables }>) => string;
};

function getClientIp(
  c: Context<{ Bindings: Env; Variables: Variables }>
): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp;
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(
    async (c, next) => {
      const subject = options.keyFn ? options.keyFn(c) : getClientIp(c);
      const now = Math.floor(Date.now() / 1000);
      const windowStart =
        Math.floor(now / options.windowSeconds) * options.windowSeconds;
      const key = `rl:${options.endpoint}:${subject}:${windowStart}`;

      let current = 0;
      try {
        const raw = await c.env.KV_SESSIONS.get(key);
        current = raw ? parseInt(raw, 10) || 0 : 0;
      } catch {
        // Fail open on KV read errors — better than locking out real users
        // if KV briefly misbehaves.
        current = 0;
      }

      if (current >= options.max) {
        const retryAfter = windowStart + options.windowSeconds - now;
        c.header("Retry-After", Math.max(1, retryAfter).toString());
        return c.json(
          {
            message:
              "Too many requests — please slow down and try again shortly.",
          },
          429
        );
      }

      try {
        await c.env.KV_SESSIONS.put(key, String(current + 1), {
          expirationTtl: options.windowSeconds + 5,
        });
      } catch {
        // Fail open on KV write errors for the same reason as above.
      }

      await next();
    }
  );
}

// ─────────────────────────────────────────────────────────
// Preset limiters for the auth endpoints. Numbers tuned to:
//  - Login:  10 per 15 minutes per IP — comfortably above legitimate
//    fat-fingered retries, but enough to slow a password-spray bot.
//  - Reset:  5 per 15 minutes per IP — reset token generation is
//    expensive (DB write + email dispatch).
//  - Signup: 5 per hour per IP — creating junk accounts is the cheapest
//    abuse vector; the hourly cap keeps the cost manageable.
// ─────────────────────────────────────────────────────────

export const loginRateLimit = rateLimit({
  endpoint: "login",
  max: 10,
  windowSeconds: 15 * 60,
});

export const resetPasswordRateLimit = rateLimit({
  endpoint: "reset-password",
  max: 5,
  windowSeconds: 15 * 60,
});

export const forgotPasswordRateLimit = rateLimit({
  endpoint: "forgot-password",
  max: 5,
  windowSeconds: 15 * 60,
});

export const signupRateLimit = rateLimit({
  endpoint: "signup",
  max: 5,
  windowSeconds: 60 * 60,
});

// ─────────────────────────────────────────────────────────
// Per-user (or per-IP fallback) mutation limiters.
//
// Unlike the auth limiters above — which use a fixed window keyed on
// IP — these run a light sliding window keyed on the authenticated
// user id. Two buckets per minute (current + previous) are summed and
// compared against the limit, which smooths out the spikes a strict
// fixed-window gives when the minute rolls. Implementation still uses
// only KV_SESSIONS primitives (get/put, no atomics).
//
// Key shape: `rl:mut:<subject>:<minute-bucket-epoch>`
// Subject is the user id when authed, or the client IP as belt-and-
// braces fallback — authMiddleware runs before this on every covered
// route, so fallback is never hit in practice.
//
// Over-limit responses carry a `Retry-After` header with the number
// of seconds until the current minute rolls.
// ─────────────────────────────────────────────────────────

function mutationSubject(
  c: Context<{ Bindings: Env; Variables: Variables }>
): string {
  const session = c.get("user");
  const userId = session?.claims?.sub;
  if (userId) return `u:${userId}`;
  return `ip:${getClientIp(c)}`;
}

function slidingWindowMutationLimiter(opts: {
  bucketTag: string;
  max: number;
}) {
  const windowSeconds = 60;
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(
    async (c, next) => {
      const subject = mutationSubject(c);
      const now = Math.floor(Date.now() / 1000);
      const currentBucket = Math.floor(now / windowSeconds) * windowSeconds;
      const previousBucket = currentBucket - windowSeconds;
      const currentKey = `rl:mut:${opts.bucketTag}:${subject}:${currentBucket}`;
      const previousKey = `rl:mut:${opts.bucketTag}:${subject}:${previousBucket}`;

      let currentCount = 0;
      let previousCount = 0;
      try {
        const [curRaw, prevRaw] = await Promise.all([
          c.env.KV_SESSIONS.get(currentKey),
          c.env.KV_SESSIONS.get(previousKey),
        ]);
        currentCount = curRaw ? parseInt(curRaw, 10) || 0 : 0;
        previousCount = prevRaw ? parseInt(prevRaw, 10) || 0 : 0;
      } catch {
        // Fail open on KV read errors.
        currentCount = 0;
        previousCount = 0;
      }

      // Weight the previous bucket by how far we are into the current
      // window — classic sliding-log approximation.
      const elapsedInCurrent = now - currentBucket;
      const previousWeight = Math.max(
        0,
        (windowSeconds - elapsedInCurrent) / windowSeconds
      );
      const weightedTotal = currentCount + previousCount * previousWeight;

      if (weightedTotal >= opts.max) {
        const retryAfter = windowSeconds - elapsedInCurrent;
        c.header("Retry-After", Math.max(1, retryAfter).toString());
        return c.json(
          {
            message:
              "Too many requests — please slow down and try again shortly.",
          },
          429
        );
      }

      try {
        await c.env.KV_SESSIONS.put(currentKey, String(currentCount + 1), {
          // Keep the current bucket for one full window past its end so
          // the previous-bucket lookup on the next minute still resolves.
          expirationTtl: windowSeconds * 2 + 5,
        });
      } catch {
        // Fail open on KV write errors.
      }

      await next();
    }
  );
}

/** 60 mutations per user per minute. Covers most POST/PATCH/DELETE endpoints.
 *  Falls back to per-IP when there's no authenticated user (shouldn't happen
 *  on these routes but belt-and-braces). */
export const mutationRateLimit = slidingWindowMutationLimiter({
  bucketTag: "std",
  max: 60,
});

/** 20 mutations per user per minute for expensive endpoints (layout drawing
 *  uploads, order creation, site-survey writes). */
export const heavyMutationRateLimit = slidingWindowMutationLimiter({
  bucketTag: "heavy",
  max: 20,
});

/** 3 mutations per user per day. Used exclusively by the self-service
 *  account-deletion endpoint — the legitimate use case is once, ever. */
export const accountDeletionRateLimit = rateLimit({
  endpoint: "account-deletion",
  max: 3,
  windowSeconds: 24 * 60 * 60,
  keyFn: (c) => {
    const session = c.get("user");
    const userId = session?.claims?.sub;
    if (userId) return `u:${userId}`;
    return `ip:${getClientIp(c)}`;
  },
});
