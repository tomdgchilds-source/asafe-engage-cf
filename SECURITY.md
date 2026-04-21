# Security Policy

A-SAFE Engage is a B2B SaaS app for the A-SAFE sales team and their
named customer contacts. This document summarises the security
posture of the production deployment and how to report a suspected
vulnerability.

## Threat model

- **Product type:** tenant-isolated B2B SaaS (Cloudflare Workers +
  Hono API + React SPA + Neon Postgres).
- **Tenant boundary:** each authenticated user is their own tenant.
  Sharing is explicit and opt-in via `project_collaborators` rows;
  there is no implicit cross-user visibility.
- **External attack surface:**
  - Public marketing pages (SPA shell, unauthenticated).
  - Magic-link share endpoints used for external approvers (bearer
    token, 30-day expiry, single-use).
  - Auth endpoints (`/api/login`, `/api/register`, `/api/forgot-password`,
    `/api/reset-password`).
- **Explicit non-goals:** the product is not a public-facing
  consumer app; anonymous write access is never exposed.

## Security headers

Applied globally via `worker/middleware/securityHeaders.ts`:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy` with strict `default-src 'self'`,
  explicit allow-list for Cloudflare Turnstile, Google Maps, Matterport
  embeds, and approved image CDNs. No `script-src 'unsafe-inline'`.
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` restricting camera/mic/geolocation to the app
  origin, and explicitly disabling FLoC (`interest-cohort=()`).

## Auth model

- **Passwords:** hashed with `bcryptjs` (cost factor 10). Plaintext
  is never logged and never stored.
- **Sessions:** opaque random UUIDs stored server-side in Cloudflare
  KV (`KV_SESSIONS`). 7-day TTL. Session cookies are `HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`.
- **Human verification:** Cloudflare Turnstile is required on
  `/api/login`, `/api/register`, `/api/forgot-password`, and
  `/api/reset-password` when `TURNSTILE_SECRET_KEY` is configured.
- **Account lockout:** 5 consecutive failed logins within a 30-minute
  rolling window triggers a 15-minute email-scoped lockout.
- **Rate limits:** KV-backed sliding/fixed window limiters:
  - Login: 10/15 min per IP.
  - Password reset: 5/15 min per IP (both `/forgot-password` and
    `/reset-password`).
  - Signup: 5/hour per IP.
  - Standard mutations: 60/min per user (most `POST`/`PATCH`/`PUT`/
    `DELETE` endpoints on cart, projects, layout drawings, site
    surveys, etc.).
  - Heavy mutations: 20/min per user (layout drawing uploads, site
    survey creation, order creation, quote request dispatch).
  - Account deletion: 3/24h per user.
- **OAuth:** Google and Apple sign-in are supported with
  server-side state validation and bound redirect URIs.

## Data protection

- **Encryption at rest:** Neon Postgres provides managed
  encryption-at-rest for the database and automated encrypted
  backups.
- **Encryption in transit:** Cloudflare terminates TLS 1.3 with
  automatic redirect from HTTP to HTTPS. Neon connections use TLS.
- **Email:** outbound email is dispatched via Resend. The sender
  domain is configured with SPF, DKIM, and a DMARC policy of at
  least `p=quarantine`.

## Access model

- `role` column on `users` is either `customer` or `admin`. Admin
  endpoints verify the column on every call and return `403` on
  mismatch.
- Row-level ownership: every resource query is constrained by
  `userId = session.claims.sub`. Cross-user access requires an
  accepted row in `project_collaborators` with a role of `viewer`,
  `editor`, or `owner` as enforced by
  `worker/middleware/projectAccess.ts`.
- Magic-link approver flows (`approval_tokens`) are scoped to a
  single order + section + email, expire after 30 days, and are
  single-use. Every dispatch / click / approve / reject is recorded
  in `order_audit_log`.

## Data deletion

- `DELETE /api/me/account` (auth required, rate-limited 3/24h per
  user):
  - Sets `users.email` to `deleted-<uuid>@asafe-engage.local`.
  - Nulls `first_name`, `last_name`, `phone`, `job_title`,
    `profile_image_url`, `password_hash`, `password_reset_token`,
    `password_reset_expiry`, `oauth_provider`, `oauth_id`.
  - Sets `is_active = false`.
  - Destroys the caller's KV session entry and clears the `sid`
    cookie on the response.
- Dependent rows (orders, projects, cart history, quote requests)
  are retained for legal, audit, and accounting purposes.
- A 90-day retention cron will purge soft-deleted users and their
  dependent rows on a rolling basis. Until then they remain
  anonymised and inaccessible.

## Operational

- **Cloudflare WAF** is active in front of the Worker, including
  managed rule sets for OWASP Top 10 patterns.
- **Cloudflare Bot Management** and Turnstile protect auth surfaces
  from automated credential-stuffing.
- **Request tracing:** every response carries `X-Request-Id`.
  Server-side logs are structured JSON with `requestId`, `userId`,
  `level`, `msg`, method/path/status/ms. See `worker/lib/logger.ts`.
- **Secret storage:** all secrets are held in Wrangler bound
  variables (`wrangler secret put ...`) — never committed to the
  repo.

## Reporting a vulnerability

Please email **security@asafe.ae** with:

- A clear description of the issue and impact.
- Steps to reproduce, including the URL and any payload needed.
- The `X-Request-Id` of an affected request if available.

We acknowledge reports within **7 days** and aim to have a
remediation plan within 30 days for confirmed issues.

### In scope

- Authentication and authorisation bypass.
- Tenant isolation failures (one user reading or writing another
  user's data).
- Stored / reflected XSS, CSRF, SSRF, SQL injection, open redirect.
- Server-side template injection, deserialisation issues.
- Broken session management (fixation, insufficient expiry,
  token leak).

### Out of scope

- Denial-of-service attacks (volumetric or otherwise) — handled at
  the Cloudflare edge.
- Social-engineering the A-SAFE team or its customers.
- Missing best-practice headers on third-party assets we don't
  control (Matterport, YouTube, etc.).
- Rate-limit tuning complaints that are not bypasses.
- Reports generated solely from automated scanners with no
  demonstrated impact.

Thank you for disclosing responsibly.
