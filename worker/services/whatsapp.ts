import type { Env } from "../types";

// ──────────────────────────────────────────────
// WhatsApp Business API (Meta Cloud API)
//
// Required env secrets:
//   WHATSAPP_ACCESS_TOKEN      — Meta Graph API permanent access token
//   WHATSAPP_PHONE_NUMBER_ID   — The WhatsApp Business phone number ID
//
// Prerequisites:
//   - Meta Business account verified
//   - WhatsApp Business API access approved
//   - Message templates approved in Meta Business Manager
//
// Note: Until Meta verification is complete, this service
// will gracefully skip all sends with a console warning.
// ──────────────────────────────────────────────

const GRAPH_API_URL = "https://graph.facebook.com/v21.0";

interface WhatsAppMessageResult {
  success: boolean;
  messageId?: string;
}

/** Send a WhatsApp template message via Meta Cloud API. */
async function sendTemplateMessage(
  env: Env,
  to: string,
  templateName: string,
  languageCode: string,
  components?: any[],
): Promise<WhatsAppMessageResult> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("WhatsApp credentials not configured — skipping message to", to);
    return { success: false };
  }

  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/[^0-9]/g, ""), // strip formatting, keep digits
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components ? { components } : {}),
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`WhatsApp send failed: ${res.status} ${text}`);
      return { success: false };
    }

    const data = (await res.json()) as { messages?: { id: string }[] };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (error) {
    console.error("WhatsApp message error:", error);
    return { success: false };
  }
}

// ──────────────────────────────────────────────
// Order-specific WhatsApp notifications
//
// These use pre-approved message templates.
// You must create these templates in Meta Business Manager:
//
//   Template: "order_confirmation"
//   Body: "Hi {{1}}, your order {{2}} for {{3}} has been confirmed. Our team will review it shortly."
//
//   Template: "order_rejected"
//   Body: "Hi {{1}}, your order {{2}} requires revision. Reason: {{3}}. Please log in to review."
//
//   Template: "order_submitted_admin"
//   Body: "New order {{1}} from {{2}} ({{3}}). Please review in the admin dashboard."
// ──────────────────────────────────────────────

interface OrderWhatsAppParams {
  customerPhone: string;
  customerName: string;
  orderNumber: string;
  totalAmount: string;
}

/** Send order confirmation to customer via WhatsApp. */
export async function sendOrderConfirmationWhatsApp(
  env: Env,
  { customerPhone, customerName, orderNumber, totalAmount }: OrderWhatsAppParams,
): Promise<WhatsAppMessageResult> {
  return sendTemplateMessage(env, customerPhone, "order_confirmation", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: customerName },
        { type: "text", text: orderNumber },
        { type: "text", text: totalAmount },
      ],
    },
  ]);
}

interface OrderRejectionWhatsAppParams {
  customerPhone: string;
  customerName: string;
  orderNumber: string;
  reason: string;
}

/** Notify customer of order rejection via WhatsApp. */
export async function sendOrderRejectionWhatsApp(
  env: Env,
  { customerPhone, customerName, orderNumber, reason }: OrderRejectionWhatsAppParams,
): Promise<WhatsAppMessageResult> {
  return sendTemplateMessage(env, customerPhone, "order_rejected", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: customerName },
        { type: "text", text: orderNumber },
        { type: "text", text: reason },
      ],
    },
  ]);
}

/** Notify admin team of new order via WhatsApp. */
export async function sendOrderSubmittedWhatsAppAdmin(
  env: Env,
  adminPhone: string,
  { orderNumber, customerName, totalAmount }: Omit<OrderWhatsAppParams, "customerPhone">,
): Promise<WhatsAppMessageResult> {
  return sendTemplateMessage(env, adminPhone, "order_submitted_admin", "en", [
    {
      type: "body",
      parameters: [
        { type: "text", text: orderNumber },
        { type: "text", text: customerName },
        { type: "text", text: totalAmount },
      ],
    },
  ]);
}
