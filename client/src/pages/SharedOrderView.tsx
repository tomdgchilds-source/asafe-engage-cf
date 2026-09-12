import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Download, Mail, Printer, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import "@/styles/document.css";

// ──────────────────────────────────────────────
// /share/order/:token — public, anonymous read-only order view.
//
// Backend gate: GET /api/public/orders/:token. 404 → link was never valid
// (or was revoked); 410 → the link expired. Both render a friendly
// branded "link expired" document with a mailto fallback to quotes@asafe.ae.
//
// Rendered as a consultancy document (client/src/styles/document.css):
//   - Black header band, yellow strapline logo, safety-halo motif, stamp
//   - Document-control strip (reference · order no · revision · date · for)
//   - 1  Customer and project
//   - 2  Scope of supply — yellow-header line tables per zone
//   - 3  Commercial summary — subtotal / delivery / installation / total
//   - 4  Approval status — technical / commercial / marketing chips
//        (print: sign-off boxes)
//   - 5  Terms
//   - Grey footer with the A-SAFE UAE office block
// "Download PDF" fetches the server-rendered order form (Phase 3D PD3
// route) and toasts when the route is not live yet; "Print / Save as PDF"
// uses the print stylesheet in document.css.
// ──────────────────────────────────────────────
interface PublicOrder {
  isPublicView: true;
  /** Internal order id — surfaced by the public endpoint once the PD3 document routes land. */
  orderId?: string | null;
  orderNumber: string;
  customOrderNumber?: string | null;
  customerCompany?: string | null;
  customerName?: string | null;
  orderDate?: string | null;
  status?: string;
  currency?: string;
  subtotal?: number;
  grandTotal?: number;
  totalAmount?: string;
  deliveryCharge?: number;
  installationCharge?: number;
  installationComplexity?: "simple" | "standard" | "complex";
  items?: any[];
  companyLogoUrl?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  projectDescription?: string | null;
  servicePackage?: any;
  serviceCareDetails?: any;
  applicationAreas?: any;
  layoutMarkups?: any;
  uploadedImages?: any;
  reciprocalCommitments?: { totalDiscountPercent?: number } | null;
  approvalStatus?: Record<string, string>;
  shareTokenExpiresAt?: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; order: PublicOrder }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

const CURRENCY_FALLBACK = "AED";
const LOGO_PRIMARY = "/brand/logo-strapline-primary.png";
const CONTACT_EMAIL = "quotes@asafe.ae";
const DOC_TYPE = "Order form · Scope of supply";

const APPROVAL_SECTIONS: Array<{ key: "technical" | "commercial" | "marketing"; label: string }> = [
  { key: "technical", label: "Technical sign-off" },
  { key: "commercial", label: "Commercial sign-off" },
  { key: "marketing", label: "Marketing sign-off" },
];

