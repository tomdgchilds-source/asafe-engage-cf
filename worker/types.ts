export type Env = {
  // Cloudflare bindings
  KV_SESSIONS: KVNamespace;
  R2_BUCKET: R2Bucket;

  // Database
  DATABASE_URL: string;

  // Auth
  SESSION_SECRET: string;

  // Email (SendGrid)
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  ADMIN_NOTIFICATION_EMAILS: string;

  // AI
  OPENAI_API_KEY: string;

  // Slack
  SLACK_WEBHOOK_URL: string;
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_CHANNEL_ID: string;
  SLACK_NOTIFICATION_CHANNEL_ID: string;

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;

  // Misc
  CONTACT_EMAIL: string;
  NODE_ENV: string;
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
