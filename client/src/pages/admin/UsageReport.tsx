// ────────────────────────────────────────────────────────────────────────────
// UsageReport
//
// Per-user engagement table. One row per registered user, columns for
// every artifact they can produce (orders, calculations, quote requests,
// quote drafts, solution requests, site surveys, layout drawings,
// projects), plus login count and last activity.
//
// Backend: GET /api/admin/users/usage-report (admin auth, see
// worker/index.ts ~line 5260). All counts pre-aggregated in SQL so this
// page renders 200+ users with no N+1.
//
// Sort by any numeric column (descending = top users first). Search
// filter checks email / first / last / company. CSV export bundles
// the currently-filtered rows so the operator can drop it into a
// spreadsheet for monthly review.
// ────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Download, RefreshCw, Search } from "lucide-react";

type UsageRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  role: string | null;
  jobRole: string | null;
  emailVerified: boolean | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  ordersCount: number;
  calculationsCount: number;
  quoteRequestsCount: number;
  quoteDraftsCount: number;
  solutionRequestsCount: number;
  siteSurveysCount: number;
  layoutDrawingsCount: number;
  projectsCount: number;
  activityCount: number;
  lastActivityAt: string | null;
};

type Resp = {
  ok: boolean;
  total: number;
  generatedAt: string;
  rows: UsageRow[];
};

type SortKey =
  | "loginCount"
  | "lastLoginAt"
  | "ordersCount"
  | "calculationsCount"
  | "quoteRequestsCount"
  | "quoteDraftsCount"
  | "solutionRequestsCount"
  | "siteSurveysCount"
  | "layoutDrawingsCount"
  | "projectsCount"
  | "activityCount"
  | "lastActivityAt"
  | "createdAt"
  | "email";

