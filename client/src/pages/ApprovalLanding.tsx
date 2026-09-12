import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  ShieldCheck,
  Loader2,
  Download,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import "@/styles/document.css";

/**
 * External-approver landing page.
 *
 * This route is reached via a single-use magic-link email and MUST work with
 * zero in-app auth. We deliberately avoid useAuth() and the app's TanStack
 * Query default queryFn — both would trigger the global 401 redirect in
 * queryClient.ts and bounce an external approver back to the marketing site.
 * All network calls use raw fetch with `credentials: "omit"` so no session
 * cookie is ever sent and the backend treats us as fully anonymous.
 *
 * Rendered as a consultancy document (client/src/styles/document.css):
 *   - Black header band, yellow strapline logo, safety-halo motif, stamp
 *     (Awaiting sign-off / Approved / Rejected)
 *   - Document-control strip (order · section · sent to · valid until)
 *   - 1  Your details (name, job title, mobile, comments)
 *   - 2  Next step (route to another approver or self-approve the next
 *        section)
 *   - Approve / Reject actions; reject confirms in a dialog
 *   - Grey footer with the A-SAFE UAE office block
 */

type Section = "technical" | "commercial" | "marketing";

interface TokenInfo {
  valid: boolean;
  reason?: string;
  orderId?: string;
  orderNumber?: string;
  customOrderNumber?: string | null;
  section?: Section;
  /** Masked recipient address the email was sent to (e.g. b***@dnata.ae). */
  expectedEmailMasked?: string;
  /** Older field name for the masked address — kept so both shapes render. */
  expectedEmail?: string;
  expiresAt?: string;
  /** Optional fields the backend may surface for richer UI. */
  clientName?: string;
  customerCompany?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "ready"; token: TokenInfo };

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "rejected" }
  | {
      kind: "approved";
      // What to render on the success screen. `redirectToken` means the
      // server has minted a fresh token for the next section and we should
      // hop the user straight into it (self-approve-next flow).
      redirectToken?: string;
      nextEmail?: string;
      wasMarketing?: boolean;
    };

type Outcome = "approved" | "rejected" | null;

const SECTION_LABEL: Record<Section, string> = {
  technical: "Technical sign-off",
  commercial: "Commercial sign-off",
  marketing: "Marketing sign-off",
};

const NEXT_SECTION: Record<Section, Section | null> = {
  technical: "commercial",
  commercial: "marketing",
  marketing: null,
};

const LOGO_PRIMARY = "/brand/logo-strapline-primary.png";
const SALES_EMAIL = "sales@asafe.ae";

