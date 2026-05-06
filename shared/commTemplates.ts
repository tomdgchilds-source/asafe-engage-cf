// ────────────────────────────────────────────────────────────────────────────
// shared/commTemplates.ts
//
// Source of truth for the Communication Plan template library:
//   - DEFAULT_COMM_TEMPLATES  — the 10 seed templates used by the migration
//                               endpoint and by tests. Each has the same shape
//                               as a comm_templates row (minus id / timestamps).
//   - renderTemplate(body, placeholders, channel)
//                              — substitute {{placeholder}} tokens. For
//                                WhatsApp templates we strip markdown
//                                emphasis so the body lands as clean plain
//                                text. Email templates get markdown bold
//                                converted to <strong>.
//
// Rules baked into the wording:
//   - "PAS 13 aligned" — never "compliant" (matches σ's policy).
//   - Default greeting is "Hi {{customer_first_name}}" (Dubai/UAE voice).
//   - Quote refs default to ENG_QUOAEnnnnn format. The renderer doesn't
//     enforce that — the back-end pulls the live ref from quote_drafts.
// ────────────────────────────────────────────────────────────────────────────

export type CommChannel = "whatsapp" | "email" | "both";

export interface CommTemplateSeed {
  scenario: string;
  title: string;
  channel: CommChannel;
  subject?: string | null;
  body: string;
  triggerEvent?: string | null;
  triggerOffsetDays?: number | null;
}

export type CommPlaceholders = Record<string, string | undefined>;

// ─── Renderer ──────────────────────────────────────────────────────────
// Token shape: {{snake_case}}. Unmatched tokens are left visible as
// "{{name}}" so the rep notices a missing variable in preview rather
// than the customer seeing a literal "Hi !".
export function renderTemplate(
  body: string,
  placeholders: CommPlaceholders,
  channel: CommChannel = "both",
): string {
  const filled = body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key) => {
    const v = placeholders[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return String(v);
  });

  if (channel === "whatsapp") {
    // WhatsApp doesn't render markdown — strip the trivial bold/italic
    // syntax so the customer doesn't see literal asterisks. We leave
    // "**bold**" as plain text (no asterisks).
    return filled
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/^# +/gm, "")
      .replace(/^## +/gm, "")
      .trim();
  }

  if (channel === "email") {
    // Light markdown → HTML for the email body. Worth keeping in sync
    // with the mailto: fallback, which doesn't render HTML — for the
    // mailto path the consumer should request channel:"whatsapp" so
    // no HTML is emitted. The Resend send path in services/email.ts
    // wraps the body in a basic shell.
    return filled
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>");
  }

  return filled;
}

// ─── Default templates ─────────────────────────────────────────────────
// The 10 scenarios listed in the brief. Each has BOTH a WhatsApp body
// (concise, no markdown) and — where the channel is "both" — an email
// body that's slightly longer with a subject line.
//
// NOTE: triggers fire on the events emitted by other parts of the app:
//   - site-survey-complete  → set when site_surveys.status = 'completed'
//   - quote-sent            → set when quote_drafts.status = 'sent'
//   - quote-followup        → derived offset from quote-sent
//   - order-confirmed       → set when orders.status flips to 'submitted'
//                             or projects.status = 'won'
//   - install-scheduled     → installations.planned_start in the future
//   - install-completed     → installations.status = 'completed'
//   - order-delivered       → orders.status = 'fulfilled'
//
// Offsets are days AFTER the trigger fires — the scanner schedules
// `due_at = trigger_at + offset` and only surfaces suggestions whose
// due_at <= now.

