import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building,
  MapPin,
  FileText,
  Mail,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldQuestion,
  ExternalLink,
  Truck,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ──────────────────────────────────────────────
// /share/project/:token — public, anonymous read-only project view.
//
// Mirrors SharedOrderView.tsx (the share-order pattern). Token-gated;
// 404 → revoked or never valid; 410 → expired. Both render the branded
// "link unavailable" card with a mailto fallback.
//
// What the customer sees:
//   - Header: A-SAFE logo, "Project shared by [rep]", customer name
//   - Project info (name / location / description)
//   - Layout drawing(s) — read-only embed (image inline, PDF as link)
//   - Barrier list with PAS 13 verdict chip + cited sections per line
//   - Aggregate verdict + worst-case safety margin
//   - "PAS 13 aligned" / "borderline" / "not aligned" wording (strict)
//   - Indicative footnote on every page
//   - Approve / Request changes CTAs (writes to project_approvals;
//     request-changes additionally emails the rep with the comment)
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

// Verdict chip — strict wording per σ's verdict vocab.
function VerdictChip({ verdict }: { verdict: Verdict | "unknown" }) {
  if (verdict === "aligned") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
        PAS 13 aligned
      </Badge>
    );
  }
  if (verdict === "borderline") {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
        Borderline
      </Badge>
    );
  }
  if (verdict === "not_aligned") {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
        <XCircle className="h-3.5 w-3.5 mr-1" />
        Not PAS 13 aligned
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-gray-600 border-gray-300">
      <ShieldQuestion className="h-3.5 w-3.5 mr-1" />
      Verdict pending
    </Badge>
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

  // ─── Expired / not found state ──────────────────────────────────────
  if (state.kind === "expired" || state.kind === "not_found") {
    const title = state.kind === "expired" ? "This link has expired" : "Link unavailable";
    const desc =
      state.kind === "expired"
        ? "The share link for this project is no longer valid."
        : "We couldn't find a project for this link. It may have been revoked.";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <img src="/asafe-logo.jpeg" alt="A-SAFE" className="h-10" />
            </div>
            <CardTitle className="text-center text-xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-600">{desc}</p>
            <p className="text-sm text-gray-600">
              Your A-SAFE contact can re-issue a fresh link.
            </p>
            <a
              href="mailto:quotes@asafe.ae"
              className="inline-flex items-center gap-2 bg-[#FFC72C] text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-300 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Contact quotes@asafe.ae
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────
  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-600">
            {state.message}. Please retry or contact{" "}
            <a href="mailto:quotes@asafe.ae" className="underline">
              quotes@asafe.ae
            </a>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading project…</div>
      </div>
    );
  }

  // ─── OK state ──────────────────────────────────────────────────────
  const data = state.project;
  const groupedItems = useMemo(() => groupItemsByArea(data.lineItems), [data.lineItems]);
  const expiryStr = data.shareTokenExpiresAt
    ? new Date(data.shareTokenExpiresAt).toLocaleDateString()
    : null;
  const aggMargin =
    data.aggregate.worstMarginPct !== null
      ? `${data.aggregate.worstMarginPct.toFixed(1)}%`
      : "—";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <img src="/asafe-logo.jpeg" alt="A-SAFE" className="h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {data.customer && (
                <div className="text-xl text-gray-800 mb-1">
                  <Building className="h-5 w-5 inline mr-2" />
                  {data.customer.name}
                </div>
              )}
              {data.project.location && (
                <div className="text-lg text-gray-700 mb-1">
                  <MapPin className="h-4 w-4 inline mr-2" />
                  {data.project.location}
                </div>
              )}
              {data.project.description && (
                <div className="text-base text-gray-600 mb-2 font-normal">
                  <FileText className="h-4 w-4 inline mr-2" />
                  {data.project.description}
                </div>
              )}
              <div className="text-lg text-yellow-600 border-t border-gray-200 pt-2 mt-2">
                PROJECT REVIEW
              </div>
            </CardTitle>
            <div className="text-sm text-gray-600 mt-2">
              Shared by <strong>{data.sharedBy.name}</strong>
            </div>
            <div className="text-sm text-gray-700 mt-1">
              Project: <strong>{data.project.name}</strong>
            </div>
          </CardHeader>
        </Card>

        {/* Aggregate verdict */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              PAS 13 alignment summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <VerdictChip verdict={data.aggregate.verdict} />
              <span className="text-sm text-gray-600">
                Worst-case safety margin: <strong>{aggMargin}</strong>
              </span>
            </div>
            <div className="text-xs text-gray-500 flex flex-wrap gap-3">
              <span>{data.aggregate.alignedCount} aligned</span>
              <span>{data.aggregate.borderlineCount} borderline</span>
              <span>{data.aggregate.notAlignedCount} not aligned</span>
              {data.aggregate.unknownCount > 0 && (
                <span>{data.aggregate.unknownCount} pending</span>
              )}
            </div>
            {data.vehicleContext && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 flex items-start gap-2">
                <Truck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Vehicle scenario: {data.vehicleContext.label} — verdicts
                  computed against this worst-case impact.
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500 italic border-t pt-2">
              {data.footnote}
            </div>
          </CardContent>
        </Card>

        {/* Layout drawings */}
        {data.layoutDrawings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Layout drawing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.layoutDrawings.map((d) => (
                <div
                  key={d.id}
                  className="border rounded-lg overflow-hidden bg-white"
                  data-testid={`layout-drawing-${d.id}`}
                >
                  {d.fileType === "image" ? (
                    <img
                      src={d.fileUrl}
                      alt={d.fileName}
                      className="w-full max-h-[600px] object-contain bg-gray-100"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <div className="p-4 flex flex-col items-center gap-3">
                      {d.thumbnailUrl ? (
                        <img
                          src={d.thumbnailUrl}
                          alt={d.fileName}
                          className="max-h-[400px] object-contain bg-gray-100 rounded"
                          style={{ pointerEvents: "none" }}
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center">
                          <FileText className="h-10 w-10 text-gray-400" />
                        </div>
                      )}
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open {d.fileName}
                      </a>
                    </div>
                  )}
                  <div className="px-3 py-2 text-xs text-gray-600 border-t bg-gray-50">
                    {d.fileName}
                    {d.location ? ` — ${d.location}` : ""}
                  </div>
                </div>
              ))}
              <div className="text-xs text-gray-500 italic">
                Read-only preview — drawing tools are disabled in the
                shared view.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Barrier list */}
        {data.lineItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Barriers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {groupedItems.map(({ area, items }) => (
                <div key={area}>
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    {area}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-2">Product</th>
                          <th className="text-right py-2 px-2">Qty</th>
                          <th className="text-left py-2 pl-2">PAS 13 verdict</th>
                          <th className="text-left py-2 pl-2">Cited sections</th>
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
                              ? `${v.details.safetyMarginPct.toFixed(1)}% margin`
                              : null;
                          return (
                            <tr key={idx} className="border-b last:border-b-0 align-top">
                              <td className="py-2 pr-2">{item.productName}</td>
                              <td className="py-2 px-2 text-right">{item.quantity}</td>
                              <td className="py-2 pl-2">
                                <div className="flex flex-col gap-1">
                                  <VerdictChip
                                    verdict={(v?.verdict ?? "unknown") as Verdict | "unknown"}
                                  />
                                  {margin && (
                                    <span className="text-xs text-gray-500">
                                      {margin}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 pl-2 text-xs text-gray-600">
                                {sections}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="text-xs text-gray-500 italic border-t pt-3">
                {data.footnote}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approve / Request changes */}
        <Card>
          <CardHeader>
            <CardTitle>Your decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {decisionRecorded ? (
              <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-900">
                <CheckCircle2 className="h-5 w-5 inline mr-2 text-green-700" />
                {decisionRecorded === "approved"
                  ? "Thank you — your approval has been sent to the A-SAFE team."
                  : "Thanks — your change request has been sent to the A-SAFE team."}
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  Review the layout, barrier list and PAS 13 alignment
                  summary above. When you're ready, approve the design or
                  request changes.
                </p>
                {/* Optional name + email so the rep knows who reviewed it */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="approver-name">Your name (optional)</Label>
                    <Input
                      id="approver-name"
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                      placeholder="Jane Doe"
                      data-testid="input-approver-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="approver-email">Your email (optional)</Label>
                    <Input
                      id="approver-email"
                      type="email"
                      value={approverEmail}
                      onChange={(e) => setApproverEmail(e.target.value)}
                      placeholder="jane@example.com"
                      data-testid="input-approver-email"
                    />
                  </div>
                </div>
                {requestChangesOpen && (
                  <div>
                    <Label htmlFor="comments">What needs to change?</Label>
                    <Textarea
                      id="comments"
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Describe the changes you'd like the team to make…"
                      rows={4}
                      data-testid="textarea-comments"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => submitDecision("approved")}
                    disabled={submittingDecision !== null}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-approve"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  {!requestChangesOpen ? (
                    <Button
                      variant="outline"
                      onClick={() => setRequestChangesOpen(true)}
                      data-testid="button-request-changes-open"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Request changes
                    </Button>
                  ) : (
                    <Button
                      onClick={() => submitDecision("changes_requested")}
                      disabled={submittingDecision !== null}
                      variant="outline"
                      data-testid="button-request-changes-submit"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send change request
                    </Button>
                  )}
                </div>
              </>
            )}
            <div className="text-xs text-gray-500 italic border-t pt-3">
              {data.footnote}
            </div>
          </CardContent>
        </Card>

        {/* Terms / footnote */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-700 space-y-2">
            <p>
              The PAS 13 alignment verdicts shown here are computed
              against the supplied vehicle scenario and the published
              barrier ratings. They are{" "}
              <strong>indicative</strong> — verify with A-SAFE
              engineering for procurement.
            </p>
            <p>
              For any questions on this project, please reach out to your
              A-SAFE contact or email{" "}
              <a href="mailto:quotes@asafe.ae" className="underline">
                quotes@asafe.ae
              </a>
              .
            </p>
          </CardContent>
        </Card>

        {expiryStr && (
          <div className="text-center text-xs text-gray-500">
            This link expires on {expiryStr}.
          </div>
        )}
      </div>
    </div>
  );
}
