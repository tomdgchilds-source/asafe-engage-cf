/**
 * shared/offices.ts
 *
 * The single source of truth for A-SAFE's Middle East office details as
 * printed on documents, emails, drawing title blocks and public pages.
 * Verified against https://www.asafe.com/ar-ae/contact/ on 2026-10-15.
 *
 * The `global_offices` table (see migrations/2026-10-15-010) carries the
 * same values for the office selector on the landing / contact pages; this
 * file exists so the printed blocks (PDFs, email footers, title blocks,
 * shared-document footers) never drift from the website again.
 *
 * Nothing in client/src or worker should spell out an office address
 * literally — shared/offices.guard.test.ts fails the build if one does.
 */

export interface OfficeDetails {
  /** Registered legal entity, exactly as the website prints it. */
  legalName: string;
  /** Friendly name used in footers and the office selector. */
  tradingName: string;
  /** Street / building lines followed by "City, Country". */
  addressLines: readonly string[];
  /** `addressLines` joined with ", ". */
  addressOneLine: string;
  city: string;
  country: string;
  /** Phone formatted for display, e.g. "+971 (4) 8842 422". */
  phoneDisplay: string;
  /** Digits only (with country code, no "+"), for tel: / wa.me links. */
  phoneTel: string;
  /** Customer-facing support address printed on address blocks. */
  email: string;
  /** Google Maps short link, or null when the website lists none. */
  mapsUrl: string | null;
}

/** The public website, printed without a scheme on documents. */
export const A_SAFE_WEB = "www.asafe.com";
export const A_SAFE_WEB_URL = "https://www.asafe.com";

/** Reply-to / mailto targets the sales and quotes flows already use. */
export const SALES_EMAIL = "sales@asafe.ae";
export const QUOTES_EMAIL = "quotes@asafe.ae";
export const SALES_EMAIL_KSA = "sales@asafe.sa";

/** Strip everything but digits from a phone number: "+971 (4) 8842 422" -> "97148842422". */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

/** `tel:` href for a display-formatted phone number. */
export function telHref(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}

/** `https://wa.me/<digits>` href for a display-formatted phone number. */
export function whatsAppHref(phone: string): string {
  return `https://wa.me/${phoneDigits(phone)}`;
}

function office(o: Omit<OfficeDetails, "addressOneLine" | "phoneTel">): OfficeDetails {
  return { ...o, addressOneLine: o.addressLines.join(", "), phoneTel: phoneDigits(o.phoneDisplay) };
}

export const A_SAFE_UAE: OfficeDetails = office({
  legalName: "A-SAFE DWC-LLC",
  tradingName: "A-SAFE UAE",
  addressLines: ["Office 220, Building A5", "Dubai South Business Park", "Dubai, United Arab Emirates"],
  city: "Dubai",
  country: "United Arab Emirates",
  phoneDisplay: "+971 (4) 8842 422",
  email: "support@asafe.ae",
  mapsUrl: "https://maps.app.goo.gl/55wf4FPkAe2NfKDHA",
});

export const A_SAFE_KSA: OfficeDetails = office({
  legalName: "A-SAFE FOR SAFETY COMPANY",
  tradingName: "A-SAFE Saudi Arabia",
  addressLines: ["Office 10, 6460 Ibrahim Ibn Mukhalad", "Al Malaz District", "Riyadh, Saudi Arabia"],
  city: "Riyadh",
  country: "Saudi Arabia",
  phoneDisplay: "+966 53 397 0866",
  email: "support@asafe.sa",
  mapsUrl: null,
});

/** Second published Riyadh number (the website lists two). */
export const A_SAFE_KSA_PHONE_2 = "+966 53 035 6116";

/** Offices by `global_offices.country`, for pages that render the selected office. */
export const OFFICES_BY_COUNTRY: Readonly<Record<string, OfficeDetails>> = {
  [A_SAFE_UAE.country]: A_SAFE_UAE,
  [A_SAFE_KSA.country]: A_SAFE_KSA,
};

export interface OfficeBlockOptions {
  /** Contact email to print instead of the office's support address (e.g. SALES_EMAIL). */
  email?: string;
  /** Print the legal entity instead of the trading name. Default false. */
  legal?: boolean;
  /** Include the website line. Default true. */
  web?: boolean;
}

/**
 * Plain-text office block, one field per line:
 *
 *   A-SAFE UAE
 *   Office 220, Building A5
 *   Dubai South Business Park
 *   Dubai, United Arab Emirates
 *   Tel: +971 (4) 8842 422
 *   support@asafe.ae
 *   www.asafe.com
 */
export function officeBlockText(o: OfficeDetails, opts: OfficeBlockOptions = {}): string {
  const lines = [
    opts.legal ? o.legalName : o.tradingName,
    ...o.addressLines,
    `Tel: ${o.phoneDisplay}`,
    opts.email ?? o.email,
  ];
  if (opts.web !== false) lines.push(A_SAFE_WEB);
  return lines.join("\n");
}

export interface OfficeBlockHtmlOptions extends OfficeBlockOptions {
  /**
   * "stacked" (default): one field per line, separated by <br>.
   * "inline": two lines — name · address / Tel · email · web — for footers.
   */
  layout?: "stacked" | "inline";
  /** Raw HTML placed between inline fields. Default " · ". Not escaped. */
  separator?: string;
  /** Inline style attribute value for the name's <strong>. */
  nameStyle?: string;
  /** Inline style attribute value for the <a> links. */
  linkStyle?: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HTML office block for email footers and server-rendered pages. Values are escaped. */
export function officeBlockHtml(o: OfficeDetails, opts: OfficeBlockHtmlOptions = {}): string {
  const styleAttr = (s?: string) => (s ? ` style="${escapeHtml(s)}"` : "");
  const name = `<strong${styleAttr(opts.nameStyle)}>${escapeHtml(opts.legal ? o.legalName : o.tradingName)}</strong>`;
  const email = escapeHtml(opts.email ?? o.email);
  const emailLink = `<a href="mailto:${email}"${styleAttr(opts.linkStyle)}>${email}</a>`;
  const webLink = `<a href="${A_SAFE_WEB_URL}"${styleAttr(opts.linkStyle)}>${A_SAFE_WEB}</a>`;
  const tel = `Tel: ${escapeHtml(o.phoneDisplay)}`;
  const contact = [tel, emailLink, ...(opts.web === false ? [] : [webLink])];

  if (opts.layout === "inline") {
    const sep = opts.separator ?? " · ";
    return `${name}${sep}${escapeHtml(o.addressOneLine)}<br>${contact.join(sep)}`;
  }
  return [name, ...o.addressLines.map(escapeHtml), ...contact].join("<br>");
}