const NUMERIC_KEYS: SortKey[] = [
  "loginCount",
  "ordersCount",
  "calculationsCount",
  "quoteRequestsCount",
  "quoteDraftsCount",
  "solutionRequestsCount",
  "siteSurveysCount",
  "layoutDrawingsCount",
  "projectsCount",
  "activityCount",
];

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return format(new Date(s), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function fmtRelative(s: string | null) {
  if (!s) return "never";
  const ms = Date.now() - new Date(s).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const day = 24 * 60 * 60 * 1000;
  if (ms < 60 * 1000) return "just now";
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < day) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  return fmtDate(s);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(rows: UsageRow[]) {
  const header = [
    "Email",
    "First name",
    "Last name",
    "Company",
    "Role",
    "Job role",
    "Email verified",
    "Created",
    "Last login",
    "Login count",
    "Orders",
    "Calculations",
    "Quote requests",
    "Quote drafts",
    "Solution requests",
    "Site surveys",
    "Layout drawings",
    "Projects",
    "Activities",
    "Last activity",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.firstName,
        r.lastName,
        r.company,
        r.role,
        r.jobRole,
        r.emailVerified,
        r.createdAt,
        r.lastLoginAt,
        r.loginCount,
        r.ordersCount,
        r.calculationsCount,
        r.quoteRequestsCount,
        r.quoteDraftsCount,
        r.solutionRequestsCount,
        r.siteSurveysCount,
        r.layoutDrawingsCount,
        r.projectsCount,
        r.activityCount,
        r.lastActivityAt,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `asafe-engage-usage-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsageReport() {
  const [sortKey, setSortKey] = useState<SortKey>("loginCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [includeAdmins, setIncludeAdmins] = useState(false);

  // Custom queryFn so the URL is built explicitly. The default
  // getQueryFn joins queryKey segments with "/", so a key of
  // ["/api/admin/users/usage-report", ""] would produce
  // "/api/admin/users/usage-report/" — that trailing slash misses the
  // Hono route and lets the SPA fallback return index.html, which the
  // JSON parser then chokes on.
  const { data, isLoading, error, refetch, isRefetching } = useQuery<Resp | null>({
    queryKey: ["usage-report", includeAdmins],
    queryFn: async () => {
      const url = `/api/admin/users/usage-report${includeAdmins ? "?includeAdmins=true" : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as Resp;
    },
    staleTime: 30 * 1000,
  });

  const rows = data?.rows ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.email, r.firstName, r.lastName, r.company]
        .filter((s): s is string => Boolean(s))
        .some((s) => s.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      // Numeric vs date vs string — handle each. Nulls always sort last.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (NUMERIC_KEYS.includes(sortKey)) {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      if (sortKey === "lastLoginAt" || sortKey === "lastActivityAt" || sortKey === "createdAt") {
        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        return sortDir === "desc" ? bd - ad : ad - bd;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return null;
    return sortDir === "desc" ? (
      <ArrowDown className="inline h-3 w-3 ml-1" />
    ) : (
      <ArrowUp className="inline h-3 w-3 ml-1" />
    );
  }

  const headers: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
    { key: "email", label: "User" },
    { key: "loginCount", label: "Logins", numeric: true },
    { key: "lastLoginAt", label: "Last login" },
    { key: "ordersCount", label: "Orders", numeric: true },
    { key: "calculationsCount", label: "Calcs", numeric: true },
    { key: "quoteRequestsCount", label: "Quote reqs", numeric: true },
    { key: "quoteDraftsCount", label: "Quote drafts", numeric: true },
    { key: "solutionRequestsCount", label: "Solutions", numeric: true },
    { key: "siteSurveysCount", label: "Surveys", numeric: true },
    { key: "layoutDrawingsCount", label: "Drawings", numeric: true },
    { key: "projectsCount", label: "Projects", numeric: true },
    { key: "activityCount", label: "Page views", numeric: true },
    { key: "lastActivityAt", label: "Last seen" },
    { key: "createdAt", label: "Joined" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>User Usage Report</CardTitle>
          <p className="text-sm text-muted-foreground">
            One row per user. Sort any column. Logins counted from the moment
            login tracking shipped.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search email, name, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 w-64"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncludeAdmins((v) => !v)}
            data-testid="toggle-admins"
          >
            {includeAdmins ? "Hide admins" : "Include admins"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="refresh-usage"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(sorted)}
            disabled={sorted.length === 0}
            data-testid="export-csv"
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Loading usage data…
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 py-8 text-center">
            Failed to load usage report. Run{" "}
            <code className="px-1 bg-muted rounded">
              /api/admin/apply-login-tracking
            </code>{" "}
            and{" "}
            <code className="px-1 bg-muted rounded">
              /api/admin/apply-quote-drafts-schema
            </code>{" "}
            with the migration token if columns are missing.
          </p>
        )}
        {data && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {sorted.length} of {data.total} users
                {search && ` (filtered)`}
              </span>
              <span>
                Generated {fmtRelative(data.generatedAt)}
              </span>
            </div>
            <ScrollArea className="h-[640px] border rounded">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead
                        key={h.key}
                        className={`cursor-pointer select-none whitespace-nowrap ${
                          h.numeric ? "text-right" : ""
                        }`}
                        onClick={() => toggleSort(h.key)}
                      >
                        {h.label}
                        {arrow(h.key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => {
                    const dormant = (r.loginCount ?? 0) === 0;
                    return (
                      <TableRow key={r.id} className={dormant ? "opacity-60" : ""}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {r.firstName || r.lastName
                                ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
                                : "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.email ?? "no email"}
                            </span>
                            {r.company && (
                              <span className="text-xs text-muted-foreground">
                                {r.company}
                              </span>
                            )}
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {r.role && r.role !== "customer" && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {r.role}
                                </Badge>
                              )}
                              {dormant && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-amber-300 text-amber-700"
                                >
                                  registered, never logged in
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.loginCount ?? 0}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtRelative(r.lastLoginAt)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.ordersCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.calculationsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.quoteRequestsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.quoteDraftsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.solutionRequestsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.siteSurveysCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.layoutDrawingsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.projectsCount}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.activityCount}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtRelative(r.lastActivityAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtDate(r.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
