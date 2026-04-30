import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  PieChart as RPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  FileText,
  Clock,
  Target,
  Calendar,
  ArrowUp,
  ArrowDown,
  Users,
  AlertCircle,
  ShieldCheck,
  Eye,
  Hammer,
  MapPin,
  Download,
  Bell,
  BellOff,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/contexts/CurrencyContext";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface DashboardData {
  window: {
    from: string;
    to: string;
    days: number;
    scope: "rep" | "org";
    repUserId: string | null;
    isAdmin: boolean;
  };
  kpis: {
    orderCount: number;
    aedTotal: number;
    wonCount: number;
    alignedOrderCount: number;
    activeProjects: number;
    distinctLocations: number;
    complianceScore: number;
    recAcceptanceRate: number;
  };
  pas13Verdicts: { aligned: number; borderline: number; notAligned: number };
  recAcceptance: {
    totalRecs: number;
    totalAccepted: number;
    rate: number;
    timeline: Array<{ day: string; recs: number; accepted: number; rate: number }>;
  };
  approvalFunnel: {
    shared: number;
    viewed: number;
    approved: number;
    ordered: number;
  };
  topProducts: Array<{
    productName: string;
    aedTotal: number;
    units: number;
    lineCount: number;
  }>;
  locations: Array<{ location: string; projectCount: number }>;
  installTeams: Array<{
    teamId: string;
    teamName: string;
    installCount: number;
    avgProgress: number;
    onTimeCount: number;
    completedCount: number;
    onTimePct: number;
  }>;
  compliance: {
    totalProducts: number;
    score: number;
    datasets: Array<{
      key: string;
      label: string;
      covered: number;
      total: number;
      pct: number;
    }>;
  };
  orderTimeline: Array<{ day: string; orderCount: number; aedTotal: number }>;
  hotProjects: Array<{
    id: string;
    name: string;
    location: string;
    views: number;
    approvals: number;
  }>;
}

interface QuoteAnalytics {
  totalQuotes: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
  timelineData: Array<{
    id: string;
    date: string;
    status: string;
    amount: number;
    customerCompany: string;
    lastUpdated: string;
  }>;
  monthlyData: Array<{
    month: string;
    count: number;
    value: number;
  }>;
  recentQuotes: Array<{
    id: string;
    date: string;
    status: string;
    amount: number;
    customerCompany: string;
  }>;
}

interface QuoteReminder {
  quoteId: string;
  customerCompany: string;
  daysSinceCreation: number;
  stage: string;
  nextAction: string;
  urgency: "low" | "medium" | "high";
  amount: string;
  lastContact: string;
}

// ──────────────────────────────────────────────
// CSV export — every chart gets a tiny "Download CSV" button. Browser
// download is anchored to the rep's window so spreadsheets are
// reproducible without a server round-trip.
// ──────────────────────────────────────────────
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Empty-state placeholder for any chart that has no data in the window.
function NoDataYet({ label = "data" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">No {label} yet in this window</p>
      <p className="text-xs mt-1">Try a wider date range</p>
    </div>
  );
}

// ──────────────────────────────────────────────
// Time-range presets — keep the UI simple. Custom date ranges are a
// future polish item; for now reps want 1 click to a sensible window.
// ──────────────────────────────────────────────
const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "This year" },
] as const;

// PAS 13 donut palette mirrors the alignment colors used elsewhere
// in the app (green / amber / red, never red-on-red).
const PAS13_COLORS = {
  aligned: "#16a34a",
  borderline: "#f59e0b",
  notAligned: "#dc2626",
};

// Yellow brand accent — kept consistent with the rest of the app.
const BRAND_YELLOW = "#FFC72C";

