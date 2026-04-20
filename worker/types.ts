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
};