function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return `${currency} 0.00`;
  return `${currency} ${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function groupItemsByZone(items: any[]): Array<{ zone: string; items: any[] }> {
  // Group-by-zone preserves the Quote-to-Supply layout the client expects.
  // Items without an explicit zone land in "Other items".
  const buckets = new Map<string, any[]>();
  for (const item of items || []) {
    const zone = item?.applicationArea || item?.zone || item?.areaName || "Other items";
    if (!buckets.has(zone)) buckets.set(zone, []);
    buckets.get(zone)!.push(item);
  }
  return Array.from(buckets.entries()).map(([zone, items]) => ({ zone, items }));
}

type PdfResult = "ok" | "not_available";

/**
 * Fetch a server-rendered document (Phase 3D PD3 route) and hand it to the
 * browser as a download. Resolves "not_available" on 404 — the renderer is
 * still being rolled out — so the caller can point the customer at
 * Print / Save as PDF instead. Any other failure throws.
 */
async function downloadServerPdf(url: string, filename: string): Promise<PdfResult> {
  const res = await fetch(url, { headers: { Accept: "application/pdf" } });
  if (res.status === 404) return "not_available";
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!(res.headers.get("content-type") || "").toLowerCase().includes("pdf")) {
    return "not_available";
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return "ok";
}

/**
 * Order-form PDF URL. The PD3 route is order-scoped
 * (`/api/orders/:id/documents/order-form.pdf`); the anonymous customer
 * proves possession of the share link with `?token=`. Until the public
 * endpoint surfaces `orderId`, fall back to the token-scoped public path.
 */
function orderFormPdfUrl(orderId: string | null | undefined, token: string): string {
  const t = encodeURIComponent(token);
  return orderId
    ? `/api/orders/${encodeURIComponent(orderId)}/documents/order-form.pdf?token=${t}`
    : `/api/public/orders/${t}/documents/order-form.pdf`;
}

function DocFooter({ meta, note }: { meta: string; note?: string | null }) {
  return (
    <footer className="doc-footer">
      <div className="doc-footer__brand">
        <span className="doc-footer__halo" aria-hidden="true" />
        <p className="doc-footer__office">
          <strong>A-SAFE UAE</strong> · Office 220, Building A5, Dubai South Business Park
          <br />
          Tel: +971 (4) 8842 422 ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · www.asafe.com
        </p>
      </div>
      <p className="doc-footer__meta">
        {meta}
        {note ? (
          <>
            <br />
            {note}
          </>
        ) : null}
      </p>
    </footer>
  );
}

/** Narrow document used for the expired / not-found / error / loading states. */
function NoticeDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="document-host">
      <article className="document-shell document-shell--narrow">
        <header className="doc-header">
          <div className="doc-header__top">
            <img className="doc-header__logo" src={LOGO_PRIMARY} alt="A-SAFE" />
            <p className="doc-header__type">Order form</p>
          </div>
          <h1 className="doc-header__title">{title}</h1>
        </header>
        <div className="doc-body">{children}</div>
        <DocFooter meta="A-SAFE Engage · Order form" />
      </article>
    </div>
  );
}

export default function SharedOrderView() {
  const [, params] = useRoute("/share/order/:token");
  const token = params?.token;
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "not_found" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}`);
        if (res.status === 404) {
          if (!cancelled) setState({ kind: "not_found" });
          return;
        }
        if (res.status === 410) {
          if (!cancelled) setState({ kind: "expired" });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as PublicOrder;
        if (!cancelled) setState({ kind: "ok", order: json });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const currency = state.kind === "ok" ? state.order.currency || CURRENCY_FALLBACK : CURRENCY_FALLBACK;

  // Hooks must run unconditionally — group before any early return.
  const zones = useMemo(
    () => (state.kind === "ok" ? groupItemsByZone(state.order.items || []) : []),
    [state],
  );

  const downloadPDF = async () => {
    if (state.kind !== "ok" || pdfBusy || !token) return;
    const order = state.order;
    const filename = `A-SAFE_Order_${order.customOrderNumber || order.orderNumber}.pdf`;
    setPdfBusy(true);
    try {
      // The server renders the same bytes the rep downloads, so the
      // customer's copy and the rep's copy never drift.
      const result = await downloadServerPdf(orderFormPdfUrl(order.orderId, token), filename);
      if (result === "ok") {
        toast({ title: "PDF downloaded", description: `Order ${order.orderNumber}` });
      } else {
        toast({
          title: "PDF not available yet",
          description:
            "The order form PDF is still being prepared. Use Print / Save as PDF in the meantime.",
        });
      }
    } catch (err) {
      console.error("Public PDF download failed:", err);
      toast({
        title: "Could not download PDF",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  // ─── Expired / not found state ──────────────────────────────────────
  if (state.kind === "expired" || state.kind === "not_found") {
    const title = state.kind === "expired" ? "This link has expired" : "Link unavailable";
    const desc =
      state.kind === "expired"
        ? "The share link for this order is no longer valid."
        : "We couldn't find an order for this link. It may have been revoked.";
    return (
      <NoticeDocument title={title}>
        <p className="doc-p">{desc}</p>
        <p className="doc-p">Your A-SAFE contact can re-issue a fresh link.</p>
        <div className="doc-actions">
          <a href={`mailto:${CONTACT_EMAIL}`} className="doc-btn">
            <Mail aria-hidden="true" />
            Contact {CONTACT_EMAIL}
          </a>
        </div>
      </NoticeDocument>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────
  if (state.kind === "error") {
    return (
      <NoticeDocument title="Something went wrong">
        <p className="doc-p">
          {state.message}. Please retry or contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </NoticeDocument>
    );
  }

  if (state.kind === "loading") {
    return (
      <NoticeDocument title="Order form">
        <div className="doc-loading" style={{ padding: 0 }}>
          <Loader2 aria-hidden="true" />
          Loading order…
        </div>
      </NoticeDocument>
    );
  }

  // ─── OK state ──────────────────────────────────────────────────────
  const order = state.order;
  const expiryStr = formatDate(order.shareTokenExpiresAt);
  const orderDateStr = formatDate(order.orderDate) ?? formatDate(new Date()) ?? "";
  const reference = order.customOrderNumber || order.orderNumber;
  const approvals = order.approvalStatus || {};
  const allApproved = APPROVAL_SECTIONS.every((s) => approvals[s.key] === "approved");
  const stamp = allApproved ? "Approved" : "Issued for approval";
  const title = order.customerCompany || `Order ${order.orderNumber}`;
  const subtitleParts = [order.projectName, order.projectLocation].filter(Boolean) as string[];
  const discountPct = order.reciprocalCommitments?.totalDiscountPercent || 0;
  const footerMeta = `${reference} · Rev A · ${orderDateStr}`;

  return (
    <div className="document-host">
      <div className="document-toolbar doc-no-print">
        <button
          type="button"
          className="doc-btn doc-btn--secondary"
          onClick={() => window.print()}
          data-testid="button-print-order"
        >
          <Printer aria-hidden="true" />
          Print / Save as PDF
        </button>
        <button
          type="button"
          className="doc-btn"
          onClick={downloadPDF}
          disabled={pdfBusy}
          data-testid="button-public-download-pdf"
        >
          {pdfBusy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {pdfBusy ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <article className="document-shell" data-testid="shared-order-document">
        {/* Header band */}
        <header className="doc-header">
          <div className="doc-header__top">
            <img className="doc-header__logo" src={LOGO_PRIMARY} alt="A-SAFE" />
            <p className="doc-header__type">{DOC_TYPE}</p>
          </div>
          <h1 className="doc-header__title">{title}</h1>
          {subtitleParts.length > 0 && (
            <p className="doc-header__subtitle">{subtitleParts.join(" · ")}</p>
          )}
          <span className="doc-header__stamp" data-testid="document-stamp">
            {stamp}
          </span>
        </header>

        {/* Document control */}
        <div className="doc-control" data-testid="document-control">
          <div className="doc-control__cell">
            <span className="doc-control__label">Reference</span>
            <span className="doc-control__value">{reference}</span>
          </div>
          {order.customOrderNumber && order.customOrderNumber !== order.orderNumber && (
            <div className="doc-control__cell">
              <span className="doc-control__label">Order no.</span>
              <span className="doc-control__value">{order.orderNumber}</span>
            </div>
          )}
          <div className="doc-control__cell">
            <span className="doc-control__label">Revision</span>
            <span className="doc-control__value">A</span>
          </div>
          <div className="doc-control__cell">
            <span className="doc-control__label">Date</span>
            <span className="doc-control__value">{orderDateStr}</span>
          </div>
          <div className="doc-control__cell">
            <span className="doc-control__label">Prepared for</span>
            <span className="doc-control__value">
              {order.customerName || order.customerCompany || "—"}
            </span>
          </div>
          <div className="doc-control__cell">
            <span className="doc-control__label">Currency</span>
            <span className="doc-control__value">{currency} · ex VAT</span>
          </div>
        </div>

        <div className="doc-body">
          {/* 1 · Customer and project */}
          <section className="doc-section" data-testid="section-customer">
            <h2 className="doc-h2">1 · Customer and project</h2>
            <div className="doc-kv">
              {order.customerName && (
                <div className="doc-kv__item">
                  <span className="doc-label">Contact</span>
                  <p className="doc-kv__value">
                    <strong>{order.customerName}</strong>
                  </p>
                </div>
              )}
              {order.customerCompany && (
                <div className="doc-kv__item">
                  <span className="doc-label">Company</span>
                  <p className="doc-kv__value">{order.customerCompany}</p>
                </div>
              )}
              {order.projectName && (
                <div className="doc-kv__item">
                  <span className="doc-label">Project</span>
                  <p className="doc-kv__value">{order.projectName}</p>
                </div>
              )}
              {order.projectLocation && (
                <div className="doc-kv__item">
                  <span className="doc-label">Site</span>
                  <p className="doc-kv__value">{order.projectLocation}</p>
                </div>
              )}
            </div>
            {order.projectDescription && (
              <>
                <hr className="doc-rule" />
                <p className="doc-p">{order.projectDescription}</p>
              </>
            )}
          </section>

          {/* 2 · Scope of supply */}
          {zones.length > 0 && (
            <section className="doc-section" data-testid="section-scope-of-supply">
              <h2 className="doc-h2">2 · Scope of supply</h2>
              {zones.map(({ zone, items }) => (
                <div key={zone}>
                  <p className="doc-table-title">{zone}</p>
                  <div className="doc-table-wrap">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th className="num">Qty</th>
                          <th className="num">Unit price</th>
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td>{item.productName || item.name}</td>
                            <td className="num">{item.quantity || 1}</td>
                            <td className="num">{formatCurrency(Number(item.unitPrice), currency)}</td>
                            <td className="num">
                              <strong>{formatCurrency(Number(item.totalPrice), currency)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* 3 · Commercial summary */}
          <section className="doc-section" data-testid="section-commercial-summary">
            <h2 className="doc-h2">3 · Commercial summary</h2>
            <table className="doc-totals">
              <tbody>
                <tr>
                  <td className="muted">Subtotal</td>
                  <td>{formatCurrency(order.subtotal, currency)}</td>
                </tr>
                {(order.deliveryCharge || 0) > 0 && (
                  <tr>
                    <td className="muted">Delivery</td>
                    <td>{formatCurrency(order.deliveryCharge, currency)}</td>
                  </tr>
                )}
                {(order.installationCharge || 0) > 0 && (
                  <tr>
                    <td className="muted">
                      Installation ({order.installationComplexity || "standard"})
                    </td>
                    <td>{formatCurrency(order.installationCharge, currency)}</td>
                  </tr>
                )}
                <tr className="grand">
                  <td>Total ex VAT</td>
                  <td>{formatCurrency(order.grandTotal, currency)}</td>
                </tr>
              </tbody>
            </table>
            {discountPct > 0 && (
              <p className="doc-small" style={{ marginTop: 10 }}>
                Reciprocal value commitments applied: {discountPct} %.
              </p>
            )}
          </section>

          {/* 4 · Approval status */}
          <section className="doc-section" data-testid="section-approval-status">
            <h2 className="doc-h2">4 · Approval status</h2>
            <div className="doc-chips">
              {APPROVAL_SECTIONS.map((s) => {
                const approved = approvals[s.key] === "approved";
                return (
                  <span
                    key={s.key}
                    className={`doc-chip ${approved ? "doc-chip--low" : "doc-chip--outline"}`}
                    data-testid={`approval-chip-${s.key}`}
                  >
                    {approved && <CheckCircle2 aria-hidden="true" />}
                    {s.label}: {approved ? "Approved" : "Pending"}
                  </span>
                );
              })}
            </div>
            <div className="doc-print-only">
              <div className="doc-signoff" style={{ marginTop: 16 }}>
                {APPROVAL_SECTIONS.map((s) => (
                  <div className="doc-signoff__box" key={s.key}>
                    <span className="doc-label">{s.label}</span>
                    <div className="doc-signoff__line">
                      {approvals[s.key] === "approved" ? "Approved" : "Name, signature and date"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 5 · Terms */}
          <section className="doc-section" data-testid="section-terms">
            <h2 className="doc-h2">5 · Terms</h2>
            <p className="doc-p">
              Prices are in {currency} and exclude VAT unless otherwise stated. Delivery and
              installation charges are calculated on the order subtotal. This order form is
              budgetary and <strong>valid for 30 days</strong> from the date of issue.
            </p>
            <p className="doc-p">
              For any questions on this quote, contact your A-SAFE representative or email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </div>

        <DocFooter
          meta={footerMeta}
          note={expiryStr ? `This link expires on ${expiryStr}.` : null}
        />
      </article>
    </div>
  );
}
