export type Env = {
  // Cloudflare bindings
  KV_SESSIONS: KVNamespace;
  FILES_STORE: KVNamespace;
  R2_BUCKET?: R2Bucket;
  ASSETS: Fetcher;

  // Database
  DATABASE_URL: string;

  // Auth
  SESSION_SECRET: string;

  // Email (Resend — https://resend.com)
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  ADMIN_NOTIFICATION_EMAILS: string;

  // AI
  OPENAI_API_KEY: string;

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;

  // OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET: string;
  APP_URL: string;

  // Misc
  CONTACT_EMAIL: string;
  NODE_ENV: string;

  // One-off: bearer token that gates /api/admin/apply-pricelist.
  // Set via `wrangler secret put MIGRATION_TOKEN`. Optional — the endpoint
  // refuses to run when the secret is missing.
  MIGRATION_TOKEN?: string;

  // Cloudflare Turnstile — human verification on auth flows.
  // Both keys optional; when absent, Turnstile is skipped entirely and
  // the app functions as if unprotected. See worker/lib/turnstile.ts and
  // scripts/data/SECURITY-SETUP.md.
  TURNSTILE_SITE_KEY?: string;   // public; served via /api/config
  TURNSTILE_SECRET_KEY?: string; // secret; server-side verification only
};

// Session shape — matches the original AuthenticatedRequest.user
export type SessionData = {
  claims: {
    sub: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  expires_at: number;
};

// Hono context variables set by middleware
export type Variables = {
  user: SessionData;
  // Set by requireProjectAccess — "owner" | "editor" | "viewer".
  // Downstream handlers use this to gate mutations by role.
  projectRole?: string;
  // Stamped by requestContext middleware on every request. Used by
  // handlers that want to correlate DB writes / external calls with
  // the originating request, and echoed back as X-Request-Id.
  requestId?: string;
  // Per-request structured logger. See worker/lib/logger.ts. Typed as
  // `unknown` here to avoid a circular type import between types.ts
  // and lib/logger.ts — call sites that need the concrete `Logger`
  // shape should `import type { Logger } from "./lib/logger"` and
  // cast locally.
  log?: unknown;
};
