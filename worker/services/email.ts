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

/** Send an email via the Resend API. */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  // Guard: skip if email credentials aren't configured
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("Email not configured (RESEND_API_KEY / EMAIL_FROM missing) — skipping email to", to);
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

    if (!res.ok) {
      const text = await res.text();
      console.error(`Resend API error: ${res.status} ${text}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Email send error:", error);
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
}

/** Send order confirmation to the customer who placed the order. */
export async function sendOrderConfirmationEmail(
  env: Env,
  { to, orderNumber, totalAmount, itemCount }: OrderConfirmationParams,
): Promise<boolean> {
  const subject = `Order Confirmed - ${orderNumber} | A-SAFE Engage`;
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
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    const msg = "RESEND_API_KEY / EMAIL_FROM not configured";
    console.warn(`Approval email skipped (${msg}) — would have emailed ${params.to}`);
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

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Resend API error (approval email): ${res.status} ${errText}`);
      return { ok: false, error: `resend_${res.status}` };
    }

    const payload = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: payload.id };
  } catch (err) {
    console.error("Approval email send error:", err);
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
