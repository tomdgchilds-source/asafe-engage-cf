import type { Env } from "../types";

// ──────────────────────────────────────────────
// Email service via Resend (https://resend.com)
//
// Required env secrets:
//   RESEND_API_KEY    — API key from resend.com dashboard
//   EMAIL_FROM        — Verified sender address (e.g. engage@asafe.com or noreply@yourdomain.com)
//   ADMIN_NOTIFICATION_EMAILS — Comma-separated admin recipient list (optional)
//
// Setup:
//   1. Sign up at resend.com (free tier: 100 emails/day, 3000/month)
//   2. Verify your sending domain (or use onboarding@resend.dev for testing)
//   3. Create an API key
//   4. npx wrangler secret put RESEND_API_KEY
//   5. npx wrangler secret put EMAIL_FROM
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Email log — every Resend send attempt is recorded in `email_log` so
// admins can diagnose silent failures (domain unverified, API key
// revoked, rate limit hit, etc.) via /admin/email-log without grepping
// Worker logs. Logging is best-effort: if the log insert itself fails
// we swallow the error so we never break the email path.
// ──────────────────────────────────────────────
export interface EmailLogAttempt {
  to: string;
  subject: string;
  fromAddress?: string | null;
  status: "queued" | "sent" | "failed" | "skipped_no_config";
  resendId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  responseStatus?: number | null;
  responseBody?: string | null;
  callerRoute?: string | null;
}

/**
 * Insert one row into email_log. Uses the raw neon driver so we don't
 * have to wire drizzle-orm through every email helper, and so a missing
 * email_log table (pre-migration) merely logs a warning instead of
 * exploding the email path. Defensive on every axis — never throws.
 */
export async function logEmailAttempt(
  env: Env,
  attempt: EmailLogAttempt,
): Promise<string | null> {
  if (!env.DATABASE_URL) {
    // Worker isolate without DB access — nothing we can do, but never
    // break the email send because of telemetry.
    return null;
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(env.DATABASE_URL);
    // Truncate the freeform text fields defensively even though callers
    // already slice — belt + braces against an enormous Resend response
    // body bloating the table.
    const errorMessage = attempt.errorMessage
      ? attempt.errorMessage.slice(0, 1000)
      : null;
    const responseBody = attempt.responseBody
      ? attempt.responseBody.slice(0, 4000)
      : null;
    const result = (await sqlClient`
      INSERT INTO email_log (
        "to", subject, from_address, status, resend_id, error_code,
        error_message, response_status, response_body, caller_route
      )
      VALUES (
        ${attempt.to}, ${attempt.subject}, ${attempt.fromAddress ?? null},
        ${attempt.status}, ${attempt.resendId ?? null}, ${attempt.errorCode ?? null},
        ${errorMessage}, ${attempt.responseStatus ?? null}, ${responseBody},
        ${attempt.callerRoute ?? null}
      )
      RETURNING id
    `) as Array<{ id: string }>;
    return result[0]?.id ?? null;
  } catch (e) {
    // Soft fail — never break the email path because logging itself
    // broke. Most likely cause: email_log table not yet migrated. The
    // admin migration endpoint creates it idempotently.
    console.warn(
      "[email-log] insert failed (non-fatal):",
      (e as any)?.message || e,
    );
    return null;
  }
}

