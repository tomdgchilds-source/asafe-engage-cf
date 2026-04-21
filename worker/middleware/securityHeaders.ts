import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../types";

// ─────────────────────────────────────────────────────────
// Global security headers.
//
// Applied to EVERY response — API JSON, OAuth redirects, and the SPA
// shell served through the ASSETS binding. Mounted once at the root of
// the Hono app in `worker/index.ts`.
//
// Notes on choices:
//  - CSP allowlists cover Turnstile (challenges.cloudflare.com),
//    Matterport (my.matterport.com — site survey 3D scans embedded
//    via <iframe>), Google Maps JS API (maps.googleapis.com + maps.gstatic.com),
//    YouTube thumbnails (img.youtube.com), and the CDNs the logo-picker /
//    Clearbit autocomplete / Resend email / etc. talk to.
//  - `style-src 'unsafe-inline'` is required for Tailwind JIT + inline
//    component styles emitted by Radix/shadcn. Acceptable trade-off
//    because we avoid `script-src 'unsafe-inline'`.
//  - `frame-ancestors 'none'` is belt-and-braces with X-Frame-Options:
//    DENY — this app is never embedded.
//  - `X-Frame-Options: DENY` does not affect iframes we embed *into*
//    our page; it only blocks OUR page from being framed.
// ─────────────────────────────────────────────────────────

const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src":
    "'self' https://challenges.cloudflare.com https://maps.googleapis.com",
  "style-src":
    "'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src":
    "'self' data: blob: https://webcdn.asafe.com https://icons.duckduckgo.com https://upload.wikimedia.org https://commons.wikimedia.org https://logo.clearbit.com https://www.google.com https://maps.gstatic.com https://maps.googleapis.com https://api.iconify.design https://img.youtube.com",
  "font-src": "'self' data: https://fonts.gstatic.com",
  "connect-src":
    "'self' https://challenges.cloudflare.com https://autocomplete.clearbit.com https://api.resend.com https://maps.googleapis.com",
  "frame-src": "https://challenges.cloudflare.com https://my.matterport.com",
  "frame-ancestors": "'none'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
};

function buildCsp(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([name, value]) => `${name} ${value}`)
    .join("; ");
}

const CSP_HEADER = buildCsp();

export const securityHeaders = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  await next();

  // Responses returned by `env.ASSETS.fetch()` have immutable headers
  // — mutating them throws "Can't modify immutable headers" which
  // bubbled up as a 500 (including on 404 asset lookups from stale
  // cached bundle paths). Clone the response when we can't mutate
  // its headers in-place so security headers still flow through.
  let headers: Headers;
  try {
    // Probe: try to set something harmless first.
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    headers = c.res.headers;
  } catch {
    // Immutable — rebuild the response with a mutable header bag.
    const mutable = new Headers(c.res.headers);
    mutable.set("X-Content-Type-Options", "nosniff");
    const cloned = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers: mutable,
    });
    c.res = cloned;
    headers = cloned.headers;
  }

  // HSTS — preload-ready. Only meaningful over HTTPS; Workers is always
  // HTTPS in production.
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(self), interest-cohort=()"
  );
  // Merge: if a downstream handler already set a CSP, don't clobber it.
  if (!headers.get("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", CSP_HEADER);
  }
});

export default securityHeaders;
