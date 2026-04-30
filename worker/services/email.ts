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
  const pas13Block = pas13ReportPdf
    ? `
        <div style="margin-top: 16px; padding: 16px; background-color: #fff8e1; border-left: 4px solid #FFC72C; border-radius: 4px;">
          <p style="margin: 0 0 4px 0; font-weight: bold;">PAS 13 Alignment Report attached</p>
          <p style="margin: 0; color: #555; font-size: 13px;">
            Aggregate verdict: <strong>${pas13ReportPdf.aggregateLabel}</strong>.
            ${
              pas13ReportUrl
                ? `Re-download anytime: <a href="${pas13ReportUrl}" style="color: #1a1a2e;">${pas13ReportUrl}</a>`
                : ""
            }
          </p>
          <p style="margin: 8px 0 0 0; color: #666; font-size: 11px; font-style: italic;">
            Indicative — verify with A-SAFE engineering for procurement.
          </p>
        </div>
      `
    : pas13ReportUrl
      ? `
        <div style="margin-top: 16px; padding: 16px; background-color: #fff8e1; border-left: 4px solid #FFC72C; border-radius: 4px;">
          <p style="margin: 0 0 4px 0; font-weight: bold;">PAS 13 Alignment Report</p>
          <p style="margin: 0; color: #555; font-size: 13px;">
            Download from your order page: <a href="${pas13ReportUrl}" style="color: #1a1a2e;">${pas13ReportUrl}</a>
          </p>
          <p style="margin: 8px 0 0 0; color: #666; font-size: 11px; font-style: italic;">
            Indicative — verify with A-SAFE engineering for procurement.
          </p>
        </div>
      `
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #FFC72C; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #000;">Order Confirmed</h1>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p>Thank you for your order!</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Order Number</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Items</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${itemCount} item${itemCount !== 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Total Amount</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${totalAmount}</td>
          </tr>
        </table>
        <p>Your order has been submitted for review. Our team will review it and get back to you shortly.</p>
        ${pas13Block}
        <p style="margin-top: 24px;">
          <a href="${env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev"}/orders"
             style="background-color: #FFC72C; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            View Your Orders
          </a>
        </p>
      </div>
      <div style="padding: 16px; text-align: center; background-color: #f9f9f9; border-top: 3px solid #FFC72C;">
        <p style="margin: 0 0 4px 0; font-weight: bold; color: #FFC72C; font-size: 13px;">www.asafe.com</p>
        <p style="margin: 0; color: #888; font-size: 11px;">A-SAFE  |  Office 220, Building A5, Dubai South Business Park</p>
        <p style="margin: 4px 0 0 0; color: #888; font-size: 11px;">Tel: +971 (4) 8842 422  |  sales@asafe.ae</p>
      </div>
    </div>
  `;

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
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a1a2e; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #FFC72C;">New Order Submitted</h1>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p>A new order has been submitted for review.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Order Number</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${customerEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Total Amount</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${totalAmount}</td>
          </tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="${env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev"}/admin/orders"
             style="background-color: #FFC72C; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Review Order
          </a>
        </p>
      </div>
      <div style="padding: 16px; text-align: center; background-color: #f9f9f9; border-top: 3px solid #FFC72C;">
        <p style="margin: 0 0 4px 0; font-weight: bold; color: #FFC72C; font-size: 13px;">www.asafe.com</p>
        <p style="margin: 0; color: #888; font-size: 11px;">A-SAFE  |  Office 220, Building A5, Dubai South Business Park</p>
        <p style="margin: 4px 0 0 0; color: #888; font-size: 11px;">Tel: +971 (4) 8842 422  |  sales@asafe.ae</p>
      </div>
    </div>
  `;

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

  // Brand palette (inline only — email clients routinely strip <style>)
  //   #FFC72C  A-SAFE yellow
  //   #1a1a2e  near-black header accent (used in admin notification)
  //   #f9f9f9  footer grey
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header strip: A-SAFE yellow, optional customer logo on the right -->
        <tr>
          <td style="background-color:#FFC72C;padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:18px;font-weight:bold;color:#1a1a2e;letter-spacing:0.5px;">A-SAFE</td>
                <td align="right" style="font-size:12px;font-weight:bold;color:#1a1a2e;letter-spacing:1px;">
                  ${
                    clientCompanyLogoUrl
                      ? `<img src="${escapeAttr(clientCompanyLogoUrl)}" alt="${escapeAttr(clientCompany)}" style="max-height:32px;vertical-align:middle;margin-right:12px;">`
                      : ""
                  }
                  ORDER APPROVAL REQUESTED
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Opening line -->
        <tr>
          <td style="padding:24px;font-size:15px;line-height:1.5;color:#1a1a2e;">
            <p style="margin:0 0 12px 0;">${greeting},</p>
            <p style="margin:0;">
              ${escapeHtml(salesContact.name)} at A-SAFE has prepared order
              <strong>${escapeHtml(displayOrderNumber)}</strong> for
              <strong>${escapeHtml(clientCompany)}</strong> and is requesting
              your <strong>${sectionLabel.toLowerCase()}</strong> approval.
            </p>
          </td>
        </tr>

        <!-- Order-at-a-glance card -->
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;">
              <tr><td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#6b6b77;">Order #</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;font-weight:600;">${escapeHtml(displayOrderNumber)}</td></tr>
              <tr><td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#6b6b77;">Client</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;font-weight:600;">${escapeHtml(clientCompany)}</td></tr>
              <tr><td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#6b6b77;">Total</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;font-weight:600;">${escapeHtml(grandTotal)}</td></tr>
              <tr><td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:13px;color:#6b6b77;">Currency</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e4e4e7;font-size:14px;text-align:right;font-weight:600;">${escapeHtml(currency)}</td></tr>
              <tr><td style="padding:12px 16px;font-size:13px;color:#6b6b77;">Section for your sign-off</td>
                  <td style="padding:12px 16px;font-size:14px;text-align:right;font-weight:600;">${sectionLabel}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Primary CTA -->
        <tr>
          <td align="center" style="padding:0 24px 12px 24px;">
            <a href="${escapeAttr(approvalUrl)}"
               style="display:inline-block;background-color:#FFC72C;color:#1a1a2e;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:6px;">
              Review &amp; approve order &rarr;
            </a>
          </td>
        </tr>

        <!-- Secondary: download PDF -->
        ${
          pdfDownloadUrl
            ? `<tr>
                 <td align="center" style="padding:0 24px 24px 24px;">
                   <a href="${escapeAttr(pdfDownloadUrl)}" style="color:#1a1a2e;font-size:13px;text-decoration:underline;">Download the PDF</a>
                 </td>
               </tr>`
            : ""
        }

        <!-- Sales rep contact block -->
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f9fb;border-radius:6px;">
              <tr><td style="padding:16px;font-size:13px;color:#1a1a2e;line-height:1.5;">
                <div style="font-weight:bold;margin-bottom:4px;">Questions? Reach out to your A-SAFE contact:</div>
                <div>${escapeHtml(salesContact.name)}${salesContact.jobRole ? ` · <span style="color:#555;">${escapeHtml(salesContact.jobRole)}</span>` : ""}</div>
                <div><a href="mailto:${escapeAttr(salesContact.email)}" style="color:#1a1a2e;">${escapeHtml(salesContact.email)}</a></div>
                ${salesContact.phone ? `<div>${escapeHtml(salesContact.phone)}</div>` : ""}
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 24px;background-color:#f9f9f9;border-top:3px solid #FFC72C;font-size:11px;color:#888;line-height:1.5;">
            <div>This link expires on <strong>${escapeHtml(expiresDisplay)}</strong> and can only be used once.</div>
            <div>If you weren't expecting this email, please contact <a href="mailto:${escapeAttr(salesContact.email)}" style="color:#888;">${escapeHtml(salesContact.email)}</a>.</div>
            <div style="margin-top:8px;color:#FFC72C;font-weight:bold;">www.asafe.com</div>
            <div>A-SAFE &nbsp;|&nbsp; Office 220, Building A5, Dubai South Business Park &nbsp;|&nbsp; Tel: +971 (4) 8842 422</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

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

  // HTML body — A-SAFE yellow CTA template, mirrors the approval email style
  // so customer-facing messages feel coherent.
  const shareUrlHtml = shareUrl
    ? `
      <tr>
        <td align="center" style="padding: 0 24px 24px 24px;">
          <a href="${escapeAttr(shareUrl)}" style="display:inline-block;background-color:#FFC72C;color:#1a1a2e;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:6px;">
            View your order online &rarr;
          </a>
        </td>
      </tr>`
    : "";

  const signatureBlock = displayRepName || displayRepEmail
    ? `
      <tr>
        <td style="padding:0 24px 24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f9fb;border-radius:6px;">
            <tr><td style="padding:16px;font-size:13px;color:#1a1a2e;line-height:1.5;">
              <div style="font-weight:bold;margin-bottom:4px;">Your A-SAFE contact:</div>
              ${displayRepName ? `<div>${escapeHtml(displayRepName)}</div>` : ""}
              ${displayRepEmail ? `<div><a href="mailto:${escapeAttr(displayRepEmail)}" style="color:#1a1a2e;">${escapeHtml(displayRepEmail)}</a></div>` : ""}
            </td></tr>
          </table>
        </td>
      </tr>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#FFC72C;padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:18px;font-weight:bold;color:#1a1a2e;letter-spacing:0.5px;">A-SAFE</td>
                <td align="right" style="font-size:12px;font-weight:bold;color:#1a1a2e;letter-spacing:1px;">YOUR QUOTE</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;font-size:15px;line-height:1.5;color:#1a1a2e;">
            <p style="margin:0 0 12px 0;">${displayGreetingName ? `Hi ${escapeHtml(displayGreetingName)},` : "Hello,"}</p>
            <p style="margin:0 0 8px 0;">
              Please find attached your A-SAFE quote${displayCompany ? ` for <strong>${escapeHtml(displayCompany)}</strong>` : ""}.
            </p>
            <p style="margin:0;">
              Order reference: <strong>${escapeHtml(orderRef)}</strong>. The attached PDF
              contains the full breakdown — line items, delivery, installation, and terms.
            </p>
          </td>
        </tr>
        ${shareUrlHtml}
        ${signatureBlock}
        <tr>
          <td style="padding:16px 24px;background-color:#f9f9f9;border-top:3px solid #FFC72C;font-size:11px;color:#888;line-height:1.5;">
            <div style="color:#FFC72C;font-weight:bold;">www.asafe.com</div>
            <div>A-SAFE &nbsp;|&nbsp; Office 220, Building A5, Dubai South Business Park &nbsp;|&nbsp; Tel: +971 (4) 8842 422</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

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
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #dc2626; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #fff;">Order Requires Revision</h1>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p>Your order <strong>${orderNumber}</strong> has been reviewed and requires changes before it can be processed.</p>
        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold;">Reason:</p>
          <p style="margin: 8px 0 0 0;">${reason}</p>
        </div>
        <p>Please review the feedback and resubmit your order.</p>
        <p style="margin-top: 24px;">
          <a href="${env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev"}/orders"
             style="background-color: #FFC72C; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            View Your Orders
          </a>
        </p>
      </div>
      <div style="padding: 16px; text-align: center; background-color: #f9f9f9; border-top: 3px solid #FFC72C;">
        <p style="margin: 0 0 4px 0; font-weight: bold; color: #FFC72C; font-size: 13px;">www.asafe.com</p>
        <p style="margin: 0; color: #888; font-size: 11px;">A-SAFE  |  Office 220, Building A5, Dubai South Business Park</p>
        <p style="margin: 4px 0 0 0; color: #888; font-size: 11px;">Tel: +971 (4) 8842 422  |  sales@asafe.ae</p>
      </div>
    </div>
  `;
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
    ? `
      <tr>
        <td style="padding:0 24px 16px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7e0;border-left:3px solid #FFC72C;border-radius:4px;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#1a1a2e;line-height:1.5;">
              <div style="font-weight:bold;margin-bottom:6px;">Site prep at a glance</div>
              <ul style="margin:0;padding-left:18px;">${groundWorksLines}</ul>
            </td></tr>
          </table>
        </td>
      </tr>
    `
    : "";

  // Per-product video grid. Each card is a 2-col table row (thumbnail + title)
  // — corporate clients (Outlook 2016) hate flexbox/grid, but nested tables
  // render reliably. YouTube hotlinks; no embeds (most clients block them).
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
              <td style="padding:8px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="160" valign="top" style="padding-right:14px;">
                      <a href="${escapeAttr(link)}" style="text-decoration:none;display:block;">
                        ${
                          thumb
                            ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(title)}" width="160" style="display:block;width:160px;max-width:160px;height:auto;border-radius:4px;border:1px solid #e4e4e7;">`
                            : `<div style="width:160px;height:90px;background-color:#1a1a2e;color:#FFC72C;border-radius:4px;text-align:center;line-height:90px;font-weight:bold;font-size:12px;">WATCH</div>`
                        }
                      </a>
                    </td>
                    <td valign="top" style="font-size:14px;color:#1a1a2e;line-height:1.4;">
                      <a href="${escapeAttr(link)}" style="color:#1a1a2e;font-weight:bold;text-decoration:none;">${escapeHtml(title)}</a>
                      ${desc ? `<div style="font-size:12px;color:#6b6b77;margin-top:4px;line-height:1.5;">${escapeHtml(desc)}</div>` : ""}
                      <div style="margin-top:6px;">
                        <a href="${escapeAttr(link)}" style="font-size:12px;color:#1a1a2e;text-decoration:underline;">Watch on YouTube &rarr;</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          `;
        })
        .join("");

      return `
        <tr>
          <td style="padding:8px 24px 4px 24px;">
            <div style="font-size:13px;font-weight:bold;color:#FFC72C;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #e4e4e7;padding-bottom:6px;margin-bottom:4px;">
              ${escapeHtml(g.productName)} <span style="color:#6b6b77;font-weight:normal;text-transform:none;letter-spacing:0;">· ${g.videos.length} video${g.videos.length !== 1 ? "s" : ""}</span>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${videoCards}</table>
          </td>
        </tr>
      `;
    })
    .join("");

  const ctaBlock = installationUrl
    ? `
      <tr>
        <td align="center" style="padding:16px 24px 24px 24px;">
          <a href="${escapeAttr(installationUrl)}"
             style="display:inline-block;background-color:#FFC72C;color:#1a1a2e;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 24px;border-radius:6px;">
            Open install in A-SAFE Engage &rarr;
          </a>
        </td>
      </tr>
    `
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#FFC72C;padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:18px;font-weight:bold;color:#1a1a2e;letter-spacing:0.5px;">A-SAFE</td>
                <td align="right" style="font-size:12px;font-weight:bold;color:#1a1a2e;letter-spacing:1px;">WATCH BEFORE SITE VISIT</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 12px 24px;font-size:15px;line-height:1.55;color:#1a1a2e;">
            <p style="margin:0 0 10px 0;">${greeting},</p>
            <p style="margin:0 0 8px 0;">${teamLine}</p>
            <p style="margin:0;">
              Below are the per-product Installation Videos for
              <strong>${escapeHtml(installationTitle)}</strong>${installationLocation ? ` (${escapeHtml(installationLocation)})` : ""}${
                scheduledAt ? `, scheduled for <strong>${escapeHtml(scheduledAt)}</strong>` : ""
              }. Spend ten minutes on these before you arrive on site — saves a "where do I start?" call.
            </p>
          </td>
        </tr>
        ${groundWorksBlock}
        ${productSections}
        ${ctaBlock}
        <tr>
          <td style="padding:16px 24px;background-color:#f9f9f9;border-top:3px solid #FFC72C;font-size:11px;color:#888;line-height:1.5;">
            <div style="color:#FFC72C;font-weight:bold;">www.asafe.com</div>
            <div>A-SAFE &nbsp;|&nbsp; Office 220, Building A5, Dubai South Business Park &nbsp;|&nbsp; Tel: +971 (4) 8842 422</div>
            <div style="margin-top:6px;">If you weren't expecting this, contact <a href="mailto:sales@asafe.ae" style="color:#888;">sales@asafe.ae</a>.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

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