/** Send an email via the Resend API. */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  opts?: { callerRoute?: string },
): Promise<boolean> {
  // Guard: skip if email credentials aren't configured
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("Email not configured (RESEND_API_KEY / EMAIL_FROM missing) — skipping email to", to);
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from || null,
      status: "skipped_no_config",
      errorMessage: "RESEND_API_KEY or EMAIL_FROM missing",
      callerRoute: opts?.callerRoute ?? null,
    });
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `A-SAFE Engage <${from}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      // Try to surface the structured Resend error name (e.g.
      // "validation_error", "missing_api_key") so the admin UI can
      // chip-render it in one place. Falls back to null on parse failure.
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(text);
        errorCode = parsed?.name || parsed?.statusCode || null;
      } catch {
        /* non-JSON body — leave errorCode null */
      }
      console.error(`Resend API error: ${res.status} ${text}`);
      await logEmailAttempt(env, {
        to,
        subject,
        fromAddress: from,
        status: "failed",
        errorCode,
        errorMessage: text,
        responseStatus: res.status,
        responseBody: text,
        callerRoute: opts?.callerRoute ?? null,
      });
      return false;
    }

    // 2xx — try to extract the message ID for downstream debugging
    // (correlate the local row to a Resend dashboard record).
    let resendId: string | null = null;
    try {
      const parsed = JSON.parse(text);
      resendId = parsed?.id || null;
    } catch {
      /* non-JSON — leave resendId null */
    }
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "sent",
      resendId,
      responseStatus: res.status,
      callerRoute: opts?.callerRoute ?? null,
    });
    return true;
  } catch (error) {
    console.error("Email send error:", error);
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "failed",
      errorMessage: String(error),
      callerRoute: opts?.callerRoute ?? null,
    });
    return false;
  }
}

// ──────────────────────────────────────────────
// Email design system — ONE base layout for every template.
//
// Mirrors worker/lib/pdf/theme.ts and client/src/styles/document.css so the
// PDFs, the share pages and the emails read as one system:
//   - black header band (#1D1D1B) with the yellow strapline logo, document
//     type in grey caps on the right, a 4 px yellow rule beneath;
//   - bold uppercase title in black, optional document reference line;
//   - left-aligned body, Helvetica / Arial stack, 14 px / 1.55;
//   - yellow header bars on tables, yellow CTA buttons with black bold caps;
//   - grey8 footer with the A-SAFE UAE office block.
// Inline styles only — no <style> blocks, external CSS or web fonts, so it
// survives Outlook, Gmail, Apple Mail and mobile clients. The logo is the
// only image; its alt text renders in yellow when images are blocked.
// ──────────────────────────────────────────────
const DEFAULT_APP_URL = "https://asafe-engage.tom-d-g-childs.workers.dev";

const EMAIL_COLOUR = {
  yellow: "#FFC72C",
  black: "#1D1D1B",
  white: "#FFFFFF",
  grey90: "#333331",
  grey60: "#6E6E6B",
  grey40: "#A3A3A0",
  grey20: "#D9D9D6",
  grey8: "#F2F2F0",
  red: "#E94B5F",
  teal: "#66C9BA",
} as const;

const EMAIL_FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
/** Base paragraph style — append overrides after it. */
const EMAIL_P_STYLE = `margin:0 0 12px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.55;color:${EMAIL_COLOUR.black};text-align:left;`;
const EMAIL_SMALL_STYLE = `margin:0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${EMAIL_COLOUR.grey60};text-align:left;`;

/** The A-SAFE UAE office block used in every footer. */
const EMAIL_OFFICE_BLOCK_HTML = `<strong style="color:${EMAIL_COLOUR.black};">A-SAFE UAE</strong> &nbsp;|&nbsp; Office 220, Building A5, Dubai South Business Park<br>Tel: +971 (4) 8842 422 &nbsp;|&nbsp; <a href="mailto:sales@asafe.ae" style="color:${EMAIL_COLOUR.grey60};">sales@asafe.ae</a> &nbsp;|&nbsp; <a href="https://www.asafe.com" style="color:${EMAIL_COLOUR.grey60};">www.asafe.com</a>`;

interface EmailLayoutOptions {
  /** Document type in the header band, rendered in grey caps (e.g. "Order confirmation"). */
  docType: string;
  /** Headline under the band, rendered bold uppercase. */
  title: string;
  /** Optional document reference line under the title (e.g. "ASU-OF-2609-0012 · Rev A"). */
  reference?: string;
  /** Block-level HTML for the body. Callers escape their own values. */
  bodyHtml: string;
  /** Hidden preview text some clients show next to the subject. */
  preheader?: string;
  /** Extra footer lines (already escaped HTML), e.g. link expiry or reply-to guidance. */
  footerNoteHtml?: string;
  /** Base URL used to resolve the logo. Defaults to the production Worker. */
  appUrl?: string | null;
  /** Content width in px. Default 600. */
  width?: number;
}

/** Wrap a template body in the shared A-SAFE email chrome. */
function renderEmailLayout(o: EmailLayoutOptions): string {
  const width = o.width ?? 600;
  const base = (o.appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
  const logoUrl = `${base}/brand/logo-strapline-primary.png`;
  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_COLOUR.grey8};">${escapeHtml(o.preheader)}</div>`
    : "";
  const reference = o.reference
    ? `<p style="margin:6px 0 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.4;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_COLOUR.grey60};">${escapeHtml(o.reference)}</p>`
    : "";
  const footerNote = o.footerNoteHtml
    ? `<p style="margin:0 0 10px 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.5;color:${EMAIL_COLOUR.grey60};">${o.footerNoteHtml}</p>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLOUR.grey20};font-family:${EMAIL_FONT};color:${EMAIL_COLOUR.black};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_COLOUR.grey20};padding:24px 0;">
    <tr><td align="center" style="padding:0 12px;">
      <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:${width}px;max-width:100%;background-color:${EMAIL_COLOUR.white};">
        <!-- Header band -->
        <tr>
          <td style="background-color:${EMAIL_COLOUR.black};padding:22px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="font-family:${EMAIL_FONT};">
                  <img src="${escapeAttr(logoUrl)}" alt="A-SAFE" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;font-family:${EMAIL_FONT};font-size:20px;font-weight:bold;color:${EMAIL_COLOUR.yellow};">
                </td>
                <td align="right" valign="middle" style="font-family:${EMAIL_FONT};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${EMAIL_COLOUR.grey40};text-align:right;">
                  ${escapeHtml(o.docType)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Yellow rule -->
        <tr><td style="background-color:${EMAIL_COLOUR.yellow};height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>
        <!-- Title -->
        <tr>
          <td style="padding:28px 28px 8px 28px;">
            <h1 style="margin:0;font-family:${EMAIL_FONT};font-size:20px;line-height:1.2;font-weight:bold;text-transform:uppercase;color:${EMAIL_COLOUR.black};text-align:left;">${escapeHtml(o.title)}</h1>
            ${reference}
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:12px 28px 28px 28px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.55;color:${EMAIL_COLOUR.black};text-align:left;">
            ${o.bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px 20px 28px;background-color:${EMAIL_COLOUR.grey8};border-top:1px solid ${EMAIL_COLOUR.grey20};font-family:${EMAIL_FONT};font-size:11px;line-height:1.5;color:${EMAIL_COLOUR.grey60};text-align:left;">
            ${footerNote}
            <p style="margin:0;">${EMAIL_OFFICE_BLOCK_HTML}</p>
            <p style="margin:8px 0 0 0;">Sent by A-SAFE Engage on behalf of A-SAFE UAE.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Body paragraph. `html` is already escaped by the caller. */
function emailParagraph(html: string, extraStyle = ""): string {
  return `<p style="${EMAIL_P_STYLE}${extraStyle}">${html}</p>`;
}

/** Small grey note. */
function emailSmall(html: string, extraStyle = ""): string {
  return `<p style="${EMAIL_SMALL_STYLE}${extraStyle}">${html}</p>`;
}

/** CTA button: black bold caps on yellow (or white on black), square corners. */
function emailButton(href: string, label: string, variant: "yellow" | "black" = "yellow"): string {
  const bg = variant === "black" ? EMAIL_COLOUR.black : EMAIL_COLOUR.yellow;
  const fg = variant === "black" ? EMAIL_COLOUR.white : EMAIL_COLOUR.black;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px 0;">
      <tr><td style="background-color:${bg};">
        <a href="${escapeAttr(href)}" style="display:inline-block;padding:14px 26px;font-family:${EMAIL_FONT};font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${fg};text-decoration:none;">${escapeHtml(label)}</a>
      </td></tr>
    </table>`;
}

/** Text link styled the document way (black, underlined). */
function emailLink(href: string, label?: string): string {
  return `<a href="${escapeAttr(href)}" style="color:${EMAIL_COLOUR.black};text-decoration:underline;">${escapeHtml(label ?? href)}</a>`;
}

/**
 * Key / value table with a yellow header bar (internal-form style).
 * Values are HTML the caller has already escaped.
 */