export const DEFAULT_COMM_TEMPLATES: CommTemplateSeed[] = [
  {
    scenario: "discovery",
    title: "Discovery — first-meeting follow-up",
    channel: "both",
    subject: "Great meeting today — A-SAFE next steps",
    body: `Hi {{customer_first_name}},

Thanks for your time today. As promised, attached is the observational survey report from our walk-through of {{site_address}}.

Quick recap:
- Areas of highest impact risk noted in the report
- Next step proposed: a full site survey to scope the PAS 13 aligned protection plan
- Indicative timeline and budget will follow once we have the survey data

Let me know a couple of dates that work for the site survey and I'll set it up.

{{rep_name}}
{{company_name}}`,
    triggerEvent: null,
    triggerOffsetDays: null,
  },
  {
    scenario: "site-survey-scheduling",
    title: "Site survey scheduling — pre-visit checklist",
    channel: "both",
    subject: "Setting up the site survey at {{site_address}}",
    body: `Hi {{customer_first_name}},

To set up the site survey at {{site_address}}, we'll need:

1. A site contact for access on the day
2. Permits / inductions we need to complete in advance
3. PPE requirements (we travel with hi-vis, boots, and hard hats by default)
4. Approximate site walk duration — typically 60-90 minutes
5. Any restricted areas we should plan around

Once confirmed, I'll send a formal calendar invite. The survey output is the input to your PAS 13 aligned protection plan.

{{rep_name}}
{{company_name}}`,
    triggerEvent: null,
    triggerOffsetDays: null,
  },
  {
    scenario: "site-survey-complete",
    title: "Site survey complete — report attached",
    channel: "both",
    subject: "Site survey report — {{project_name}}",
    body: `Hi {{customer_first_name}},

Thanks for hosting us at {{site_address}} today. Please find attached the observational impact protection survey report for {{project_name}}.

The report covers:
- Zone-by-zone impact risk assessment
- Vehicle classification per PAS 13 aligned thresholds
- Recommended barrier products with justification
- Indicative budget range for the protection plan

I'll follow up with the formal quote in the next couple of days. In the meantime, any questions on the survey — happy to walk through.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "site-survey-complete",
    triggerOffsetDays: 0,
  },
  {
    scenario: "quote-sent",
    title: "Quote sent — for your review",
    channel: "both",
    subject: "A-SAFE quote {{quote_ref}} — {{project_name}}",
    body: `Hi {{customer_first_name}},

Please find attached our budgetary quote {{quote_ref}} for {{project_name}}.

Headline:
- Total: {{quote_total_aed}}
- Aligned with PAS 13:2017 vehicle/impact thresholds
- Includes installation, snag list, and post-install sign-off

Happy to walk through any line items. When you're ready to proceed, we'll convert the quote into an order and lock in installation dates.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "quote-sent",
    triggerOffsetDays: 0,
  },
  {
    scenario: "quote-followup-3",
    title: "Quote follow-up — 3 days",
    channel: "whatsapp",
    body: `Hi {{customer_first_name}}, just checking you've had a chance to review quote {{quote_ref}} for {{project_name}}? Happy to jump on a quick call to walk through any line items. {{rep_name}} / {{company_name}}`,
    triggerEvent: "quote-sent",
    triggerOffsetDays: 3,
  },
  {
    scenario: "quote-followup-7",
    title: "Quote follow-up — 7 days",
    channel: "both",
    subject: "Quick check-in on quote {{quote_ref}}",
    body: `Hi {{customer_first_name}},

Following up on quote {{quote_ref}} I sent across last week. A few common questions at this stage:

- Need a different installation window?
- Want to phase the install across multiple visits?
- Need the quote split between sites or cost centres?

Any of those (or anything else) — happy to revise. If the protection plan still works, I can lock in installation dates this week.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "quote-sent",
    triggerOffsetDays: 7,
  },
  {
    scenario: "quote-followup-14",
    title: "Quote follow-up — 14 days",
    channel: "both",
    subject: "Still working on {{project_name}}?",
    body: `Hi {{customer_first_name}},

Two weeks since we sent quote {{quote_ref}} for {{project_name}}. I want to make sure the protection plan is still on your radar.

If priorities have shifted, let me know what's changed and I'll adapt. If the timing's just slipped, I'm happy to extend the quote and revisit installation slots.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "quote-sent",
    triggerOffsetDays: 14,
  },
  {
    scenario: "order-confirmation",
    title: "Order confirmation — what happens next",
    channel: "both",
    subject: "Order confirmed — {{project_name}}",
    body: `Hi {{customer_first_name}},

Thank you for your order on {{project_name}}. Here's what happens next:

1. **Production**: A-SAFE manufacturing kicks off this week.
2. **Pre-installation**: We'll send a pre-visit checklist about a week before the install date so the site is ready.
3. **Installation**: Our crew arrives, installs to the agreed plan, and walks through a snag list with you.
4. **Sign-off**: Post-install report + warranty pack delivered the same week.

I'll be your point of contact throughout. Any changes to the site contact, delivery address, or access arrangements — let me know early.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "order-confirmed",
    triggerOffsetDays: 0,
  },
  {
    scenario: "pre-installation",
    title: "Pre-installation — site readiness checklist",
    channel: "both",
    subject: "Installation scheduled — {{install_date}}",
    body: `Hi {{customer_first_name}},

Your installation at {{site_address}} is scheduled for {{install_date}}. Please find attached the pre-visit checklist.

Quick highlights:
- Site contact details confirmed?
- Access cleared and zones marked?
- PPE / induction requirements communicated to our crew?
- Any production stops we need to plan around?

If anything's a blocker, let me know this week so we can sort it before our crew arrives.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "install-scheduled",
    triggerOffsetDays: -5,
  },
  {
    scenario: "post-installation",
    title: "Post-installation — snag list and sign-off",
    channel: "both",
    subject: "Installation complete — {{project_name}}",
    body: `Hi {{customer_first_name}},

Your installation at {{site_address}} is complete. Please find attached:

1. The snag list — anything we want a second look at on a follow-up visit
2. The post-install sign-off form — please sign and return at your convenience
3. Warranty pack and product care guide

Anything you'd like adjusted, raise it on the snag list and we'll come back. Otherwise — thanks for the project, and I'll be in touch in a few weeks for a check-in.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "install-completed",
    triggerOffsetDays: 0,
  },
  {
    scenario: "review-request",
    title: "Customer review request",
    channel: "both",
    subject: "Quick favour — would you leave us a review?",
    body: `Hi {{customer_first_name}},

Hope the new barriers at {{site_address}} are doing their job.

If you've got two minutes, would you mind leaving us a Google review or a short LinkedIn testimonial? It genuinely helps us reach the next operations manager who's wrestling with the same impact protection problem you just solved.

No pressure either way — happy to keep delivering whatever's next on your list.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "order-delivered",
    triggerOffsetDays: 30,
  },
  {
    scenario: "reciprocal-commitment",
    title: "Reciprocal value commitment reminder",
    channel: "both",
    subject: "Quick reminder — case study / video commitment",
    body: `Hi {{customer_first_name}},

When we agreed pricing on {{project_name}}, the package included a reciprocal commitment from your side — a short case study and / or a site video we can use in our marketing.

Now that the install's bedded in, would the next two weeks work for us to come back and capture it? It's typically a 60-90 minute visit:

- Short interview with your operations lead
- B-roll of the protected zones
- Optional: 30-second testimonial clip

Let me know a couple of dates that suit and I'll set it up.

{{rep_name}}
{{company_name}}`,
    triggerEvent: "order-delivered",
    triggerOffsetDays: 45,
  },
];
