import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldQuestion,
  ExternalLink,
  Send,
  Printer,
  Download,
  Mail,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import "@/styles/document.css";

// ──────────────────────────────────────────────
// /share/project/:token — public, anonymous read-only project view.
//
// Mirrors SharedOrderView.tsx (the share-order pattern). Token-gated;
// 404 → revoked or never valid; 410 → expired. Both render the branded
// "link unavailable" document with a mailto fallback.
//
// Rendered as a consultancy document (client/src/styles/document.css):
//   - Black header band, yellow strapline logo, safety-halo motif, stamp
//   - Document-control strip (reference · revision · date · prepared by)
//   - 1  PAS 13 alignment summary (KPI tiles, aggregate verdict, vehicle
//        scenario)
//   - 2  Layout drawing(s) — read-only figures with captions
//   - 3  Barrier schedule — yellow-header tables per area with verdict chips
//   - 4  Client decision — Approve / Request changes (print: sign-off boxes)
//   - 5  Notes — indicative statement + contact
//   - Grey footer with the A-SAFE UAE office block
// "Download PDF" fetches the server-rendered budgetary proposal (Phase 3D
// PD3 route) and toasts when the route is not live yet; "Print / Save as
// PDF" uses the print stylesheet in document.css.
// ──────────────────────────────────────────────

type Verdict = "aligned" | "borderline" | "not_aligned";

interface PublicLineItem {
  productName: string;
  quantity: number;
  applicationArea: string | null;
  verdict: {
    verdict: Verdict;
    summary: string;
    details: {
      safetyMarginPct: number;
      requiredJoulesAt45deg: number;
      productRatedJoulesAt45deg: number;
      approachAngleDeg: number;
      deflectionZoneRequiredMm: number;
      deflectionZoneAvailableMm: number | null;
    };
    citations: Array<{ section: string; title: string; url?: string }>;
    warnings: string[];
    notes: string[];
    footnote: string;
  } | null;
}

interface PublicAggregate {
  verdict: Verdict | "unknown";
  worstMarginPct: number | null;
  alignedCount: number;
  borderlineCount: number;
  notAlignedCount: number;
  unknownCount: number;
}

interface PublicProject {
  isPublicView: true;
  /** Id of the order behind this project — surfaced by the public endpoint once the PD3 document routes land. */
  orderId?: string | null;
  project: {
    id: string;
    name: string;
    location: string | null;
    description: string | null;
    status: string | null;
  };
  customer: {
    id: string;
    name: string;
    logoUrl: string | null;
    city: string | null;
    country: string | null;
  } | null;
  sharedBy: { name: string };
  vehicleContext: {
    label: string;
    vehicleMassKg: number;
    loadMassKg: number;
    speedKmh: number;
    approachAngleDeg: number;
  } | null;
  layoutDrawings: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    thumbnailUrl: string | null;
    projectName: string | null;
    location: string | null;
    company: string | null;
  }>;
  lineItems: PublicLineItem[];
  aggregate: PublicAggregate;
  footnote: string;
  shareTokenExpiresAt: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; project: PublicProject }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

const LOGO_PRIMARY = "/brand/logo-strapline-primary.png";
const CONTACT_EMAIL = "quotes@asafe.ae";
const DOC_TYPE = "Project review · PAS 13 alignment summary";

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatNumber(n: number): string {
  return Number(n).toLocaleString("en-GB");
}