function emailKvTable(caption: string, rows: Array<[label: string, valueHtml: string]>): string {
  const body = rows
    .map(([label, value], i) => {
      const zebra = i % 2 ? `background-color:${EMAIL_COLOUR.grey8};` : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_COLOUR.grey20};font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_COLOUR.grey60};width:40%;text-align:left;${zebra}">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${EMAIL_COLOUR.grey20};font-family:${EMAIL_FONT};font-size:14px;font-weight:bold;color:${EMAIL_COLOUR.black};text-align:left;${zebra}">${value}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0;border-collapse:collapse;">
      <tr><th colspan="2" align="left" style="background-color:${EMAIL_COLOUR.yellow};padding:9px 12px;font-family:${EMAIL_FONT};font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_COLOUR.black};text-align:left;">${escapeHtml(caption)}</th></tr>
      ${body}
    </table>`;
}

/** Section heading inside the body: bold caps with a short yellow underline. */
function emailHeading(text: string): string {
  return `<p style="margin:22px 0 4px 0;font-family:${EMAIL_FONT};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_COLOUR.black};text-align:left;">${escapeHtml(text)}</p>
    <div style="width:64px;height:2px;background-color:${EMAIL_COLOUR.yellow};margin:0 0 12px 0;font-size:2px;line-height:2px;">&nbsp;</div>`;
}

/** Left-ruled callout. Tone follows the secondary-palette rule: status only. */
function emailCallout(
  innerHtml: string,
  tone: "yellow" | "grey" | "red" | "teal" | "black" = "grey",
): string {
  const rule =
    tone === "yellow"
      ? EMAIL_COLOUR.yellow
      : tone === "red"
        ? EMAIL_COLOUR.red
        : tone === "teal"
          ? EMAIL_COLOUR.teal
          : tone === "black"
            ? EMAIL_COLOUR.black
            : EMAIL_COLOUR.grey40;
  const bg =
    tone === "yellow"
      ? "#FFF8E1"
      : tone === "red"
        ? "#FDEEF0"
        : tone === "teal"
          ? "#EEF9F6"
          : EMAIL_COLOUR.grey8;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
      <tr><td style="padding:14px 16px;background-color:${bg};border-left:4px solid ${rule};font-family:${EMAIL_FONT};font-size:14px;line-height:1.55;color:${EMAIL_COLOUR.black};text-align:left;">${innerHtml}</td></tr>
    </table>`;
}

// ──────────────────────────────────────────────
// Order-specific email helpers
// ──────────────────────────────────────────────

interface OrderConfirmationParams {
  to: string;
  orderNumber: string;
  totalAmount: string;
  itemCount: number;
  /**
   * Optional PAS 13 Alignment Report PDF, attached when the order-create
   * flow successfully renders one. If omitted (or if PDF generation fails
   * upstream), the email still sends — we include a "see download link"
   * fallback in the body so the customer can fetch the report from the
   * order page.
   */
  pas13ReportPdf?: {
    filename: string;
    /** Base64-encoded PDF bytes (no data URI prefix). */
    contentBase64: string;
    /** "PAS 13 ALIGNED" / "BORDERLINE ALIGNMENT" / "NOT PAS 13 ALIGNED" — surfaced in the email body. */
    aggregateLabel: string;
  };
  /**
   * Always-present URL to the report (whether or not the attachment landed).
   * The email body links to it so the customer can re-fetch.
   */
  pas13ReportUrl?: string;
}

/** Send order confirmation to the customer who placed the order. */
export async function sendOrderConfirmationEmail(
  env: Env,
  {
    to,
    orderNumber,
    totalAmount,
    itemCount,
    pas13ReportPdf,
    pas13ReportUrl,
  }: OrderConfirmationParams,
  opts?: { callerRoute?: string },
): Promise<boolean> {
  // Guard: skip if email credentials aren't configured. Mirrors sendEmail()
  // — we duplicate the guard here because we go around sendEmail() to attach
  // the PDF directly via Resend's attachments API.
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  // Caller route default — orders flow always passes this, but keep a
  // fallback so the email_log row is always tagged.
  const callerRoute = opts?.callerRoute ?? "/api/orders/confirmation";
  if (!apiKey || !from) {
    console.warn("Email not configured (RESEND_API_KEY / EMAIL_FROM missing) — skipping email to", to);
    await logEmailAttempt(env, {
      to,
      subject: `Order Confirmed - ${orderNumber} | A-SAFE Engage`,
      fromAddress: from || null,
      status: "skipped_no_config",
      errorMessage: "RESEND_API_KEY or EMAIL_FROM missing",
      callerRoute,
    });
    return false;
  }

  const subject = `Order Confirmed - ${orderNumber} | A-SAFE Engage`;
  // Surface the PAS 13 verdict prominently in the body — same wording rule
  // as the rule engine ("aligned" / "borderline" / "not aligned"; never
  // "compliant"). When attachment failed but URL is available, the link
  // takes its place; when both are absent, the block is dropped.
  const appUrl = env.APP_URL || DEFAULT_APP_URL;
  const itemsLabel = `${itemCount} item${itemCount !== 1 ? "s" : ""}`;
  const indicativeNote = emailSmall(
    "Indicative — verify with A-SAFE engineering for procurement.",
    "margin-top:8px;",
  );
  const pas13Block = pas13ReportPdf
    ? emailCallout(
        `<p style="${EMAIL_P_STYLE}margin:0 0 4px 0;"><strong>PAS 13 Alignment Report attached</strong></p>
         <p style="${EMAIL_P_STYLE}margin:0;">Aggregate verdict: <strong>${escapeHtml(pas13ReportPdf.aggregateLabel)}</strong>.${
           pas13ReportUrl ? ` Re-download anytime: ${emailLink(pas13ReportUrl)}` : ""
         }</p>
         ${indicativeNote}`,
        "yellow",
      )
    : pas13ReportUrl
      ? emailCallout(
          `<p style="${EMAIL_P_STYLE}margin:0 0 4px 0;"><strong>PAS 13 Alignment Report</strong></p>
           <p style="${EMAIL_P_STYLE}margin:0;">Download from your order page: ${emailLink(pas13ReportUrl)}</p>
           ${indicativeNote}`,
          "yellow",
        )
      : "";

  const html = renderEmailLayout({
    docType: "Order confirmation",
    title: "Order confirmed",
    reference: `Order ${orderNumber}`,
    preheader: `Order ${orderNumber} received — ${itemsLabel}, ${totalAmount}.`,
    appUrl,
    bodyHtml: [
      emailParagraph(
        "Thank you for your order. It has been submitted for review and the A-SAFE team will come back to you shortly.",
      ),
      emailKvTable("Order summary", [
        ["Order number", escapeHtml(orderNumber)],
        ["Items", escapeHtml(itemsLabel)],
        ["Total amount", escapeHtml(totalAmount)],
      ]),
      pas13Block,
      emailButton(`${appUrl}/orders`, "View your orders"),
    ].join("\n"),
  });

  // When we have no attachment, fall back to the simple sendEmail() helper.
  if (!pas13ReportPdf) {
    return sendEmail(env, to, subject, html, { callerRoute });
  }

  // Attachment path — call Resend directly so we can pass `attachments`.
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: `A-SAFE Engage <${from}>`,
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename: pas13ReportPdf.filename,
            content: pas13ReportPdf.contentBase64,
          },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(text);
        errorCode = parsed?.name || parsed?.statusCode || null;
      } catch { /* non-JSON */ }
      console.error(`Resend API error (order confirmation w/ PAS 13 attachment): ${res.status} ${text}`);
      await logEmailAttempt(env, {
        to,
        subject,
        fromAddress: from,
        status: "failed",
        errorCode,
        errorMessage: text,
        responseStatus: res.status,
        responseBody: text,
        callerRoute,
      });
      // Best-effort fallback: retry without the attachment so the customer
      // at least gets the confirmation email + download link. The retry is
      // logged separately by sendEmail() so the admin sees both attempts.
      return sendEmail(env, to, subject, html, { callerRoute });
    }
    let resendId: string | null = null;
    try {
      const parsed = JSON.parse(text);
      resendId = parsed?.id || null;
    } catch { /* non-JSON */ }
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "sent",
      resendId,
      responseStatus: res.status,
      callerRoute,
    });
    return true;
  } catch (err) {
    console.error("Order confirmation email send error (with attachment):", err);
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "failed",
      errorMessage: String(err),
      callerRoute,
    });
    // Same fall-through — never let the attachment failure swallow the email.
    return sendEmail(env, to, subject, html, { callerRoute });
  }
}

