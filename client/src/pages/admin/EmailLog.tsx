/**
 * /admin/email-log
 *
 * Admin diagnostic page surfacing every Resend send attempt — success,
 * failure, or skip. Solves "user reports password-reset email never
 * arrived" without grepping Worker logs: filter by status=failed +
 * callerRoute=/api/auth/forgot-password and the exact Resend error
 * (domain unverified / API key revoked / rate limit) is right there.
 *
 * Auto-refreshes every 30 s so the page is useful while the operator is
 * actively asking the user to retry. "Re-send" replays a failed row via
 * POST /api/admin/email-log/:id/replay; the original row is unchanged
 * and the replay attempt creates a fresh row alongside (so the audit
 * trail is preserved).
 *
 * Sensitivity: response_body can contain Resend error text + headers.
 * Page is admin-gated and the body is rendered inside an expandable
 * <details> so casual viewers don't see it on a screen-share.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Mail,
  RefreshCw,
  Send,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailLogRow {
  id: string;
  to: string;
  subject: string;
  fromAddress: string | null;
  status: "queued" | "sent" | "failed" | "skipped_no_config";
  resendId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  callerRoute: string | null;
  createdAt: string | null;
}

interface EmailLogResponse {
  rows: EmailLogRow[];
  total?: number;
  bootstrapNeeded?: boolean;
  message?: string;
}

type StatusFilter = "all" | "sent" | "failed" | "skipped_no_config";

// Server-side filter is by status; the API param is the bare status
// value (not the chip label). Mapping here so the UI labels can drift
// from the wire format without coupling.
function statusToQuery(filter: StatusFilter): string | null {
  if (filter === "all") return null;
  return filter;
}

// Friendly chip palette — green/red/amber per status. Kept inline so we
// don't need to wire a separate config file for one page.
const STATUS_STYLE: Record<EmailLogRow["status"], string> = {
  sent: "bg-green-100 text-green-800 border-green-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  skipped_no_config: "bg-amber-100 text-amber-900 border-amber-300",
  queued: "bg-blue-100 text-blue-800 border-blue-300",
};

const STATUS_LABEL: Record<EmailLogRow["status"], string> = {
  sent: "Sent",
  failed: "Failed",
  skipped_no_config: "Skipped",
  queued: "Queued",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export default function EmailLog() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const listQuery = useQuery<EmailLogResponse>({
    queryKey: ["/api/admin/email-log", filter],
    queryFn: async () => {
      const status = statusToQuery(filter);
      const url = status
        ? `/api/admin/email-log?limit=200&status=${encodeURIComponent(status)}`
        : `/api/admin/email-log?limit=200`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok)
        throw new Error(`Failed to load email log (${res.status})`);
      return res.json();
    },
    // Auto-refresh every 30s — useful while the operator is actively
    // asking the user to "try the reset link again" and watching the
    // log fill in.
    refetchInterval: 30 * 1000,
  });

  const replayMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/email-log/${id}/replay`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || `Replay failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/email-log"],
      });
      toast({
        title: data?.ok ? "Re-send queued" : "Re-send failed",
        description: data?.ok
          ? "A fresh attempt has been logged. Refresh in a few seconds."
          : "Resend rejected the retry — check the new failed row for the cause.",
        variant: data?.ok ? undefined : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't replay",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Quick counts for the filter chips — derived from the loaded slice
  // when "all" is active, otherwise we just show the filtered total.
  const counts = useMemo(() => {
    const rows = listQuery.data?.rows ?? [];
    return {
      total: rows.length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      skipped: rows.filter((r) => r.status === "skipped_no_config").length,
    };
  }, [listQuery.data]);

  const bootstrapNeeded = listQuery.data?.bootstrapNeeded === true;

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="admin-email-log"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Email log
        </h1>
        <p className="text-sm text-muted-foreground">
          Last 200 Resend send attempts. Filter by{" "}
          <code className="text-xs">status=failed</code> +{" "}
          <code className="text-xs">callerRoute=/api/auth/forgot-password</code>{" "}
          to diagnose missing password-reset emails. Auto-refreshes every 30 s.
        </p>
      </div>

      {bootstrapNeeded && (
        <Card className="border-amber-500/40 bg-amber-50/40">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-base">
                email_log table not yet created
              </CardTitle>
              <CardDescription>
                Run{" "}
                <code className="text-xs">
                  POST /api/admin/apply-email-log-schema
                </code>{" "}
                with the migration token before this page can show data.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </CardTitle>
            <CardDescription>
              Filter by status. The "Re-send" button on a failed row replays the
              attempt with a placeholder body — useful after fixing the underlying
              cause (e.g. domain verified in Resend).
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="All"
              active={filter === "all"}
              count={counts.total}
              onClick={() => setFilter("all")}
              testId="email-log-filter-all"
            />
            <FilterChip
              label="Sent"
              active={filter === "sent"}
              count={counts.sent}
              onClick={() => setFilter("sent")}
              testId="email-log-filter-sent"
            />
            <FilterChip
              label="Failed"
              active={filter === "failed"}
              count={counts.failed}
              onClick={() => setFilter("failed")}
              testId="email-log-filter-failed"
            />
            <FilterChip
              label="Skipped"
              active={filter === "skipped_no_config"}
              count={counts.skipped}
              onClick={() => setFilter("skipped_no_config")}
              testId="email-log-filter-skipped"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              data-testid="email-log-refresh"
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${listQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading email log…
            </div>
          ) : listQuery.error ? (
            <div className="py-12 text-center text-sm text-red-600">
              Couldn't load: {(listQuery.error as Error).message}
            </div>
          ) : (listQuery.data?.rows ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No email attempts logged yet.
              {filter !== "all" ? " Try a different filter." : ""}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Time</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead>Caller route</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[120px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQuery.data?.rows ?? []).map((r) => {
                  const isExpanded = expandedRow === r.id;
                  return (
                    <>
                      <TableRow
                        key={r.id}
                        className={
                          r.status === "failed"
                            ? "bg-red-50/40"
                            : r.status === "skipped_no_config"
                              ? "bg-amber-50/30"
                              : ""
                        }
                        data-testid={`email-log-row-${r.id}`}
                      >
                        <TableCell className="text-xs font-mono">
                          {formatDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm font-mono break-all">
                          {r.to}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{truncate(r.subject, 60)}</span>
                          {r.resendId && (
                            <div className="text-[11px] text-muted-foreground font-mono">
                              id: {r.resendId}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={STATUS_STYLE[r.status]}
                          >
                            {STATUS_LABEL[r.status] || r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {r.callerRoute || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.errorCode || r.errorMessage ? (
                            <button
                              onClick={() =>
                                setExpandedRow(isExpanded ? null : r.id)
                              }
                              className="text-left hover:underline"
                              data-testid={`email-log-toggle-${r.id}`}
                            >
                              {r.errorCode && (
                                <span className="font-mono font-semibold text-red-700">
                                  {r.errorCode}
                                </span>
                              )}
                              {r.errorCode && r.errorMessage && (
                                <span className="text-muted-foreground"> — </span>
                              )}
                              {r.errorMessage && (
                                <span>{truncate(r.errorMessage, 80)}</span>
                              )}
                              {r.responseStatus && (
                                <div className="text-[11px] text-muted-foreground">
                                  HTTP {r.responseStatus} · click for details
                                </div>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.status === "failed" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={replayMutation.isPending}
                              onClick={() => replayMutation.mutate(r.id)}
                              data-testid={`email-log-replay-${r.id}`}
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              Re-send
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow
                          key={`${r.id}-details`}
                          data-testid={`email-log-details-${r.id}`}
                        >
                          <TableCell colSpan={7} className="bg-muted/40">
                            <div className="space-y-2 p-2">
                              {r.errorMessage && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Error message
                                  </div>
                                  <pre className="text-xs whitespace-pre-wrap break-all bg-background p-2 rounded border">
                                    {r.errorMessage}
                                  </pre>
                                </div>
                              )}
                              {r.responseBody && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer font-semibold text-muted-foreground">
                                    Resend response body
                                    {r.responseStatus
                                      ? ` (HTTP ${r.responseStatus})`
                                      : ""}
                                  </summary>
                                  <pre className="text-xs whitespace-pre-wrap break-all bg-background p-2 rounded border mt-1">
                                    {r.responseBody}
                                  </pre>
                                </details>
                              )}
                              {r.fromAddress && (
                                <div className="text-[11px] text-muted-foreground font-mono">
                                  From: {r.fromAddress}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: a long run of <strong>failed</strong> rows with{" "}
        <code className="text-xs">errorCode = validation_error</code> and a body
        mentioning "domain not verified" usually means the Resend dashboard
        domain is still pending DNS — check{" "}
        <a
          href="https://resend.com/domains"
          target="_blank"
          rel="noopener"
          className="underline"
        >
          resend.com/domains
        </a>
        .
      </p>
    </div>
  );
}

// Tiny chip component shared by the four filter buttons. Kept inline so
// the file stays self-contained.
function FilterChip({
  label,
  active,
  count,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-primary/15 border-primary text-foreground"
          : "bg-background border-border text-muted-foreground hover:bg-muted"
      }`}
      data-testid={testId}
    >
      {label}
      <span
        className={`rounded px-1.5 text-[11px] font-mono ${
          active ? "bg-primary/30" : "bg-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