/** Short, stable reference derived from the project id (no DB round-trip). */
function projectReference(id: string): string {
  return `PJ-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
 * Budgetary-proposal PDF URL. The PD3 route is order-scoped
 * (`/api/orders/:id/documents/proposal.pdf`); the anonymous customer
 * proves possession of the share link with `?token=`. Until the public
 * endpoint surfaces `orderId`, fall back to the token-scoped public path.
 */
function proposalPdfUrl(orderId: string | null | undefined, token: string): string {
  const t = encodeURIComponent(token);
  return orderId
    ? `/api/orders/${encodeURIComponent(orderId)}/documents/proposal.pdf?token=${t}`
    : `/api/public/projects/${t}/documents/proposal.pdf`;
}

// Verdict chip — strict wording per σ's verdict vocab. Tones map to the
// RISK_COLOURS in worker/lib/pdf/theme.ts: aligned → teal (low),
// borderline → yellow (medium), not aligned → red (critical).
function VerdictChip({ verdict }: { verdict: Verdict | "unknown" }) {
  if (verdict === "aligned") {
    return (
      <span className="doc-chip doc-chip--low">
        <CheckCircle2 aria-hidden="true" />
        PAS 13 aligned
      </span>
    );
  }
  if (verdict === "borderline") {
    return (
      <span className="doc-chip doc-chip--medium">
        <AlertTriangle aria-hidden="true" />
        Borderline
      </span>
    );
  }
  if (verdict === "not_aligned") {
    return (
      <span className="doc-chip doc-chip--critical">
        <XCircle aria-hidden="true" />
        Not PAS 13 aligned
      </span>
    );
  }
  return (
    <span className="doc-chip doc-chip--outline">
      <ShieldQuestion aria-hidden="true" />
      Verdict pending
    </span>
  );
}

// Group line items by application area for legibility — same convention
// the order-form view uses.
function groupItemsByArea(items: PublicLineItem[]): Array<{
  area: string;
  items: PublicLineItem[];
}> {
  const buckets = new Map<string, PublicLineItem[]>();
  for (const item of items) {
    const area = item.applicationArea || "Other items";
    if (!buckets.has(area)) buckets.set(area, []);
    buckets.get(area)!.push(item);
  }
  return Array.from(buckets.entries()).map(([area, items]) => ({ area, items }));
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
            <p className="doc-header__type">Project review</p>
          </div>
          <h1 className="doc-header__title">{title}</h1>
        </header>
        <div className="doc-body">{children}</div>
        <DocFooter meta="A-SAFE Engage · Project review" />
      </article>
    </div>
  );
}

export default function SharedProjectView() {
  const [, params] = useRoute("/share/project/:token");
  const token = params?.token;
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Approval flow state
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [comments, setComments] = useState("");
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState<
    "approved" | "changes_requested" | null
  >(null);
  const [decisionRecorded, setDecisionRecorded] = useState<
    "approved" | "changes_requested" | null
  >(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "not_found" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/public/projects/${encodeURIComponent(token)}`);
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
        const json = (await res.json()) as PublicProject;
        if (!cancelled) setState({ kind: "ok", project: json });
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

  // Hooks must run unconditionally — compute the grouping before any early
  // return so the hook order is stable across load states.
  const groupedItems = useMemo(
    () => (state.kind === "ok" ? groupItemsByArea(state.project.lineItems) : []),
    [state],
  );

  const submitDecision = async (
    decision: "approved" | "changes_requested",
  ) => {
    if (!token) return;
    if (decision === "changes_requested" && !comments.trim()) {
      toast({
        title: "Please describe the changes",
        description: "Add a short note so the team knows what to update.",
        variant: "destructive",
      });
      return;
    }
    setSubmittingDecision(decision);
    try {
      const res = await fetch(`/api/public/projects/${encodeURIComponent(token)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          approverName: approverName.trim() || undefined,
          approverEmail: approverEmail.trim() || undefined,
          comments: comments.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as any).message || `HTTP ${res.status}`);
      }
      setDecisionRecorded(decision);
      toast({
        title:
          decision === "approved"
            ? "Approval sent"
            : "Change request sent",
        description:
          decision === "approved"
            ? "Thank you — the A-SAFE team has been notified."
            : "Your comments have been emailed to the A-SAFE team.",
      });
      setRequestChangesOpen(false);
    } catch (err: any) {
      toast({
        title: "Could not record your decision",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmittingDecision(null);
    }
  };

  const downloadPDF = async () => {
    if (state.kind !== "ok" || pdfBusy || !token) return;
    const data = state.project;
    const filename = `A-SAFE_Proposal_${projectReference(data.project.id)}.pdf`;
    setPdfBusy(true);
    try {
      const result = await downloadServerPdf(proposalPdfUrl(data.orderId, token), filename);
      if (result === "ok") {
        toast({ title: "PDF downloaded", description: data.project.name });
      } else {
        toast({
          title: "PDF not available yet",
          description:
            "The proposal PDF is still being prepared. Use Print / Save as PDF in the meantime.",
        });
      }
    } catch (err) {
      console.error("Public proposal download failed:", err);
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
        ? "The share link for this project is no longer valid."
        : "We couldn't find a project for this link. It may have been revoked.";
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
      <NoticeDocument title="Project review">
        <div className="doc-loading" style={{ padding: 0 }}>
          <Loader2 aria-hidden="true" />
          Loading project…
        </div>
      </NoticeDocument>
    );
  }

  // ─── OK state ──────────────────────────────────────────────────────
  const data = state.project;
  const expiryStr = formatDate(data.shareTokenExpiresAt);
  const issuedStr = formatDate(new Date()) ?? "";
  const reference = projectReference(data.project.id);
  const aggMargin =
    data.aggregate.worstMarginPct !== null
      ? `${data.aggregate.worstMarginPct.toFixed(1)} %`
      : "—";
  const clientName = data.customer?.name ?? null;
  const title = clientName || data.project.name;
  const subtitleParts = [
    clientName && data.project.name !== clientName ? data.project.name : null,
    data.project.location,
  ].filter(Boolean) as string[];
  const stamp =
    decisionRecorded === "approved"
      ? "Approved by client"
      : decisionRecorded === "changes_requested"
        ? "Changes requested"
        : "Issued for review";
  const footerMeta = `${reference} · Rev A · ${issuedStr}`;

  let figureIndex = 0;

  return (
    <div className="document-host">
      <div className="document-toolbar doc-no-print">
        <button
          type="button"
          className="doc-btn doc-btn--secondary"
          onClick={() => window.print()}
          data-testid="button-print-project"
        >
          <Printer aria-hidden="true" />
          Print / Save as PDF
        </button>
        <button
          type="button"
          className="doc-btn"
          onClick={downloadPDF}
          disabled={pdfBusy}
          data-testid="button-public-download-proposal"
        >
          {pdfBusy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {pdfBusy ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <article className="document-shell" data-testid="shared-project-document">
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
          <div className="doc-control__cell">
            <span className="doc-control__label">Revision</span>
            <span className="doc-control__value">A</span>
          </div>
          <div className="doc-control__cell">
            <span className="doc-control__label">Issued</span>
            <span className="doc-control__value">{issuedStr}</span>
          </div>
          <div className="doc-control__cell">
            <span className="doc-control__label">Prepared by</span>
            <span className="doc-control__value">{data.sharedBy.name}</span>
          </div>
          {clientName && (
            <div className="doc-control__cell">
              <span className="doc-control__label">Client</span>
              <span className="doc-control__value">{clientName}</span>
            </div>
          )}
        </div>

        <div className="doc-body">
          {/* 1 · Alignment summary */}
          <section className="doc-section" data-testid="section-alignment-summary">
            <h2 className="doc-h2">1 · PAS 13 alignment summary</h2>
            <p className="doc-p doc-section__lead">
              The barrier schedule for <strong>{data.project.name}</strong> has been assessed
              against PAS 13:2017 using the vehicle scenario supplied. Each line carries a
              verdict, the safety margin against the required impact energy, and the clauses
              relied on.
            </p>
            {data.project.description && (
              <p className="doc-p">{data.project.description}</p>
            )}

            <div className="doc-kpis">
              <div className="doc-kpi doc-kpi--low">
                <span className="doc-kpi__value">{data.aggregate.alignedCount}</span>
                <span className="doc-kpi__sub">PAS 13 aligned</span>
              </div>
              <div className="doc-kpi doc-kpi--medium">
                <span className="doc-kpi__value">{data.aggregate.borderlineCount}</span>
                <span className="doc-kpi__sub">Borderline</span>
              </div>
              <div className="doc-kpi doc-kpi--critical">
                <span className="doc-kpi__value">{data.aggregate.notAlignedCount}</span>
                <span className="doc-kpi__sub">Not aligned</span>
              </div>
              <div className="doc-kpi doc-kpi--black">
                <span className="doc-kpi__value">{aggMargin}</span>
                <span className="doc-kpi__sub">Worst-case safety margin</span>
              </div>
            </div>

            <div className="doc-chips" style={{ marginBottom: 14 }}>
              <span className="doc-label" style={{ margin: 0 }}>
                Aggregate verdict
              </span>
              <VerdictChip verdict={data.aggregate.verdict} />
              {data.aggregate.unknownCount > 0 && (
                <span className="doc-small">{data.aggregate.unknownCount} pending</span>
              )}
            </div>

            {data.vehicleContext && (
              <div className="doc-callout doc-callout--yellow">
                <p className="doc-callout__title">Vehicle scenario</p>
                <p className="doc-p">
                  <strong>{data.vehicleContext.label}</strong> —{" "}
                  {formatNumber(data.vehicleContext.vehicleMassKg)} kg vehicle,{" "}
                  {formatNumber(data.vehicleContext.loadMassKg)} kg load,{" "}
                  {data.vehicleContext.speedKmh} km/h, {data.vehicleContext.approachAngleDeg}°
                  approach. All verdicts are computed against this worst-case impact.
                </p>
              </div>
            )}

            <p className="doc-small">{data.footnote}</p>
          </section>

          {/* 2 · Layout drawings */}
          {data.layoutDrawings.length > 0 && (
            <section className="doc-section" data-testid="section-layout-drawing">
              <h2 className="doc-h2">2 · Layout drawing</h2>
              {data.layoutDrawings.map((d) => {
                figureIndex += 1;
                const caption = `Fig 2.${figureIndex} — ${d.fileName}${d.location ? `, ${d.location}` : ""}`;
                return (
                  <figure key={d.id} className="doc-figure" data-testid={`layout-drawing-${d.id}`}>
                    <div className="doc-figure__frame">
                      {d.fileType === "image" ? (
                        <img
                          src={d.fileUrl}
                          alt={d.fileName}
                          style={{ pointerEvents: "none" }}
                        />
                      ) : d.thumbnailUrl ? (
                        <img
                          src={d.thumbnailUrl}
                          alt={d.fileName}
                          style={{ pointerEvents: "none" }}
                        />
                      ) : (
                        <p className="doc-small" style={{ padding: 32 }}>
                          Drawing supplied as {d.fileType.toUpperCase()} — open the file to view.
                        </p>
                      )}
                    </div>
                    <figcaption className="doc-figure__caption">
                      <strong>{caption}</strong>
                      {d.fileType !== "image" && (
                        <>
                          {" · "}
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="doc-no-print"
                          >
                            <ExternalLink
                              aria-hidden="true"
                              style={{ width: 12, height: 12, verticalAlign: "-1px" }}
                            />{" "}
                            Open {d.fileName}
                          </a>
                        </>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
              <p className="doc-small">
                Read-only preview. Drawings are not to scale unless stated; drawing tools
                are disabled in the shared view.
              </p>
            </section>
          )}

          {/* 3 · Barrier schedule */}
          {data.lineItems.length > 0 && (
            <section className="doc-section" data-testid="section-barrier-schedule">
              <h2 className="doc-h2">3 · Barrier schedule</h2>
              {groupedItems.map(({ area, items }) => (
                <div key={area}>
                  <p className="doc-table-title">{area}</p>
                  <div className="doc-table-wrap">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th className="num">Qty</th>
                          <th>PAS 13 verdict</th>
                          <th className="num">Safety margin</th>
                          <th>Cited clauses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const v = item.verdict;
                          const sections =
                            v?.citations
                              ?.map((c) => `§${c.section}`)
                              .join(", ") || "—";
                          const margin =
                            v?.details?.safetyMarginPct !== undefined
                              ? `${v.details.safetyMarginPct.toFixed(1)} %`
                              : "—";
                          return (
                            <tr key={idx}>
                              <td>{item.productName}</td>
                              <td className="num">{item.quantity}</td>
                              <td>
                                <VerdictChip
                                  verdict={(v?.verdict ?? "unknown") as Verdict | "unknown"}
                                />
                              </td>
                              <td className="num">{margin}</td>
                              <td className="muted">{sections}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <p className="doc-small">{data.footnote}</p>
            </section>
          )}

          {/* 4 · Client decision */}
          <section className="doc-section" data-testid="section-decision">
            <h2 className="doc-h2">4 · Client decision</h2>
            {decisionRecorded ? (
              <div
                className={`doc-callout ${decisionRecorded === "approved" ? "doc-callout--teal" : "doc-callout--yellow"}`}
                data-testid="decision-recorded"
              >
                <p className="doc-callout__title">
                  {decisionRecorded === "approved" ? "Approval recorded" : "Change request recorded"}
                </p>
                <p className="doc-p">
                  <CheckCircle2
                    aria-hidden="true"
                    style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 6 }}
                  />
                  {decisionRecorded === "approved"
                    ? "Thank you — your approval has been sent to the A-SAFE team."
                    : "Thanks — your change request has been sent to the A-SAFE team."}
                </p>
              </div>
            ) : (
              <div className="doc-no-print">
                <p className="doc-p doc-section__lead">
                  Review the layout, barrier schedule and PAS 13 alignment summary above.
                  When you are ready, <strong>approve the design or request changes</strong>.
                </p>
                {/* Optional name + email so the rep knows who reviewed it */}
                <div className="doc-form">
                  <div className="doc-field">
                    <label htmlFor="approver-name">
                      Your name <span className="optional">(optional)</span>
                    </label>
                    <input
                      id="approver-name"
                      className="doc-input"
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                      placeholder="Jane Doe"
                      autoComplete="name"
                      data-testid="input-approver-name"
                    />
                  </div>
                  <div className="doc-field">
                    <label htmlFor="approver-email">
                      Your email <span className="optional">(optional)</span>
                    </label>
                    <input
                      id="approver-email"
                      className="doc-input"
                      type="email"
                      value={approverEmail}
                      onChange={(e) => setApproverEmail(e.target.value)}
                      placeholder="jane@example.com"
                      autoComplete="email"
                      data-testid="input-approver-email"
                    />
                  </div>
                  {requestChangesOpen && (
                    <div className="doc-field span-2">
                      <label htmlFor="comments">What needs to change?</label>
                      <textarea
                        id="comments"
                        className="doc-textarea"
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Describe the changes you'd like the team to make…"
                        rows={4}
                        data-testid="textarea-comments"
                      />
                    </div>
                  )}
                </div>
                <div className="doc-actions">
                  <button
                    type="button"
                    className="doc-btn"
                    onClick={() => submitDecision("approved")}
                    disabled={submittingDecision !== null}
                    data-testid="button-approve"
                  >
                    {submittingDecision === "approved" ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" />
                    )}
                    Approve
                  </button>
                  {!requestChangesOpen ? (
                    <button
                      type="button"
                      className="doc-btn doc-btn--secondary"
                      onClick={() => setRequestChangesOpen(true)}
                      disabled={submittingDecision !== null}
                      data-testid="button-request-changes-open"
                    >
                      <AlertTriangle aria-hidden="true" />
                      Request changes
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="doc-btn doc-btn--secondary"
                      onClick={() => submitDecision("changes_requested")}
                      disabled={submittingDecision !== null}
                      data-testid="button-request-changes-submit"
                    >
                      {submittingDecision === "changes_requested" ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Send aria-hidden="true" />
                      )}
                      Send change request
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Printed copy: physical sign-off in place of the on-screen form. */}
            {!decisionRecorded && (
              <div className="doc-print-only">
                <p className="doc-p doc-section__lead">
                  Client acceptance of the layout and barrier schedule above.
                </p>
                <div className="doc-signoff">
                  <div className="doc-signoff__box">
                    <span className="doc-label">Reviewed by</span>
                    <div className="doc-signoff__line">Name and signature</div>
                  </div>
                  <div className="doc-signoff__box">
                    <span className="doc-label">Position</span>
                    <div className="doc-signoff__line">Job title</div>
                  </div>
                  <div className="doc-signoff__box">
                    <span className="doc-label">Date</span>
                    <div className="doc-signoff__line">DD / MM / YYYY</div>
                  </div>
                </div>
              </div>
            )}
            <hr className="doc-rule" />
            <p className="doc-small">{data.footnote}</p>
          </section>

          {/* 5 · Notes */}
          <section className="doc-section" data-testid="section-notes">
            <h2 className="doc-h2">5 · Notes</h2>
            <p className="doc-p">
              The PAS 13 alignment verdicts shown here are computed against the supplied
              vehicle scenario and the published barrier ratings. They are{" "}
              <strong>indicative</strong> — verify with A-SAFE engineering for procurement.
            </p>
            <p className="doc-p">
              For any questions on this project, contact your A-SAFE representative or email{" "}
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