interface OrderSubmittedNotificationParams {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalAmount: string;
  /** Currency code (AED / SAR / USD / …) used to pick the regional sales inbox. */
  currency?: string;
}

/** Notify admin team that a new order has been submitted for review. */
export async function sendOrderSubmittedNotification(
  env: Env,
  { orderNumber, customerName, customerEmail, totalAmount, currency }: OrderSubmittedNotificationParams,
): Promise<void> {
  // Region routing based on order currency:
  //  SAR → Saudi sales team
  //  AED → UAE sales team
  //  anything else → fall back to ADMIN_NOTIFICATION_EMAILS
  const regionalSalesEmail =
    currency === "SAR" ? "sales@asafe.sa" :
    currency === "AED" ? "sales@asafe.ae" :
    null;

  const adminEmails = (env.ADMIN_NOTIFICATION_EMAILS || "")
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);

  // If we have a regional email, prepend it and dedupe
  const recipients = regionalSalesEmail
    ? Array.from(new Set([regionalSalesEmail, ...adminEmails]))
    : adminEmails;

  if (recipients.length === 0) {
    console.warn("No recipients for admin order notification (no regional email and no ADMIN_NOTIFICATION_EMAILS)");
    return;
  }

  const subject = `New Order Submitted - ${orderNumber}`;
  const appUrl = env.APP_URL || DEFAULT_APP_URL;
  const html = renderEmailLayout({
    docType: "Internal notification",
    title: "New order submitted",
    reference: `Order ${orderNumber}`,
    preheader: `${customerName} submitted order ${orderNumber} — ${totalAmount}.`,
    appUrl,
    bodyHtml: [
      emailParagraph("A new order has been submitted for review."),
      emailKvTable("Order at a glance", [
        ["Order number", escapeHtml(orderNumber)],
        ["Customer", escapeHtml(customerName)],
        ["Email", emailLink(`mailto:${customerEmail}`, customerEmail)],
        ["Total amount", escapeHtml(totalAmount)],
      ]),
      emailButton(`${appUrl}/admin/orders`, "Review order", "black"),
    ].join("\n"),
  });

  await Promise.all(recipients.map((email: string) => sendEmail(env, email, subject, html)));
}

// ──────────────────────────────────────────────
// Approval-request (magic-link) email
//
// Sent when a sales rep or the previous approver forwards an order to the
// next signatory. The template is intentionally self-contained (inline CSS,
// 600px single-column table) so it renders consistently across Outlook,
// Gmail, Apple Mail and mobile clients that strip <style> blocks.
// ──────────────────────────────────────────────
interface ApprovalRequestParams {
  to: string;
  approverName?: string;
  section: "technical" | "commercial" | "marketing";
  orderNumber: string;
  customOrderNumber?: string;
  clientCompany: string;
  clientCompanyLogoUrl?: string;
  salesContact: { name: string; email: string; phone?: string; jobRole?: string };
  grandTotal: string;
  currency: string;
  approvalUrl: string;
  pdfDownloadUrl?: string;
  expiresAt: Date;
}

