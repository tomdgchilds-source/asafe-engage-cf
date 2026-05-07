// ─────────────────────────────────────────────────────────
// withOpenAiRetry — retry wrapper for OpenAI API calls.
//
// Some Cloudflare datacenters intermittently get a 403
// `unsupported_country_region_territory` from OpenAI even though the
// account is in good standing — the request appears to be sourced from
// a region OpenAI blocks at the edge. The fix is to retry: on the next
// attempt the Worker is often re-routed through a different egress IP
// and the call succeeds. We also retry on the usual transient classes
// (5xx, 408, 429, network errors) so the wrapper is broadly useful.
//
// Anything that looks permanent (auth, validation, billing, content
// policy) is surfaced immediately — we don't burn quota retrying a
// genuine 4xx.
//
// Usage:
//   const json = await withOpenAiRetry("embeddings.create", async () => {
//     const res = await fetch("https://api.openai.com/v1/embeddings", { ... });
//     if (!res.ok) {
//       const body = await res.text();
//       throw new OpenAiHttpError(res.status, body);
//     }
//     return res.json();
//   });
//
// For raw fetch call sites we expose `OpenAiHttpError` so the caller's
// own error path can carry status + body into the retry decision.
// ─────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Total retries after the first attempt. Defaults to 3 (so up to 4 attempts). */
  retries?: number;
  /** Base backoff in ms — doubled each attempt. Defaults to 500ms. */
  baseDelayMs?: number;
  /** Cap so an unlucky run can't sleep forever. Defaults to 8000ms. */
  maxDelayMs?: number;
  /**
   * Optional injectables — primarily for tests. Production calls
   * should leave these undefined and use the real timers / RNG.
   */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Carries HTTP status + (truncated) body from a non-OK OpenAI response
 * so the retry decider can distinguish 5xx / 429 / the specific 403 case
 * from permanent 4xx like 401 / 400.
 */
export class OpenAiHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `OpenAI HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "OpenAiHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Decide whether an error is transient and worth retrying.
 * Exported only for tests — production code should call withOpenAiRetry.
 */
export function isRetryableOpenAiError(err: unknown): {
  retry: boolean;
  reason: string;
} {
  // Network-level: TypeError from fetch (DNS/TLS/closed connection) and
  // AbortError (request timed out). Both are transient.
  if (err instanceof TypeError) {
    return { retry: true, reason: `network:${err.message || "TypeError"}` };
  }
  if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
    return { retry: true, reason: "network:AbortError" };
  }

  // OpenAI SDK errors expose `status` directly. Raw-fetch call sites
  // throw OpenAiHttpError. Both shapes work here.
  const status =
    err instanceof OpenAiHttpError
      ? err.status
      : typeof err === "object" && err && typeof (err as { status?: unknown }).status === "number"
        ? ((err as { status: number }).status)
        : undefined;
  const body =
    err instanceof OpenAiHttpError
      ? err.body
      : typeof err === "object" && err && typeof (err as { message?: unknown }).message === "string"
        ? ((err as { message: string }).message)
        : "";

  if (status === undefined) {
    return { retry: false, reason: "unknown_error_shape" };
  }

  if (status >= 500) return { retry: true, reason: `http:${status}` };
  if (status === 408) return { retry: true, reason: "http:408_timeout" };
  if (status === 429) return { retry: true, reason: "http:429_rate_limit" };

  // The Cloudflare-datacenter quirk: OpenAI returns 403 with an
  // `unsupported_country_region_territory` payload from some egress IPs.
  // Retrying frequently lands on a different egress and succeeds.
  if (status === 403 && /unsupported_country_region_territory/i.test(body)) {
    return { retry: true, reason: "http:403_unsupported_region" };
  }

  // Everything else (400/401/402/403-other/404/422/etc.) is permanent —
  // do not retry, surface immediately so we don't burn quota.
  return { retry: false, reason: `http:${status}_permanent` };
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with exponential-backoff + jitter retries on transient
 * failures. See the file header for the retry policy.
 */
export async function withOpenAiRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  // attempt index is 0-based; total runs = retries + 1.
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const decision = isRetryableOpenAiError(err);
      const isLastAttempt = attempt === retries;
      if (!decision.retry || isLastAttempt) {
        // Final failure: attach retry context so callers / log readers
        // can see how many attempts ran before we gave up.
        if (err instanceof Error) {
          (err as Error & { retryContext?: unknown }).retryContext = {
            label,
            attempts: attempt + 1,
            retried: !decision.retry ? false : true,
            lastReason: decision.reason,
          };
        }
        throw err;
      }
      // Exponential backoff: base * 2^attempt, capped, with ±25% jitter.
      const expDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitterFactor = 0.75 + random() * 0.5; // [0.75, 1.25]
      const delay = Math.round(expDelay * jitterFactor);
      console.warn(
        "[openai-retry]",
        label,
        "attempt",
        attempt + 1,
        "after",
        decision.reason,
        `delay=${delay}ms`,
      );
      await sleep(delay);
    }
  }
  // Unreachable — the loop either returns or throws — but TS wants it.
  throw lastErr;
}
