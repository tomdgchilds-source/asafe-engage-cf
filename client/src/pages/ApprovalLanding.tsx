import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Mail,
  ShieldCheck,
  Loader2,
  Download,
} from "lucide-react";

/**
 * External-approver landing page.
 *
 * This route is reached via a single-use magic-link email and MUST work with
 * zero in-app auth. We deliberately avoid useAuth() and the app's TanStack
 * Query default queryFn — both would trigger the global 401 redirect in
 * queryClient.ts and bounce an external approver back to the marketing site.
 * All network calls use raw fetch with `credentials: "omit"` so no session
 * cookie is ever sent and the backend treats us as fully anonymous.
 */

type Section = "technical" | "commercial" | "marketing";

interface TokenInfo {
  valid: boolean;
  reason?: string;
  orderId?: string;
  orderNumber?: string;
  section?: Section;
  /** Masked recipient address the email was sent to (e.g. b***@dnata.ae). */
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

export default function ApprovalLanding() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="border-b bg-white dark:bg-gray-950">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/asafe-logo.jpeg"
              alt="A-SAFE"
              className="h-8 w-auto"
            />
            <div>
              <p className="text-sm font-semibold leading-tight">A-SAFE Engage</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Order approval requested
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            <ShieldCheck className="mr-1 h-3 w-3" /> Secure link
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        {state.kind === "loading" && <LoadingPanel />}
        {state.kind === "error" && <InvalidPanel reason={state.reason} />}
        {state.kind === "ready" && (
          <ApprovalBody token={token!} info={state.token} />
        )}
      </main>
    </div>
  );
}

function LoadingPanel() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-3 py-16 text-gray-600 dark:text-gray-300">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Validating approval link…</span>
      </CardContent>
    </Card>
  );
}

function InvalidPanel({ reason }: { reason: string }) {
  return (
    <Card className="border-red-200 dark:border-red-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5" /> Approval link unavailable
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-gray-700 dark:text-gray-300">{reason}</p>
        <Separator />
        <p className="text-gray-600 dark:text-gray-400">
          Please contact your A-SAFE sales representative to have a new link
          issued.
        </p>
        <a
          href="mailto:sales@asafe.ae"
          className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Mail className="h-4 w-4" /> sales@asafe.ae
        </a>
      </CardContent>
    </Card>
  );
}

/**
 * The actual approve/reject form. Split out so the "ready" branch above has
 * a stable, non-optional `info` object and we don't have to thread nullable
 * fields through every helper.
 */