export default function AnalyticsDashboard() {
  const { toast } = useToast();
  const { convertPrice, formatPrice } = useCurrency();
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderFrequency, setReminderFrequency] = useState("daily");
  const [rangeDays, setRangeDays] = useState<string>("30");
  // Org-wide toggle — only meaningful for admins. Reps see their own
  // metrics regardless of this flag (the server enforces it).
  const [scope, setScope] = useState<"mine" | "org">("mine");

  // Build the window query once per range change so the dashboard,
  // approval funnel + CSV exports all key off the same Date pair.
  const window = useMemo(() => {
    const days = Number(rangeDays);
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, [rangeDays]);

  // ── Dashboard payload — heavy aggregate; cached server-side 5 min ─
  const dashboardQs = new URLSearchParams({
    from: window.fromIso,
    to: window.toIso,
  });
  if (scope === "org") {
    // Sending no repUserId tells the server to widen to org-wide for admins.
    // Non-admins are silently locked to their own data regardless.
  }
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery<DashboardData>({
    queryKey: [`/api/analytics/dashboard?${dashboardQs.toString()}`],
  });

  // ── Legacy quote analytics (kept — drives the Timeline + Trends tabs)
  const { data: analytics } = useQuery<QuoteAnalytics>({
    queryKey: ["/api/analytics/quotes"],
  });

  const { data: reminderSettings } = useQuery({
    queryKey: ["/api/reminders/settings"],
  });

  const { data: reminders } = useQuery<QuoteReminder[]>({
    queryKey: ["/api/reminders/quotes"],
    enabled: remindersEnabled,
  });

  useEffect(() => {
    if (reminderSettings) {
      setRemindersEnabled((reminderSettings as any).enabled);
      setReminderFrequency((reminderSettings as any).frequency);
    }
  }, [reminderSettings]);

  const handleReminderToggle = async (enabled: boolean) => {
    try {
      await apiRequest("/api/reminders/settings", "POST", {
        enabled,
        frequency: reminderFrequency,
      });
      setRemindersEnabled(enabled);
      toast({
        title: enabled ? "Reminders Enabled" : "Reminders Disabled",
        description: enabled
          ? "You'll receive quote follow-up reminders"
          : "Quote reminders have been turned off",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reminder settings",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "revised":
        return "bg-purple-100 text-purple-800";
      case "accepted":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const currentMonthData = analytics?.monthlyData?.[analytics.monthlyData.length - 1];
  const previousMonthData = analytics?.monthlyData?.[analytics.monthlyData.length - 2];
  const quoteTrend =
    currentMonthData && previousMonthData
      ? calculateTrend(currentMonthData.count, previousMonthData.count)
      : 0;
  const valueTrend =
    currentMonthData && previousMonthData
      ? calculateTrend(currentMonthData.value, previousMonthData.value)
      : 0;

  // ──────────────────────────────────────────────
  // Derived chart data
  // ──────────────────────────────────────────────
  const pasDonutData = useMemo(() => {
    if (!dashboard) return [];
    const v = dashboard.pas13Verdicts;
    const total = v.aligned + v.borderline + v.notAligned;
    if (total === 0) return [];
    return [
      { name: "Aligned", value: v.aligned, color: PAS13_COLORS.aligned },
      { name: "Borderline", value: v.borderline, color: PAS13_COLORS.borderline },
      { name: "Not aligned", value: v.notAligned, color: PAS13_COLORS.notAligned },
    ];
  }, [dashboard]);

  const funnelData = useMemo(() => {
    if (!dashboard) return [];
    const f = dashboard.approvalFunnel;
    const data = [
      { name: "Shared", value: f.shared, fill: "#3b82f6" },
      { name: "Viewed", value: f.viewed, fill: "#8b5cf6" },
      { name: "Approved", value: f.approved, fill: "#10b981" },
      { name: "Ordered", value: f.ordered, fill: "#f59e0b" },
    ];
    return data;
  }, [dashboard]);

  const topProductsChartData = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.topProducts.map((p) => ({
      name: p.productName.length > 24 ? p.productName.slice(0, 22) + "…" : p.productName,
      fullName: p.productName,
      aedTotal: Math.round(p.aedTotal),
      units: p.units,
    }));
  }, [dashboard]);

  const orderCountFmt = dashboard?.kpis.orderCount ?? 0;
  const aedTotalFmt = formatPrice(convertPrice(dashboard?.kpis.aedTotal ?? 0));
  const activeProjectsFmt = dashboard?.kpis.activeProjects ?? 0;
  const complianceScoreFmt = dashboard?.kpis.complianceScore ?? 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Sales Analytics</h1>
          <p className="text-sm text-muted-foreground">
            What's working — PAS 13 alignment, recommendations, project approvals,
            install KPIs at a glance.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {dashboard?.window.isAdmin && (
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="scope-select">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My data</SelectItem>
                <SelectItem value="org">Org-wide</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={rangeDays} onValueChange={setRangeDays}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="range-select">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {dashboardError && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Failed to load dashboard. Try refreshing in a moment.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card data-testid="kpi-orders">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline" className="text-xs">
                {dashboard?.window.scope === "org" ? "Org" : "Yours"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{orderCountFmt}</div>
            <p className="text-sm text-muted-foreground">Orders this window</p>
            {dashboard && (
              <p className="text-xs text-muted-foreground mt-1">
                {dashboard.kpis.wonCount} fulfilled / installed
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="kpi-aed">
          <CardHeader className="pb-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold break-words">{aedTotalFmt}</div>
            <p className="text-sm text-muted-foreground">Order revenue</p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-projects">
          <CardHeader className="pb-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{activeProjectsFmt}</div>
            <p className="text-sm text-muted-foreground">Active projects</p>
            {dashboard && (
              <p className="text-xs text-muted-foreground mt-1">
                across {dashboard.kpis.distinctLocations} locations
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="kpi-compliance">
          <CardHeader className="pb-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{complianceScoreFmt}%</div>
            <p className="text-sm text-muted-foreground">Catalog completeness</p>
            <Progress value={complianceScoreFmt} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">
            Trends
          </TabsTrigger>
          <TabsTrigger value="reminders" data-testid="tab-reminders">
            Reminders
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            Settings
          </TabsTrigger>
        </TabsList>

        {/* ───── Overview tab ───── */}
        <TabsContent value="overview" className="space-y-4">
          {dashboardLoading && !dashboard && (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FFC72C] mx-auto" />
                <p className="mt-3 text-sm text-muted-foreground">Loading dashboard…</p>
              </CardContent>
            </Card>
          )}

          {dashboard && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* PAS 13 verdict donut */}
              <Card data-testid="card-pas13">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">PAS 13 Verdicts</CardTitle>
                    <CardDescription>
                      Recent orders by alignment grade
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("pas13-verdicts.csv", [
                        { grade: "Aligned", count: dashboard.pas13Verdicts.aligned },
                        { grade: "Borderline", count: dashboard.pas13Verdicts.borderline },
                        { grade: "Not aligned", count: dashboard.pas13Verdicts.notAligned },
                      ])
                    }
                    data-testid="csv-pas13"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {pasDonutData.length === 0 ? (
                    <NoDataYet label="PAS 13 verdicts" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <RPieChart>
                        <Pie
                          data={pasDonutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          dataKey="value"
                          label={(e: any) => `${e.name}: ${e.value}`}
                        >
                          {pasDonutData.map((entry, idx) => (
                            <Cell key={`pas-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RTooltip />
                        <Legend />
                      </RPieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Approval funnel */}
              <Card data-testid="card-funnel">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">Project Approval Funnel</CardTitle>
                    <CardDescription>
                      Shared → Viewed → Approved → Ordered
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("approval-funnel.csv", funnelData.map((f) => ({
                        stage: f.name,
                        count: f.value,
                      })))
                    }
                    data-testid="csv-funnel"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {funnelData.every((d) => d.value === 0) ? (
                    <NoDataYet label="approval activity" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <FunnelChart>
                        <RTooltip />
                        <Funnel dataKey="value" data={funnelData} isAnimationActive>
                          <LabelList
                            position="right"
                            fill="#000"
                            stroke="none"
                            dataKey="name"
                          />
                        </Funnel>
                      </FunnelChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Recommendation acceptance trend */}
              <Card data-testid="card-rec">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">
                      Recommendation Acceptance ({dashboard.recAcceptance.rate}%)
                    </CardTitle>
                    <CardDescription>
                      {dashboard.recAcceptance.totalAccepted} of{" "}
                      {dashboard.recAcceptance.totalRecs} recommended SKUs ordered
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("rec-acceptance.csv", dashboard.recAcceptance.timeline)
                    }
                    data-testid="csv-rec"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.recAcceptance.timeline.length === 0 ? (
                    <NoDataYet label="recommendations" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={dashboard.recAcceptance.timeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} />
                        <YAxis yAxisId="left" />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <RTooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="recs"
                          stroke="#94a3b8"
                          name="Recommended"
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="accepted"
                          stroke="#10b981"
                          name="Accepted"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="rate"
                          stroke={BRAND_YELLOW}
                          name="Rate %"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top products */}
              <Card data-testid="card-top-products">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">Top Products by Revenue</CardTitle>
                    <CardDescription>Top 10 SKUs by AED total</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("top-products.csv", dashboard.topProducts)
                    }
                    data-testid="csv-top-products"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {topProductsChartData.length === 0 ? (
                    <NoDataYet label="orders" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={topProductsChartData}
                        layout="vertical"
                        margin={{ left: 12, right: 12 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fontSize: 11 }}
                        />
                        <RTooltip
                          formatter={(value: any, _name, props) => [
                            formatPrice(convertPrice(Number(value))),
                            props?.payload?.fullName || "AED",
                          ]}
                        />
                        <Bar dataKey="aedTotal" fill={BRAND_YELLOW} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Compliance bullet chart */}
              <Card data-testid="card-compliance">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">
                      Catalog Data Completeness
                    </CardTitle>
                    <CardDescription>
                      {dashboard.compliance.totalProducts} active products — coverage
                      per dataset
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("compliance.csv", dashboard.compliance.datasets)
                    }
                    data-testid="csv-compliance"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.compliance.totalProducts === 0 ? (
                    <NoDataYet label="catalog products" />
                  ) : (
                    <div className="space-y-3">
                      {dashboard.compliance.datasets.map((d) => (
                        <div key={d.key}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{d.label}</span>
                            <span className="text-muted-foreground">
                              {d.covered} / {d.total} ({d.pct}%)
                            </span>
                          </div>
                          <Progress value={d.pct} className="h-2" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Install team performance */}
              <Card data-testid="card-install-teams">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Hammer className="h-4 w-4" />
                      Install Team On-Time
                    </CardTitle>
                    <CardDescription>
                      Per-team install count + on-time %
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("install-teams.csv", dashboard.installTeams)
                    }
                    data-testid="csv-install-teams"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.installTeams.length === 0 ? (
                    <NoDataYet label="installs" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-right">Installs</TableHead>
                          <TableHead className="text-right">On-time</TableHead>
                          <TableHead className="text-right">Avg progress</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard.installTeams.map((t) => (
                          <TableRow key={t.teamId}>
                            <TableCell className="font-medium">{t.teamName}</TableCell>
                            <TableCell className="text-right">
                              {t.installCount}
                            </TableCell>
                            <TableCell className="text-right">
                              {t.completedCount > 0 ? (
                                <Badge
                                  variant={
                                    t.onTimePct >= 80
                                      ? "default"
                                      : t.onTimePct >= 50
                                        ? "secondary"
                                        : "destructive"
                                  }
                                >
                                  {t.onTimePct}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  In progress
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {t.avgProgress}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Customer location */}
              <Card data-testid="card-locations">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Customer Locations
                    </CardTitle>
                    <CardDescription>
                      Project count by city / location
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("locations.csv", dashboard.locations)
                    }
                    data-testid="csv-locations"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.locations.length === 0 ? (
                    <NoDataYet label="projects with location data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={dashboard.locations}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="location"
                          tick={{ fontSize: 10 }}
                          interval={0}
                          angle={-30}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis />
                        <RTooltip />
                        <Bar dataKey="projectCount" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Hot projects (proxy for video / install engagement) */}
              <Card data-testid="card-hot-projects">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Most-Viewed Projects
                    </CardTitle>
                    <CardDescription>
                      Public share-link engagement this window
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("hot-projects.csv", dashboard.hotProjects)
                    }
                    data-testid="csv-hot-projects"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.hotProjects.length === 0 ? (
                    <NoDataYet label="project shares" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Views</TableHead>
                          <TableHead className="text-right">Approvals</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard.hotProjects.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.location || "—"}
                            </TableCell>
                            <TableCell className="text-right">{p.views}</TableCell>
                            <TableCell className="text-right">
                              {p.approvals > 0 ? (
                                <Badge variant="default">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {p.approvals}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Order timeline (full-width row) */}
              <Card data-testid="card-order-timeline" className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Order Timeline
                    </CardTitle>
                    <CardDescription>
                      Daily order count + revenue
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv("order-timeline.csv", dashboard.orderTimeline)
                    }
                    data-testid="csv-order-timeline"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {dashboard.orderTimeline.length === 0 ? (
                    <NoDataYet label="orders" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={dashboard.orderTimeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <RTooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="orderCount"
                          stroke="#3b82f6"
                          name="Orders"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="aedTotal"
                          stroke={BRAND_YELLOW}
                          name="AED revenue"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ───── Existing Timeline tab (preserved) ───── */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote Timeline</CardTitle>
              <CardDescription>
                Track the status and history of your quotes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!analytics?.timelineData?.length ? (
                <NoDataYet label="quotes" />
              ) : (
                <div className="space-y-4">
                  {analytics.timelineData.map((quote) => (
                    <div
                      key={quote.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg gap-2"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold">{quote.customerCompany}</span>
                          <Badge className={getStatusColor(quote.status)}>
                            {quote.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(quote.date), "MMM dd, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Updated {format(new Date(quote.lastUpdated), "MMM dd")}
                          </span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="font-semibold">
                          {formatPrice(convertPrice(quote.amount))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Existing Trends tab (preserved) ───── */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>
                Quote volume and value over the last 6 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!analytics?.monthlyData?.length ? (
                <NoDataYet label="monthly data" />
              ) : (
                <div className="space-y-4">
                  {analytics.monthlyData.map((month) => (
                    <div key={month.month} className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-medium">
                          {format(new Date(month.month + "-01"), "MMMM yyyy")}
                        </span>
                        <div className="flex items-center gap-4 text-sm">
                          <span>{month.count} quotes</span>
                          <span className="font-semibold">
                            {formatPrice(convertPrice(month.value))}
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={
                          (month.value /
                            Math.max(
                              ...(analytics?.monthlyData?.map((m) => m.value) || [1]),
                            )) *
                          100
                        }
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Existing Reminders tab (preserved) ───── */}
        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Follow-up Reminders</CardTitle>
              <CardDescription>
                Quotes requiring follow-up based on your sales workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!remindersEnabled ? (
                <div className="text-center py-8">
                  <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">
                    Reminders are currently disabled
                  </p>
                  <Button onClick={() => handleReminderToggle(true)}>
                    Enable Reminders
                  </Button>
                </div>
              ) : !reminders?.length ? (
                <NoDataYet label="reminders" />
              ) : (
                <div className="space-y-4">
                  {reminders.map((reminder) => (
                    <div key={reminder.quoteId} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">
                              {reminder.customerCompany}
                            </span>
                            <Badge variant="outline">{reminder.stage}</Badge>
                            <AlertCircle
                              className={`h-4 w-4 ${getUrgencyColor(reminder.urgency)}`}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {reminder.daysSinceCreation} days since creation
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatPrice(convertPrice(parseFloat(reminder.amount)))}
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded p-3">
                        <p className="text-sm font-medium mb-1">Recommended Action:</p>
                        <p className="text-sm text-muted-foreground">
                          {reminder.nextAction}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── Existing Settings tab (preserved) ───── */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reminder Settings</CardTitle>
              <CardDescription>
                Configure how you receive quote follow-up reminders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <Label htmlFor="reminders-enabled">Enable Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications for quote follow-ups
                  </p>
                </div>
                <Switch
                  id="reminders-enabled"
                  checked={remindersEnabled}
                  onCheckedChange={handleReminderToggle}
                />
              </div>

              <div className="space-y-2">
                <Label>Reminder Frequency</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["daily", "weekly", "biweekly"].map((freq) => (
                    <Button
                      key={freq}
                      variant={reminderFrequency === freq ? "default" : "outline"}
                      onClick={() => setReminderFrequency(freq)}
                      className={
                        reminderFrequency === freq
                          ? "bg-[#FFC72C] hover:bg-[#FFB300] text-black"
                          : ""
                      }
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