// Simple RFC-5322-lite check. We intentionally avoid a big regex here: the
// backend is the source of truth for deliverability; this is just to stop
// obvious typos before we POST.
function isLikelyEmail(v: string): boolean {
  const s = v.trim();
  if (s.length < 5 || s.length > 254) return false;
  const at = s.indexOf("@");
  if (at < 1 || at === s.length - 1) return false;
  const dot = s.lastIndexOf(".");
  return dot > at + 1 && dot < s.length - 1;
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type PdfResult = "ok" | "not_available";

/**
 * Fetch a server-rendered document (Phase 3D PD3 route) and hand it to the
 * browser as a download. Resolves "not_available" on 404 — the renderer is
 * still being rolled out — so the caller can point the approver at
 * Print / Save as PDF instead. Any other failure throws. `credentials:
 * "omit"` keeps this page fully anonymous (see the header comment).
 */
async function downloadServerPdf(url: string, filename: string): Promise<PdfResult> {
  const res = await fetch(url, { credentials: "omit", headers: { Accept: "application/pdf" } });
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
 * (`/api/orders/:id/documents/order-form.pdf`); the approver proves
 * possession of the magic link with `?token=` since this page never sends
 * a session cookie.
 */
function orderFormPdfUrl(orderId: string, token: string): string {
  return `/api/orders/${encodeURIComponent(orderId)}/documents/order-form.pdf?token=${encodeURIComponent(token)}`;
}

function DocFooter({ meta }: { meta: string }) {
  return (
    <footer className="doc-footer">
      <div className="doc-footer__brand">
        <span className="doc-footer__halo" aria-hidden="true" />
        <p className="doc-footer__office">
          <strong>A-SAFE UAE</strong> · Office 220, Building A5, Dubai South Business Park
          <br />
          Tel: +971 (4) 8842 422 · <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> ·
          www.asafe.com
        </p>
      </div>
      <p className="doc-footer__meta">{meta}</p>
    </footer>
  );
}

export default function ApprovalLanding() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Lifted so the header stamp can reflect the decision the body records.
  const [outcome, setOutcome] = useState<Outcome>(null);

  // Validate the token once on mount. We re-run the effect only when the
  // token in the URL actually changes (the self-approve-next flow replaces
  // history to /approve/<new-token> which triggers this via useParams).
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "error", reason: "Missing approval token in URL." });
      return;
    }
    setState({ kind: "loading" });
    setOutcome(null);
    fetch(`/api/approval-tokens/${encodeURIComponent(token)}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        // Even on 4xx the backend returns JSON with a `reason`, so we try
        // to parse before falling back to a generic message. The response
        // shape is checked at runtime below — cast to a narrow type for
        // ergonomic property access.
        const body = (await res
          .json()
          .catch(() => ({ valid: false, reason: "Unable to validate link." }))) as
          | TokenInfo
          | { valid: false; reason?: string };
        if (cancelled) return;
        if (!res.ok || !body || (body as TokenInfo).valid === false) {
          setState({
            kind: "error",
            reason:
              (body as { reason?: string })?.reason ||
              "This approval link is no longer valid.",
          });
          return;
        }
        setState({ kind: "ready", token: body as TokenInfo });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          kind: "error",
          reason:
            "We couldn't reach the approval service. Please try again shortly.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const info = state.kind === "ready" ? state.token : null;
  const section = (info?.section ?? "technical") as Section;
  const orderLabel = info?.customOrderNumber || info?.orderNumber || info?.orderId || null;
  const client = info?.clientName || info?.customerCompany || null;
  const sentTo = info?.expectedEmailMasked || info?.expectedEmail || null;
  const expiresLabel = formatDate(info?.expiresAt);

  const stamp =
    outcome === "approved"
      ? "Approved"
      : outcome === "rejected"
        ? "Rejected"
        : state.kind === "error"
          ? "Link unavailable"
          : "Awaiting sign-off";
  const stampClass =
    outcome === "rejected" || state.kind === "error"
      ? "doc-header__stamp doc-header__stamp--white"
      : "doc-header__stamp";

  const footerMeta = orderLabel
    ? `Order ${orderLabel} · ${SECTION_LABEL[section]}`
    : "A-SAFE Engage · Order approval";

  return (
    <div className="document-host">
      <div className="document-toolbar doc-no-print">
        <span
          className="doc-chip doc-chip--black"
          style={{ height: 44, padding: "0 14px" }}
          title="Single-use secure approval link"
        >
          <ShieldCheck aria-hidden="true" /> Secure link
        </span>
        <button
          type="button"
          className="doc-btn doc-btn--secondary"
          onClick={() => window.print()}
          data-testid="button-print-approval"
        >
          <Printer aria-hidden="true" />
          Print / Save as PDF
        </button>
      </div>

      <article className="document-shell" data-testid="approval-document">
        {/* Header band */}
        <header className="doc-header">
          <div className="doc-header__top">
            <img className="doc-header__logo" src={LOGO_PRIMARY} alt="A-SAFE" />
            <p className="doc-header__type">
              Order approval · {info ? SECTION_LABEL[section] : "Sign-off"}
            </p>
          </div>
          <h1 className="doc-header__title">
            {orderLabel ? `Order ${orderLabel}` : "Order approval"}
          </h1>
          {client && <p className="doc-header__subtitle">{client}</p>}
          <span className={stampClass} data-testid="document-stamp">
            {stamp}
          </span>
        </header>

        {/* Document control */}
        {info && (
          <div className="doc-control" data-testid="document-control">
            <div className="doc-control__cell">
              <span className="doc-control__label">Reference</span>
              <span className="doc-control__value">{orderLabel || "—"}</span>
            </div>
            <div className="doc-control__cell">
              <span className="doc-control__label">Section</span>
              <span className="doc-control__value">{SECTION_LABEL[section]}</span>
            </div>
            {client && (
              <div className="doc-control__cell">
                <span className="doc-control__label">Client</span>
                <span className="doc-control__value">{client}</span>
              </div>
            )}
            {sentTo && (
              <div className="doc-control__cell">
                <span className="doc-control__label">Sent to</span>
                <span className="doc-control__value">{sentTo}</span>
              </div>
            )}
            {expiresLabel && (
              <div className="doc-control__cell">
                <span className="doc-control__label">Link valid until</span>
                <span className="doc-control__value">{expiresLabel}</span>
              </div>
            )}
          </div>
        )}

        <div className="doc-body">
          {state.kind === "loading" && <LoadingPanel />}
          {state.kind === "error" && <InvalidPanel reason={state.reason} />}
          {state.kind === "ready" && (
            <ApprovalBody
              token={token!}
              info={state.token}
              onOutcome={setOutcome}
            />
          )}
        </div>

        <DocFooter meta={footerMeta} />
      </article>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="doc-loading" style={{ padding: "24px 0" }}>
      <Loader2 aria-hidden="true" />
      <span>Validating approval link…</span>
    </div>
  );
}

function InvalidPanel({ reason }: { reason: string }) {
  return (
    <section className="doc-section">
      <div className="doc-callout doc-callout--red">
        <p className="doc-callout__title">
          <AlertCircle
            aria-hidden="true"
            style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }}
          />
          Approval link unavailable
        </p>
        <p className="doc-p">{reason}</p>
      </div>
      <p className="doc-p">
        Please contact your A-SAFE sales representative to have a new link issued.
      </p>
      <div className="doc-actions">
        <a href={`mailto:${SALES_EMAIL}`} className="doc-btn doc-btn--secondary">
          <Mail aria-hidden="true" /> {SALES_EMAIL}
        </a>
      </div>
    </section>
  );
}

/**
 * The actual approve/reject form. Split out so the "ready" branch above has
 * a stable, non-optional `info` object and we don't have to thread nullable
 * fields through every helper.
 */
function ApprovalBody({
  token,
  info,
  onOutcome,
}: {
  token: string;
  info: TokenInfo;
  onOutcome: (o: Outcome) => void;
}) {
  const section = (info.section ?? "technical") as Section;
  const nextSection = NEXT_SECTION[section];
  // The app's <Toaster /> is mounted at the App root, above the auth gate,
  // so it is available on this anonymous route.
  const { toast } = useToast();

  // Approval-form state. We keep all of it in the component — a dedicated
  // form lib would be overkill for six fields and would pull our bundle
  // deeper without adding validation we don't already do inline.
  const [signedBy, setSignedBy] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [mobile, setMobile] = useState("");
  const [comments, setComments] = useState("");

  // Next-approver routing choice. "self" = I'll do the next section now,
  // "other" = send a magic link to someone else. Defaulting to "other" keeps
  // the safer path the default — most approvers do NOT have authority for
  // the downstream step.
  const [routing, setRouting] = useState<"other" | "self">("other");
  const [nextEmail, setNextEmail] = useState("");
  const [nextName, setNextName] = useState("");

  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const canApprove = useMemo(() => {
    if (!signedBy.trim() || !jobTitle.trim()) return false;
    if (nextSection) {
      if (routing === "other" && !isLikelyEmail(nextEmail)) return false;
    }
    return true;
  }, [signedBy, jobTitle, nextSection, routing, nextEmail]);

  async function submitApprove() {
    if (!canApprove) return;
    setSubmit({ kind: "submitting" });
    try {
      const body: Record<string, unknown> = {
        action: "approve",
        signedBy: signedBy.trim(),
        jobTitle: jobTitle.trim(),
      };
      if (mobile.trim()) body.mobile = mobile.trim();
      if (comments.trim()) body.comments = comments.trim();
      if (nextSection) {
        if (routing === "self") {
          body.selfApproveNext = true;
        } else {
          body.nextApproverEmail = nextEmail.trim();
          if (nextName.trim()) body.nextApproverName = nextName.trim();
        }
      }

      const res = await fetch(
        `/api/approval-tokens/${encodeURIComponent(token)}/consume`,
        {
          method: "POST",
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        throw new Error(
          (data as { error?: string; reason?: string })?.error ||
            (data as { reason?: string })?.reason ||
            "Approval failed. Please try again.",
        );
      }

      // Server returns { nextToken } when selfApproveNext=true so we can
      // navigate the same user straight into the next section without
      // waiting for an email round-trip. We rewrite history so the Back
      // button lands on a sane place (the landing URL for the next token).
      const redirectToken = (data as { nextToken?: string })?.nextToken;
      if (redirectToken) {
        window.history.replaceState(
          {},
          "",
          `/approve/${encodeURIComponent(redirectToken)}`,
        );
        // Reload-the-route effect: changing useParams isn't triggered by
        // replaceState, so we reset local state by dispatching a manual
        // location change. Simpler to just reload.
        window.location.assign(`/approve/${encodeURIComponent(redirectToken)}`);
        return;
      }

      setSubmit({
        kind: "approved",
        nextEmail: routing === "other" ? nextEmail.trim() : undefined,
        wasMarketing: section === "marketing",
      });
      onOutcome("approved");
    } catch (err: unknown) {
      setSubmit({ kind: "idle" });
      toast({
        title: "Approval failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function submitReject() {
    if (!rejectReason.trim()) return;
    setSubmit({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/approval-tokens/${encodeURIComponent(token)}/consume`,
        {
          method: "POST",
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "reject",
            signedBy: signedBy.trim() || "External approver",
            jobTitle: jobTitle.trim() || "External approver",
            rejectReason: rejectReason.trim(),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        throw new Error(
          (data as { error?: string })?.error || "Rejection failed.",
        );
      }
      setShowReject(false);
      setSubmit({ kind: "rejected" });
      onOutcome("rejected");
    } catch (err: unknown) {
      setSubmit({ kind: "idle" });
      toast({
        title: "Rejection failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  if (submit.kind === "approved") {
    return <ApprovedPanel state={submit} orderId={info.orderId} token={token} />;
  }
  if (submit.kind === "rejected") {
    return <RejectedPanel />;
  }

  const submitting = submit.kind === "submitting";

  return (
    <>
      <p className="doc-p doc-section__lead" style={{ marginBottom: 28 }}>
        A-SAFE has prepared order{" "}
        <strong>{info.customOrderNumber || info.orderNumber || info.orderId}</strong>
        {info.clientName || info.customerCompany ? (
          <>
            {" "}
            for <strong>{info.clientName || info.customerCompany}</strong>
          </>
        ) : null}{" "}
        and is requesting your <strong>{SECTION_LABEL[section].toLowerCase()}</strong>.
        Complete your details below, then approve or reject the order.
      </p>

      {/* 1 · Your details */}
      <section className="doc-section" data-testid="section-your-details">
        <h2 className="doc-h2">1 · Your details</h2>
        <div className="doc-form">
          <div className="doc-field">
            <label htmlFor="ap-signed-by">Full name</label>
            <input
              id="ap-signed-by"
              className="doc-input"
              value={signedBy}
              onChange={(e) => setSignedBy(e.target.value)}
              autoComplete="name"
              placeholder="Jane Smith"
            />
          </div>
          <div className="doc-field">
            <label htmlFor="ap-job-title">Job title</label>
            <input
              id="ap-job-title"
              className="doc-input"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              autoComplete="organization-title"
              placeholder="Operations Director"
            />
          </div>
          <div className="doc-field span-2">
            <label htmlFor="ap-mobile">
              Mobile <span className="optional">(optional)</span>
            </label>
            <input
              id="ap-mobile"
              className="doc-input"
              type="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
              placeholder="+971 50 123 4567"
            />
          </div>
          <div className="doc-field span-2">
            <label htmlFor="ap-comments">
              Comments <span className="optional">(optional)</span>
            </label>
            <textarea
              id="ap-comments"
              className="doc-textarea"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="Anything the next approver or A-SAFE should know."
            />
          </div>
        </div>
      </section>

      {/* 2 · Next step */}
      {nextSection && (
        <section className="doc-section" data-testid="section-next-step">
          <h2 className="doc-h2">2 · Next step: {SECTION_LABEL[nextSection]}</h2>
          <div role="radiogroup" aria-label="Next approver">
            <label
              htmlFor="ap-route-other"
              className={`doc-option${routing === "other" ? " doc-option--selected" : ""}`}
            >
              <input
                type="radio"
                id="ap-route-other"
                name="ap-routing"
                value="other"
                checked={routing === "other"}
                onChange={() => setRouting("other")}
              />
              <span>
                <p className="doc-option__title">Send to a different person</p>
                <p className="doc-option__hint">
                  We&apos;ll email them a secure approval link after you approve.
                </p>
              </span>
            </label>
            <label
              htmlFor="ap-route-self"
              className={`doc-option${routing === "self" ? " doc-option--selected" : ""}`}
            >
              <input
                type="radio"
                id="ap-route-self"
                name="ap-routing"
                value="self"
                checked={routing === "self"}
                onChange={() => setRouting("self")}
              />
              <span>
                <p className="doc-option__title">
                  I have authority for {SECTION_LABEL[nextSection]} too
                </p>
                <p className="doc-option__hint">
                  You&apos;ll be taken straight to the next section after approving.
                </p>
              </span>
            </label>
          </div>

          {routing === "other" && (
            <div className="doc-form" style={{ marginTop: 14 }}>
              <div className="doc-field span-2">
                <label htmlFor="ap-next-email">Email</label>
                <input
                  id="ap-next-email"
                  className="doc-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={nextEmail}
                  onChange={(e) => setNextEmail(e.target.value)}
                  placeholder="name@company.com"
                />
                {nextEmail && !isLikelyEmail(nextEmail) && (
                  <p className="doc-field__error">Please enter a valid email address.</p>
                )}
              </div>
              <div className="doc-field span-2">
                <label htmlFor="ap-next-name">
                  Name <span className="optional">(optional)</span>
                </label>
                <input
                  id="ap-next-name"
                  className="doc-input"
                  value={nextName}
                  onChange={(e) => setNextName(e.target.value)}
                  placeholder="Helps personalise the email"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Decision */}
      <section className="doc-section doc-no-print" data-testid="section-decision">
        <h2 className="doc-h2">{nextSection ? "3" : "2"} · Your decision</h2>
        <div className="doc-actions" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="doc-btn doc-btn--grow"
            onClick={submitApprove}
            disabled={!canApprove || submitting}
            data-testid="button-approve"
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" /> Approve
              </>
            )}
          </button>
          <button
            type="button"
            className="doc-btn doc-btn--danger doc-btn--grow"
            onClick={() => setShowReject(true)}
            disabled={submitting}
            data-testid="button-reject"
          >
            Reject
          </button>
        </div>
        {!canApprove && (
          <p className="doc-small" style={{ marginTop: 10 }}>
            Enter your full name and job title
            {nextSection && routing === "other" ? " and the next approver's email" : ""} to
            enable Approve.
          </p>
        )}
      </section>

      {/* Printed copy: physical sign-off in place of the on-screen buttons. */}
      <section className="doc-section doc-print-only">
        <h2 className="doc-h2">{SECTION_LABEL[section]}</h2>
        <div className="doc-signoff">
          <div className="doc-signoff__box">
            <span className="doc-label">Approved by</span>
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
      </section>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your reason will be shared with the A-SAFE sales team and every
              previous approver so they can address it.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ap-reject-reason">Reason</Label>
              <Textarea
                id="ap-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                className="resize-none"
                placeholder="What needs to change before this order can proceed?"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowReject(false)}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReject}
              disabled={!rejectReason.trim() || submit.kind === "submitting"}
              className="h-11"
            >
              {submit.kind === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                </>
              ) : (
                "Confirm rejection"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovedPanel({
  state,
  orderId,
  token,
}: {
  state: Extract<SubmitState, { kind: "approved" }>;
  orderId?: string;
  token?: string;
}) {
  // PDF: the server-rendered order form (Phase 3D PD3 route). The signed
  // copy the approver downloads is byte-identical to the rep's.
  const { toast } = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    if (!token || !orderId || pdfBusy) return;
    setPdfBusy(true);
    try {
      const result = await downloadServerPdf(
        orderFormPdfUrl(orderId, token),
        `A-SAFE_Order_${orderId}.pdf`,
      );
      if (result === "ok") {
        toast({ title: "PDF downloaded" });
      } else {
        toast({
          title: "PDF not available yet",
          description:
            "The signed order form is still being prepared. Use Print / Save as PDF in the meantime.",
        });
      }
    } catch (e) {
      console.error("PDF download failed", e);
      toast({
        title: "Could not download PDF",
        description: `${e instanceof Error ? e.message : "Please try again"}. If this persists, contact ${SALES_EMAIL}.`,
        variant: "destructive",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  if (state.wasMarketing) {
    return (
      <section className="doc-section" data-testid="panel-fully-approved">
        <div className="doc-callout doc-callout--teal">
          <p className="doc-callout__title">
            <CheckCircle2
              aria-hidden="true"
              style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }}
            />
            Order fully approved
          </p>
          <p className="doc-p">
            Thank you. All three approvals are complete and A-SAFE will now process this
            order.
          </p>
        </div>
        {orderId && token && (
          <div className="doc-actions doc-no-print">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="doc-btn"
              data-testid="download-signed-order-pdf"
            >
              {pdfBusy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {pdfBusy ? "Generating PDF…" : "Download signed order (PDF)"}
            </button>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="doc-section" data-testid="panel-approved">
      <div className="doc-callout doc-callout--teal">
        <p className="doc-callout__title">
          <CheckCircle2
            aria-hidden="true"
            style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }}
          />
          Approval recorded
        </p>
        {state.nextEmail ? (
          <p className="doc-p">
            Thanks. We&apos;ve emailed <strong>{state.nextEmail}</strong> — they will complete
            the next step.
          </p>
        ) : (
          <p className="doc-p">Thanks — the next approver has been notified.</p>
        )}
      </div>
      <p className="doc-small">You can safely close this window.</p>
    </section>
  );
}

function RejectedPanel() {
  return (
    <section className="doc-section" data-testid="panel-rejected">
      <div className="doc-callout doc-callout--red">
        <p className="doc-callout__title">
          <AlertCircle
            aria-hidden="true"
            style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }}
          />
          Rejection recorded
        </p>
        <p className="doc-p">
          We&apos;ve recorded your rejection and notified the A-SAFE sales team along with
          previous approvers.
        </p>
      </div>
      <p className="doc-small">You can safely close this window.</p>
    </section>
  );
}