/** Send a magic-link approval request to an external approver. */
export async function sendApprovalRequestEmail(
  env: Env,
  params: ApprovalRequestParams,
  opts?: { callerRoute?: string },
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  const callerRoute = opts?.callerRoute ?? "/api/orders/approval-request";

  if (!apiKey || !from) {
    const msg = "RESEND_API_KEY / EMAIL_FROM not configured";
    console.warn(`Approval email skipped (${msg}) — would have emailed ${params.to}`);
    await logEmailAttempt(env, {
      to: params.to,
      subject: `Approval request — order ${params.customOrderNumber || params.orderNumber}`,
      fromAddress: from || null,
      status: "skipped_no_config",
      errorMessage: msg,
      callerRoute,
    });
    return { ok: false, error: msg };
  }

  const {
    to,
    approverName,
    section,
    orderNumber,
    customOrderNumber,
    clientCompany,
    clientCompanyLogoUrl,
    salesContact,
    grandTotal,
    currency,
    approvalUrl,
    pdfDownloadUrl,
    expiresAt,
  } = params;

  // Title-case the section name once — used in the header strip, the order-
  // at-a-glance row, and the subject line. Keeping it local to the function
  // avoids drift if we ever localize one spot and forget another.
  const sectionLabel =
    section === "technical"
      ? "Technical"
      : section === "commercial"
        ? "Commercial"
        : "Marketing";

  const displayOrderNumber = customOrderNumber || orderNumber;
  const greeting = approverName ? `Hi ${escapeHtml(approverName)}` : "Hi there";
  const expiresDisplay = expiresAt.toUTCString();

  const subject = `[Action needed] Approve order ${displayOrderNumber} for ${clientCompany} — ${sectionLabel.toLowerCase()} sign-off`;

  // Shared layout (black band, yellow rule, grey footer). The client's logo,
  // when supplied, sits in the body above the greeting rather than on the
  // black band — the band is reserved for the A-SAFE mark.
  const clientLogoRow = clientCompanyLogoUrl
    ? `<p style="${EMAIL_P_STYLE}margin:0 0 16px 0;"><img src="${escapeAttr(clientCompanyLogoUrl)}" alt="${escapeAttr(clientCompany)}" style="display:block;max-height:40px;height:auto;width:auto;border:0;"></p>`
    : "";
  const html = renderEmailLayout({
    docType: `Order approval · ${sectionLabel}`,
    title: `${sectionLabel} sign-off requested`,
    reference: `Order ${displayOrderNumber} · ${clientCompany}`,
    preheader: `${salesContact.name} is requesting your ${sectionLabel.toLowerCase()} approval for order ${displayOrderNumber}.`,
    appUrl: env.APP_URL,
    footerNoteHtml: `This link expires on <strong>${escapeHtml(expiresDisplay)}</strong> and can only be used once. If you weren't expecting this email, please contact <a href="mailto:${escapeAttr(salesContact.email)}" style="color:${EMAIL_COLOUR.grey60};">${escapeHtml(salesContact.email)}</a>.`,
    bodyHtml: [
      clientLogoRow,
      emailParagraph(`${greeting},`),
      emailParagraph(
        `${escapeHtml(salesContact.name)} at A-SAFE has prepared order <strong>${escapeHtml(displayOrderNumber)}</strong> for <strong>${escapeHtml(clientCompany)}</strong> and is requesting your <strong>${sectionLabel.toLowerCase()}</strong> approval.`,
      ),
      emailKvTable("Order at a glance", [
        ["Order number", escapeHtml(displayOrderNumber)],
        ["Client", escapeHtml(clientCompany)],
        [
          "Total",
          `${escapeHtml(grandTotal)} <span style="font-weight:normal;color:${EMAIL_COLOUR.grey60};">${escapeHtml(currency)}</span>`,
        ],
        ["Section for your sign-off", sectionLabel],
      ]),
      emailParagraph(
        "<strong>Review the order and record your decision using the secure link below.</strong>",
      ),
      emailButton(approvalUrl, "Review and approve order"),
      pdfDownloadUrl
        ? emailSmall(
            `Prefer a copy for your records? ${emailLink(pdfDownloadUrl, "Download the order form (PDF)")}`,
            "margin:0 0 16px 0;",
          )
        : "",
      emailHeading("Your A-SAFE contact"),
      emailParagraph(
        `<strong>${escapeHtml(salesContact.name)}</strong>${salesContact.jobRole ? ` · ${escapeHtml(salesContact.jobRole)}` : ""}<br>${emailLink(`mailto:${salesContact.email}`, salesContact.email)}${salesContact.phone ? `<br>${escapeHtml(salesContact.phone)}` : ""}`,
      ),
    ].join("\n"),
  });

  // Plain-text fallback — Resend accepts both and many compliance/spam
  // filters downrank HTML-only messages. Keep it informative; this is what
  // people on low-bandwidth devices or deliberately text-only clients see.
  const text = [
    `${approverName ? `Hi ${approverName}` : "Hi there"},`,
    "",
    `${salesContact.name} at A-SAFE has prepared order ${displayOrderNumber} for ${clientCompany} and is requesting your ${sectionLabel.toLowerCase()} approval.`,
    "",
    `Order #: ${displayOrderNumber}`,
    `Client:  ${clientCompany}`,
    `Total:   ${grandTotal} ${currency}`,
    `Section: ${sectionLabel}`,
    "",
    `Review and approve: ${approvalUrl}`,
    pdfDownloadUrl ? `Download PDF:       ${pdfDownloadUrl}` : "",
    "",
    `Questions? ${salesContact.name} — ${salesContact.email}${salesContact.phone ? ` · ${salesContact.phone}` : ""}`,
    "",
    `This link expires on ${expiresDisplay} and is single-use only.`,
    `If you weren't expecting this email, contact ${salesContact.email}.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // The spec calls for "A-SAFE Sales <sales@asafe.ae>" branding. We
        // keep the verified sender (from EMAIL_FROM) so DKIM/SPF still pass
        // but override the friendly label so approvers see the human sender.
        from: `A-SAFE Sales <${from}>`,
        to: [to],
        reply_to: salesContact.email,
        subject,
        html,
        text,
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(bodyText);
        errorCode = parsed?.name || parsed?.statusCode || null;
      } catch { /* non-JSON */ }
      console.error(`Resend API error (approval email): ${res.status} ${bodyText}`);
      await logEmailAttempt(env, {
        to,
        subject,
        fromAddress: from,
        status: "failed",
        errorCode,
        errorMessage: bodyText,
        responseStatus: res.status,
        responseBody: bodyText,
        callerRoute,
      });
      return { ok: false, error: `resend_${res.status}` };
    }

    let resendId: string | null = null;
    try {
      const parsed = JSON.parse(bodyText);
      resendId = parsed?.id || null;
    } catch { /* non-JSON */ }
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "sent",
      resendId,
      responseStatus: res.status,
      callerRoute,
    });
    return { ok: true, messageId: resendId || undefined };
  } catch (err) {
    console.error("Approval email send error:", err);
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      callerRoute,
    });
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

// Minimal HTML-escaping for interpolated values inside text/attribute contexts.
// We don't need a full sanitizer because all inputs are either (a) server-
// trusted (orderNumber, currency, sectionLabel) or (b) user-supplied strings
// we control the length of (company, approverName, salesContact.*). Escaping
// is defence-in-depth so a stray `<` or `&` never breaks the markup.
function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Attribute-context escape: same as HTML but we also strip backticks to keep
// copy-pasted URLs from producing template-literal surprises on clients that
// eval HTML oddly (Outlook legacy, cough).
function escapeAttr(raw: string): string {
  return escapeHtml(raw).replace(/`/g, "&#96;");
}

