import type { KVNamespace } from "@cloudflare/workers-types";

// ─────────────────────────────────────────────────────────
// Email-scoped account lockout after consecutive failed logins.
//
// Threshold: 5 consecutive failures inside a 30-minute rolling window
// triggers a 15-minute lockout on the email. Counter resets on:
//   (a) successful login, or
//   (b) the failure window naturally expiring (KV TTL).
//
// Why KV and not the `users` table? The events we need to track are
// high-frequency per email during an attack (hundreds of probes/min)
// and we don't want to saturate the Postgres connection pool writing
// each failure. KV is the right storage.
//
// Keys:
//   aulk:fail:<lower-email>   — integer failure count, TTL = window
//   aulk:block:<lower-email>  — present == blocked, TTL = lockout len
// ─────────────────────────────────────────────────────────

const MAX_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 30 * 60; // 30 minutes
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function isAccountLocked(
  kv: KVNamespace,
  email: string
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const key = `aulk:block:${normalizeEmail(email)}`;
  try {
    const { value, metadata } = await kv.getWithMetadata<{ unlockAt: number }>(
      key,
      "text"
    );
    if (!value) return { locked: false, retryAfterSeconds: 0 };
    const unlockAt = (metadata as any)?.unlockAt as number | undefined;
    const remaining = unlockAt
      ? Math.max(1, unlockAt - Math.floor(Date.now() / 1000))
      : LOCKOUT_SECONDS;
    return { locked: true, retryAfterSeconds: remaining };
  } catch {
    return { locked: false, retryAfterSeconds: 0 };
  }
}

export async function recordFailedLogin(
  kv: KVNamespace,
  email: string
): Promise<{ locked: boolean; retryAfterSeconds: number; attempts: number }> {
  const e = normalizeEmail(email);
  const failKey = `aulk:fail:${e}`;
  const blockKey = `aulk:block:${e}`;

  let current = 0;
  try {
    const raw = await kv.get(failKey);
    current = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    current = 0;
  }
  const next = current + 1;

  try {
    await kv.put(failKey, String(next), {
      expirationTtl: FAILURE_WINDOW_SECONDS,
    });
  } catch {
    // Fail-open on KV write — recording attempts is best-effort.
  }

  if (next >= MAX_FAILURES) {
    const unlockAt = Math.floor(Date.now() / 1000) + LOCKOUT_SECONDS;
    try {
      await kv.put(blockKey, "1", {
        expirationTtl: LOCKOUT_SECONDS,
        metadata: { unlockAt },
      });
      // Clear the counter so the next retry after unlock starts fresh.
      await kv.delete(failKey);
    } catch {
      // Fall through — we still return locked:true so the caller blocks.
    }
    return {
      locked: true,
      retryAfterSeconds: LOCKOUT_SECONDS,
      attempts: next,
    };
  }

  return { locked: false, retryAfterSeconds: 0, attempts: next };
}

export async function clearFailedLogins(
  kv: KVNamespace,
  email: string
): Promise<void> {
  const e = normalizeEmail(email);
  try {
    await Promise.all([
      kv.delete(`aulk:fail:${e}`),
      kv.delete(`aulk:block:${e}`),
    ]);
  } catch {
    // Non-fatal.
  }
}
