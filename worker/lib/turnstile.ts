// Cloudflare Turnstile — server-side verification helper.
//
// Both the site key (public) and secret key (private) are optional. When
// the secret is absent, verification is skipped (short-circuits to ok)
// so dev / unprovisioned environments still work. A single WARN line is
// emitted at boot via `logTurnstileBootStatus` in worker/index.ts.
//
// Verify endpoint: https://challenges.cloudflare.com/turnstile/v0/siteverify
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

let secretWarned = false;

export type TurnstileResult = {
  ok: boolean;
  reason?: string;
  raw?: any;
};

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | undefined,
  secret: string | undefined,
): Promise<TurnstileResult> {
  // Secret missing → skip verification entirely, log once.
  if (!secret) {
    if (!secretWarned) {
      console.warn("[turnstile] secret missing; verification skipped");
      secretWarned = true;
    }
    return { ok: true, reason: "skipped" };
  }

  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }

    const raw = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
      hostname?: string;
    };

    if (raw.success === true) {
      return { ok: true, raw };
    }

    const errs = (raw["error-codes"] || []).join(",") || "verification_failed";
    return { ok: false, reason: errs, raw };
  } catch (err: any) {
    return { ok: false, reason: err?.message || "network_error" };
  }
}

// Called once at boot to log site-key status. Secret status is logged
// lazily the first time verifyTurnstile() is called without a secret.
export function logTurnstileBootStatus(env: {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}) {
  if (!env.TURNSTILE_SITE_KEY) {
    console.warn("[turnstile] site key missing; client widget disabled");
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn("[turnstile] secret missing; verification skipped");
  }
}