// ──────────────────────────────────────────────
// sendOrderPdfEmail — customer-facing quote delivery with a PDF attachment
//
// Used by POST /api/orders/:id/email. The PDF is generated client-side
// (in-browser jsPDF) and forwarded as base64 so Resend can attach it
// directly. The rep name + email drive the friendly "via A-SAFE Engage"
// sender label and the Reply-To so the customer's response goes to the
// rep, not the generic inbox.
// ──────────────────────────────────────────────
interface SendOrderPdfEmailParams {
  to: string;
  customerName?: string | null;
  orderRef: string;
  customerCompany?: string | null;
  repName?: string | null;
  repEmail?: string | null;
  shareUrl?: string | null;
  /** Base64-encoded PDF bytes (no data URI prefix). */
  pdfBase64: string;
  pdfFilename?: string;
  env: {
    RESEND_API_KEY: string;
    EMAIL_FROM?: string;
    ADMIN_NOTIFICATION_EMAILS?: string;
  };
}

export async function sendOrderPdfEmail(
  params: SendOrderPdfEmailParams,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const {
    to,
    customerName,
    orderRef,
    customerCompany,
    repName,
    repEmail,
    shareUrl,
    pdfBase64,
    pdfFilename,
    env,
  } = params;

  const apiKey = env.RESEND_API_KEY;
  const fromAddr = env.EMAIL_FROM ?? "quotes@asafe.ae";

  if (!apiKey) {
    const msg = "RESEND_API_KEY not configured";
    console.warn(`Order-PDF email skipped (${msg}) — would have emailed ${to}`);
    return { ok: false, error: msg };
  }
  if (!pdfBase64) {
    return { ok: false, error: "pdfBase64 is required" };
  }

  const displayGreetingName = (customerName || "").trim();
  const displayCompany = (customerCompany || "").trim();
  const displayRepName = (repName || "").trim();
  const displayRepEmail = (repEmail || "").trim();
  const filename = pdfFilename || `A-SAFE_Order_${orderRef}.pdf`;

  const fromLabel = displayRepName
    ? `${displayRepName} via A-SAFE Engage`
    : "A-SAFE Engage";
  const from = `${fromLabel} <${fromAddr}>`;

  const subject = `Your A-SAFE quote: ${displayCompany || orderRef}`;

  // HTML body — shared A-SAFE layout so customer-facing messages feel
  // coherent with the approval email, the share pages and the PDFs.
  const shareUrlHtml = shareUrl ? emailButton(shareUrl, "View your order online") : "";

  const signatureBlock =
    displayRepName || displayRepEmail
      ? emailHeading("Your A-SAFE contact") +
        emailParagraph(
          `${displayRepName ? `<strong>${escapeHtml(displayRepName)}</strong>` : ""}${
            displayRepName && displayRepEmail ? "<br>" : ""
          }${displayRepEmail ? emailLink(`mailto:${displayRepEmail}`, displayRepEmail) : ""}`,
        )
      : "";

  const html = renderEmailLayout({
    docType: "Budgetary quotation",
    title: "Your A-SAFE quote",
    reference: `Order ${orderRef}${displayCompany ? ` · ${displayCompany}` : ""}`,
    preheader: `Your A-SAFE quote${displayCompany ? ` for ${displayCompany}` : ""} is attached (${orderRef}).`,
    bodyHtml: [
      emailParagraph(displayGreetingName ? `Hi ${escapeHtml(displayGreetingName)},` : "Hello,"),
      emailParagraph(
        `Please find attached your A-SAFE quote${displayCompany ? ` for <strong>${escapeHtml(displayCompany)}</strong>` : ""}.`,
      ),
      emailParagraph(
        `Order reference: <strong>${escapeHtml(orderRef)}</strong>. The attached PDF contains the full breakdown — line items, delivery, installation and terms. Prices exclude VAT unless stated otherwise.`,
      ),
      shareUrlHtml,
      signatureBlock,
    ].join("\n"),
  });

  // Plain-text fallback — some corporate mail clients downrank HTML-only
  // messages and vision-impaired recipients lean on this.
  const text = [
    displayGreetingName ? `Hi ${displayGreetingName},` : "Hello,",
    "",
    `Please find attached your A-SAFE quote${displayCompany ? ` for ${displayCompany}` : ""}.`,
    `Order reference: ${orderRef}.`,
    shareUrl ? `View online: ${shareUrl}` : "",
    "",
    displayRepName || displayRepEmail ? "Your A-SAFE contact:" : "",
    displayRepName ? displayRepName : "",
    displayRepEmail ? displayRepEmail : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // AbortSignal.timeout is available in the Workers runtime — keep the
      // call short so a slow Resend API can't block the response to the
      // user. 10s is generous relative to normal Resend round-trip.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from,
        to: [to],
        ...(displayRepEmail ? { reply_to: displayRepEmail } : {}),
        subject,
        html,
        text,
        attachments: [
          {
            filename,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Resend API error (order-PDF email): ${res.status} ${errText}`);
      return { ok: false, error: errText };
    }

    const payload = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: payload.id };
  } catch (err) {
    console.error("Order-PDF email send error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

interface OrderRejectionParams {
  to: string;
  orderNumber: string;
  reason: string;
}

/** Notify the customer that their order was rejected, with the reason. */
export async function sendOrderRejectionEmail(
  env: Env,
  { to, orderNumber, reason }: OrderRejectionParams,
): Promise<boolean> {
  const subject = `Order Update - ${orderNumber} | A-SAFE Engage`;
  const appUrl = env.APP_URL || DEFAULT_APP_URL;
  const html = renderEmailLayout({
    docType: "Order update",
    title: "Order requires revision",
    reference: `Order ${orderNumber}`,
    preheader: `Order ${orderNumber} has been reviewed and requires changes before it can proceed.`,
    appUrl,
    bodyHtml: [
      emailParagraph(
        `Your order <strong>${escapeHtml(orderNumber)}</strong> has been reviewed and requires changes before it can be processed.`,
      ),
      emailCallout(
        `<p style="${EMAIL_P_STYLE}margin:0 0 4px 0;"><strong>Reason</strong></p>
         <p style="${EMAIL_P_STYLE}margin:0;">${escapeHtml(reason).replace(/\n/g, "<br>")}</p>`,
        "red",
      ),
      emailParagraph("<strong>Please review the feedback and resubmit your order.</strong>"),
      emailButton(`${appUrl}/orders`, "View your orders"),
    ].join("\n"),
  });
  return sendEmail(env, to, subject, html);
}

// ──────────────────────────────────────────────
// Install-team "watch-before-site-visit" digest
//
// Fires when a team is assigned to an installation. Bundles the per-product
// Installation Video resources for that install into a thumbnail-grid email
// so the team lead has the A-SAFE training queued up before site arrival.
//
// Recipient is install_teams.contact_email; no email ⇒ skip silently and
// log a warning (don't block the assignment). YouTube hotlinks (no inline
// video / no attachments) — keeps the email small and corporate-mail-safe.
// ──────────────────────────────────────────────

export interface InstallTeamDigestVideo {
  id: string;
  title: string;
  description?: string | null;
  videoId?: string | null;
  thumbnailUrl?: string | null;
  externalUrl?: string | null;
  fileUrl?: string | null;
}

export interface InstallTeamDigestProductGroup {
  productId: string;
  productName: string;
  videos: InstallTeamDigestVideo[];
  /** Optional one-paragraph summary drawn from products.ground_works_data. */
  groundWorksSummary?: string | null;
}

export interface InstallTeamDigestParams {
  to: string;
  teamName?: string | null;
  leadContactName?: string | null;
  installationTitle: string;
  installationLocation?: string | null;
  installationPlannedStart?: Date | string | null;
  /** When set, included as an "Open in A-SAFE Engage" CTA. */
  installationUrl?: string | null;
  /** Per-product groups. Empty arrays will be filtered out by the helper. */
  productGroups: InstallTeamDigestProductGroup[];
}

export interface InstallTeamDigestResult {
  ok: boolean;
  sent: boolean;
  recipient: string;
  videoCount: number;
  productCount: number;
  reason?: string;
  messageId?: string;
}

/**
 * Send the per-product Installation Video digest to the assigned team lead.
 *
 * Caller must pre-resolve the recipient email + product groups; this helper
 * only handles HTML composition + Resend delivery. Returns ok:false with a
 * `reason` when the email is skipped (no recipient, no videos, etc.) so the
 * caller can decide whether to fail or shrug.
 */
export async function sendInstallTeamVideoDigest(
  env: Env,
  params: InstallTeamDigestParams,
  opts?: { callerRoute?: string },
): Promise<InstallTeamDigestResult> {
  const {
    to,
    teamName,
    leadContactName,
    installationTitle,
    installationLocation,
    installationPlannedStart,
    installationUrl,
    productGroups,
  } = params;
  const callerRoute = opts?.callerRoute ?? "/api/installations/team-digest";

  // Filter out products with no videos — they bloat the email and offer
  // nothing to "watch before".
  const groupsWithVideos = productGroups.filter((g) => g.videos && g.videos.length > 0);
  const videoCount = groupsWithVideos.reduce((s, g) => s + g.videos.length, 0);

  if (!to || !to.trim()) {
    console.warn(
      `[install-team-digest] Skipped — no recipient email for installation "${installationTitle}".`,
    );
    return {
      ok: false,
      sent: false,
      recipient: "",
      videoCount,
      productCount: groupsWithVideos.length,
      reason: "no_recipient",
    };
  }

  if (videoCount === 0) {
    console.warn(
      `[install-team-digest] Skipped — no install videos found for installation "${installationTitle}" (${groupsWithVideos.length} groups).`,
    );
    return {
      ok: false,
      sent: false,
      recipient: to,
      videoCount: 0,
      productCount: 0,
      reason: "no_videos",
    };
  }

  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) {
    const msg = "RESEND_API_KEY / EMAIL_FROM not configured";
    console.warn(`[install-team-digest] Skipped (${msg}) — would have emailed ${to}`);
    await logEmailAttempt(env, {
      to,
      subject: `Install pack: ${installationTitle}`,
      fromAddress: from || null,
      status: "skipped_no_config",
      errorMessage: msg,
      callerRoute,
    });
    return {
      ok: false,
      sent: false,
      recipient: to,
      videoCount,
      productCount: groupsWithVideos.length,
      reason: "email_not_configured",
    };
  }

  const greeting = leadContactName ? `Hi ${escapeHtml(leadContactName)}` : "Hi team";
  const teamLine = teamName
    ? `Your team <strong>${escapeHtml(teamName)}</strong> has been assigned to this installation.`
    : "Your team has been assigned to this installation.";
  const subject = `Install pack: ${installationTitle} — ${groupsWithVideos.length} product${groupsWithVideos.length !== 1 ? "s" : ""}, ${videoCount} video${videoCount !== 1 ? "s" : ""}`;

  // Schedule line — best-effort, omit if no usable date.
  const scheduledAt = (() => {
    if (!installationPlannedStart) return null;
    try {
      const d = installationPlannedStart instanceof Date
        ? installationPlannedStart
        : new Date(installationPlannedStart);
      if (Number.isNaN(d.getTime())) return null;
      return d.toUTCString();
    } catch {
      return null;
    }
  })();

  // Per-product GroundWorks one-paragraph summary block — optional. Only
  // surface the top-level cherry: a short bullet of slab/anchor specs we
  // pulled from products.ground_works_data. If none of the groups carry
  // a summary, the whole block is dropped.
  const groundWorksLines = groupsWithVideos
    .map((g) =>
      g.groundWorksSummary
        ? `<li><strong>${escapeHtml(g.productName)}:</strong> ${escapeHtml(g.groundWorksSummary)}</li>`
        : null,
    )
    .filter(Boolean)
    .join("");
  const groundWorksBlock = groundWorksLines
    ? emailCallout(
        `<p style="${EMAIL_P_STYLE}margin:0 0 6px 0;"><strong>Site prep at a glance</strong></p>
         <ul style="margin:0;padding-left:18px;font-family:${EMAIL_FONT};font-size:13px;line-height:1.5;color:${EMAIL_COLOUR.black};">${groundWorksLines}</ul>`,
        "yellow",
      )
    : "";

  // Per-product video list under a yellow table-header bar. Each card is a
  // 2-col table row (thumbnail + title) — corporate clients (Outlook 2016)
  // hate flexbox/grid, but nested tables render reliably. YouTube hotlinks;
  // no embeds (most clients block them).
  const productSections = groupsWithVideos
    .map((g) => {
      const videoCards = g.videos
        .map((v) => {
          const link =
            v.externalUrl ||
            v.fileUrl ||
            (v.videoId ? `https://youtu.be/${v.videoId}` : "#");
          const thumb =
            v.thumbnailUrl ||
            (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : "");
          const title = v.title || "Installation video";
          const desc = v.description ? truncate(v.description.split("\n")[0] || "", 110) : "";
          return `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_COLOUR.grey20};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="160" valign="top" style="padding-right:14px;">
                      <a href="${escapeAttr(link)}" style="text-decoration:none;display:block;">
                        ${
                          thumb
                            ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(title)}" width="160" style="display:block;width:160px;max-width:160px;height:auto;border:1px solid ${EMAIL_COLOUR.grey20};">`
                            : `<div style="width:160px;height:90px;background-color:${EMAIL_COLOUR.black};color:${EMAIL_COLOUR.yellow};text-align:center;line-height:90px;font-family:${EMAIL_FONT};font-weight:bold;font-size:12px;letter-spacing:1px;">WATCH</div>`
                        }
                      </a>
                    </td>
                    <td valign="top" style="font-family:${EMAIL_FONT};font-size:14px;color:${EMAIL_COLOUR.black};line-height:1.4;text-align:left;">
                      <a href="${escapeAttr(link)}" style="color:${EMAIL_COLOUR.black};font-weight:bold;text-decoration:none;">${escapeHtml(title)}</a>
                      ${desc ? `<div style="font-size:12px;color:${EMAIL_COLOUR.grey60};margin-top:4px;line-height:1.5;">${escapeHtml(desc)}</div>` : ""}
                      <div style="margin-top:6px;font-size:12px;">${emailLink(link, "Watch on YouTube")}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          `;
        })
        .join("");

      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0;border-collapse:collapse;">
          <tr><th align="left" style="background-color:${EMAIL_COLOUR.yellow};padding:9px 12px;font-family:${EMAIL_FONT};font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_COLOUR.black};text-align:left;">${escapeHtml(g.productName)} <span style="font-weight:normal;letter-spacing:0;text-transform:none;color:${EMAIL_COLOUR.grey90};">· ${g.videos.length} video${g.videos.length !== 1 ? "s" : ""}</span></th></tr>
          ${videoCards}
        </table>
      `;
    })
    .join("");

  const ctaBlock = installationUrl
    ? emailButton(installationUrl, "Open install in A-SAFE Engage")
    : "";

  const html = renderEmailLayout({
    docType: "Installation pack",
    title: "Watch before site visit",
    reference: `${installationTitle}${installationLocation ? ` · ${installationLocation}` : ""}`,
    preheader: `${groupsWithVideos.length} product${groupsWithVideos.length !== 1 ? "s" : ""}, ${videoCount} video${videoCount !== 1 ? "s" : ""} to watch before ${installationTitle}.`,
    appUrl: env.APP_URL,
    width: 640,
    footerNoteHtml: `If you weren't expecting this, contact <a href="mailto:sales@asafe.ae" style="color:${EMAIL_COLOUR.grey60};">sales@asafe.ae</a>.`,
    bodyHtml: [
      emailParagraph(`${greeting},`),
      emailParagraph(teamLine),
      emailParagraph(
        `Below are the per-product Installation Videos for <strong>${escapeHtml(installationTitle)}</strong>${installationLocation ? ` (${escapeHtml(installationLocation)})` : ""}${
          scheduledAt ? `, scheduled for <strong>${escapeHtml(scheduledAt)}</strong>` : ""
        }. <strong>Spend ten minutes on these before you arrive on site</strong> — it saves a "where do I start?" call.`,
      ),
      groundWorksBlock,
      productSections,
      ctaBlock,
    ].join("\n"),
  });

  // Plain-text fallback — corporate spam filters downrank HTML-only mail.
  const textLines: string[] = [];
  textLines.push(leadContactName ? `Hi ${leadContactName},` : "Hi team,");
  textLines.push("");
  textLines.push(
    `${teamName ? `Your team ${teamName} has` : "Your team has"} been assigned to ${installationTitle}${installationLocation ? ` (${installationLocation})` : ""}.`,
  );
  if (scheduledAt) textLines.push(`Scheduled: ${scheduledAt}`);
  textLines.push("");
  textLines.push("Watch before site visit:");
  for (const g of groupsWithVideos) {
    textLines.push("");
    textLines.push(`— ${g.productName} (${g.videos.length} video${g.videos.length !== 1 ? "s" : ""})`);
    if (g.groundWorksSummary) textLines.push(`  Site prep: ${g.groundWorksSummary}`);
    for (const v of g.videos) {
      const link =
        v.externalUrl || v.fileUrl || (v.videoId ? `https://youtu.be/${v.videoId}` : "");
      textLines.push(`  • ${v.title}${link ? ` — ${link}` : ""}`);
    }
  }
  if (installationUrl) {
    textLines.push("");
    textLines.push(`Open in A-SAFE Engage: ${installationUrl}`);
  }
  const text = textLines.join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: `A-SAFE Engage <${from}>`,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(bodyText);
        errorCode = parsed?.name || parsed?.statusCode || null;
      } catch { /* non-JSON */ }
      console.error(`[install-team-digest] Resend API error: ${res.status} ${bodyText}`);
      await logEmailAttempt(env, {
        to,
        subject,
        fromAddress: from,
        status: "failed",
        errorCode,
        errorMessage: bodyText,
        responseStatus: res.status,
        responseBody: bodyText,
        callerRoute,
      });
      return {
        ok: false,
        sent: false,
        recipient: to,
        videoCount,
        productCount: groupsWithVideos.length,
        reason: `resend_${res.status}`,
      };
    }

    let resendId: string | null = null;
    try {
      const parsed = JSON.parse(bodyText);
      resendId = parsed?.id || null;
    } catch { /* non-JSON */ }
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "sent",
      resendId,
      responseStatus: res.status,
      callerRoute,
    });
    return {
      ok: true,
      sent: true,
      recipient: to,
      videoCount,
      productCount: groupsWithVideos.length,
      messageId: resendId || undefined,
    };
  } catch (err) {
    console.error("[install-team-digest] send error:", err);
    await logEmailAttempt(env, {
      to,
      subject,
      fromAddress: from,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      callerRoute,
    });
    return {
      ok: false,
      sent: false,
      recipient: to,
      videoCount,
      productCount: groupsWithVideos.length,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).trimEnd() + "…";
}