function ApprovalBody({ token, info }: { token: string; info: TokenInfo }) {
  const section = (info.section ?? "technical") as Section;
  const nextSection = NEXT_SECTION[section];

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
    } catch (err: unknown) {
      setSubmit({ kind: "idle" });
      // Surface the error inline via a soft toast-equivalent; we can't use
      // the app's Toaster here because it's outside the <Toaster/> root for
      // this route (and we don't want to pull the auth-aware layout).
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : "Approval failed.");
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
    } catch (err: unknown) {
      setSubmit({ kind: "idle" });
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : "Rejection failed.");
    }
  }

  if (submit.kind === "approved") {
    return <ApprovedPanel state={submit} orderId={info.orderId} token={token} />;
  }
  if (submit.kind === "rejected") {
    return <RejectedPanel />;
  }

  const expiresLabel = info.expiresAt
    ? new Date(info.expiresAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Order {info.orderNumber || info.orderId}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Labeled label="Section">
            <span className="font-medium">{SECTION_LABEL[section]}</span>
          </Labeled>
          {(info.clientName || info.customerCompany) && (
            <Labeled label="Client">
              {info.clientName || info.customerCompany}
            </Labeled>
          )}
          {info.expectedEmail && (
            <Labeled label="Sent to">{info.expectedEmail}</Labeled>
          )}
          {expiresLabel && (
            <Labeled label="Link valid until">{expiresLabel}</Labeled>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-signed-by">Full name</Label>
              <Input
                id="ap-signed-by"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                autoComplete="name"
                className="h-11"
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-job-title">Job title</Label>
              <Input
                id="ap-job-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                autoComplete="organization-title"
                className="h-11"
                placeholder="Operations Director"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ap-mobile">
                Mobile <span className="text-gray-400">(optional)</span>
              </Label>
              <Input
                id="ap-mobile"
                type="tel"
                inputMode="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="tel"
                className="h-11"
                placeholder="+971 50 123 4567"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ap-comments">
                Comments <span className="text-gray-400">(optional)</span>
              </Label>
              <Textarea
                id="ap-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Anything the next approver or A-SAFE should know."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {nextSection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Next step: {SECTION_LABEL[nextSection]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={routing}
              onValueChange={(v) => setRouting(v as "other" | "self")}
              className="gap-3"
            >
              <label
                htmlFor="ap-route-other"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem
                  id="ap-route-other"
                  value="other"
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    Send to a different person
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    We&apos;ll email them a secure approval link after you
                    approve.
                  </p>
                </div>
              </label>
              <label
                htmlFor="ap-route-self"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem
                  id="ap-route-self"
                  value="self"
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    I have authority for {SECTION_LABEL[nextSection]} too
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    You&apos;ll be taken straight to the next section after
                    approving.
                  </p>
                </div>
              </label>
            </RadioGroup>

            {routing === "other" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ap-next-email">Email</Label>
                  <Input
                    id="ap-next-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={nextEmail}
                    onChange={(e) => setNextEmail(e.target.value)}
                    className="h-11"
                    placeholder="name@company.com"
                  />
                  {nextEmail && !isLikelyEmail(nextEmail) && (
                    <p className="text-xs text-red-600">
                      Please enter a valid email address.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ap-next-name">
                    Name <span className="text-gray-400">(optional)</span>
                  </Label>
                  <Input
                    id="ap-next-name"
                    value={nextName}
                    onChange={(e) => setNextName(e.target.value)}
                    className="h-11"
                    placeholder="Helps personalise the email"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={submitApprove}
          disabled={!canApprove || submit.kind === "submitting"}
          className="h-12 flex-1 bg-green-600 text-base font-semibold text-white hover:bg-green-700"
        >
          {submit.kind === "submitting" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-5 w-5" /> Approve
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowReject(true)}
          disabled={submit.kind === "submitting"}
          className="h-12 flex-1 border-red-300 text-base font-semibold text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-300"
        >
          Reject
        </Button>
      </div>

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
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
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
  // PDF is generated CLIENT-SIDE here so the anonymous magic-link user
  // doesn't need a login. We fetch the full order data via the public
  // token-scoped endpoint (same possession-of-token auth), then run the
  // existing jsPDF-based generator that the authed order page uses.
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    if (!token || pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch(
        `/api/approval-tokens/${encodeURIComponent(token)}/order-data`,
        { credentials: "omit" },
      );
      const data = await res.json();
      if (!res.ok || !data?.valid || !data?.order) {
        alert("PDF couldn't be generated — the approval link may have expired. Please contact sales@asafe.ae.");
        return;
      }
      // Lazy-load the generator so we don't pull 500KB into the landing
      // page for users who never hit "Download".
      const { generateOrderFormPDF } = await import(
        "@/utils/orderFormPdfGenerator"
      );
      const o = data.order as any;
      const currency = o.currency || "AED";
      const fmt = (n: number) =>
        `${currency} ${Math.round(Number(n || 0)).toLocaleString("en")}`;
      await generateOrderFormPDF(
        {
          orderNumber: o.orderNumber,
          customOrderNumber: o.customOrderNumber,
          customerName: o.customerName,
          customerJobTitle: o.customerJobTitle,
          customerCompany: o.customerCompany,
          customerMobile: o.customerMobile,
          customerEmail: o.customerEmail,
          companyLogoUrl: o.companyLogoUrl,
          orderDate: o.orderDate,
          items: o.items,
          servicePackage: o.servicePackage,
          discountOptions: o.discountOptions,
          totalAmount: o.totalAmount,
          currency,
          technicalSignature: o.technicalSignature,
          commercialSignature: o.commercialSignature,
          marketingSignature: o.marketingSignature,
          reciprocalCommitments: o.reciprocalCommitments,
          uploadedImages: o.uploadedImages,
          layoutDrawingId: o.layoutDrawingId,
          nextApproverEmails: o.nextApproverEmails,
          user: data.preparedBy
            ? {
                firstName: (data.preparedBy.name || "").split(" ")[0],
                lastName: (data.preparedBy.name || "").split(" ").slice(1).join(" "),
                email: data.preparedBy.email,
                phone: data.preparedBy.phone,
                jobTitle: data.preparedBy.jobTitle,
                jobRole: data.preparedBy.jobRole,
                company: data.preparedBy.company,
              }
            : undefined,
          isForUser: o.isForUser,
        } as any,
        fmt,
      );
    } catch (e) {
      console.error("PDF download failed", e);
      alert("Sorry, the PDF couldn't be generated. Please contact sales@asafe.ae.");
    } finally {
      setPdfBusy(false);
    }
  };

  if (state.wasMarketing) {
    return (
      <Card className="border-green-200 dark:border-green-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-5 w-5" /> Order fully approved
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            Thank you. All three approvals are complete and A-SAFE will now
            process this order.
          </p>
          {orderId && token && (
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-60"
              data-testid="download-signed-order-pdf"
            >
              <Download className="h-4 w-4" />
              {pdfBusy ? "Generating PDF…" : "Download signed order (PDF)"}
            </button>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-green-200 dark:border-green-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-5 w-5" /> Approval recorded
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {state.nextEmail ? (
          <p>
            Thanks! We&apos;ve emailed <strong>{state.nextEmail}</strong> — they
            will complete the next step.
          </p>
        ) : (
          <p>Thanks — the next approver has been notified.</p>
        )}
        <p className="text-gray-600 dark:text-gray-400">
          You can safely close this window.
        </p>
      </CardContent>
    </Card>
  );
}

function RejectedPanel() {
  return (
    <Card className="border-red-200 dark:border-red-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5" /> Rejection recorded
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          We&apos;ve recorded your rejection and notified the A-SAFE sales team
          along with previous approvers.
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          You can safely close this window.
        </p>
      </CardContent>
    </Card>
  );
}
