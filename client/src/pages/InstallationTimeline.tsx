import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, differenceInCalendarDays, startOfWeek, endOfWeek } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar as CalendarIcon,
  CheckCircle,
  ChevronRight,
  Clock,
  Edit3,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ──────────────────────────────────────────────────────────

type InstallStatus =
  | "planning"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";
type PhaseStatus = "not_started" | "in_progress" | "completed" | "delayed" | "on_hold";
type InstallSource = "order_won" | "followup" | "rework" | "manual_other";

interface InstallTeam {
  id: string;
  name: string;
  region: string | null;
  leadContactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  capacityJobsPerWeek: number | null;
  colour: string | null;
  active: boolean;
}

interface Milestone {
  id: string;
  phaseId: string;
  name: string;
  date: string | null;
  completed: boolean;
  description: string | null;
}

interface Phase {
  id: string;
  installationId: string;
  orderIndex: number;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: PhaseStatus;
  progress: number;
  assignedTeamId: string | null;
  notes: string | null;
  team?: InstallTeam | null;
  milestones?: Milestone[];
}

interface Assignment {
  id: string;
  installationId: string;
  teamId: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  team?: InstallTeam | null;
}

interface Installation {
  id: string;
  orderId: string | null;
  projectId: string | null;
  title: string;
  customerName: string | null;
  location: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  source: InstallSource;
  complexity: "simple" | "standard" | "complex";
  status: InstallStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InstallationDetail extends Installation {
  phases: Phase[];
  assignments: Assignment[];
  order: any | null;
  project: any | null;
}

// ─── Status colours ─────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  planning: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  scheduled: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  cancelled: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  delayed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

const STATUS_DOT: Record<string, string> = {
  planning: "bg-purple-500",
  scheduled: "bg-indigo-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  on_hold: "bg-yellow-500",
  cancelled: "bg-gray-400",
  not_started: "bg-gray-300",
  delayed: "bg-red-500",
};

const INSTALL_KANBAN_COLUMNS: InstallStatus[] = [
  "planning",
  "scheduled",
  "in_progress",
  "completed",
  "on_hold",
];

const SOURCE_LABEL: Record<InstallSource, string> = {
  order_won: "From won order",
  followup: "Follow-up",
  rework: "Rework",
  manual_other: "Manual",
};

function fmtDate(s: string | null | undefined, pattern = "MMM dd, yyyy"): string {
  if (!s) return "—";
  try {
    return format(new Date(s), pattern);
  } catch {
    return "—";
  }
}

function teamSwatch(team: InstallTeam | null | undefined): string {
  if (team?.colour) return team.colour;
  if (!team) return "#d1d5db";
  // Deterministic fallback palette keyed off id
  const palette = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];
  let h = 0;
  for (const ch of team.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// ─── Main page ──────────────────────────────────────────────────────

export default function InstallationTimeline() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<"timeline" | "kanban" | "calendar">("timeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [complexityFilter, setComplexityFilter] = useState<string>("all");

  const { data: installations = [], isLoading } = useQuery<Installation[]>({
    queryKey: ["/api/installations"],
  });

  const { data: teams = [] } = useQuery<InstallTeam[]>({
    queryKey: ["/api/install-teams"],
  });

  const filtered = useMemo(() => {
    return installations.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
      if (complexityFilter !== "all" && i.complexity !== complexityFilter) return false;
      return true;
    });
  }, [installations, statusFilter, sourceFilter, complexityFilter]);

  // Team filter applies only after fetching assignments for each install
  // — we defer to the backend filter via queryKey below when this is set.
  const { data: teamFilteredIds } = useQuery<string[]>({
    queryKey: ["/api/installations?teamId=" + teamFilter, teamFilter],
    enabled: teamFilter !== "all",
    queryFn: async () => {
      const res = await fetch(`/api/installations?teamId=${teamFilter}`, { credentials: "include" });
      if (!res.ok) return [];
      const rows: Installation[] = await res.json();
      return rows.map((r) => r.id);
    },
  });

  const finalList = useMemo(() => {
    if (teamFilter === "all" || !teamFilteredIds) return filtered;
    const keep = new Set(teamFilteredIds);
    return filtered.filter((i) => keep.has(i.id));
  }, [filtered, teamFilter, teamFilteredIds]);

  const clearFilters = () => {
    setStatusFilter("all");
    setSourceFilter("all");
    setTeamFilter("all");
    setComplexityFilter("all");
  };
  const hasFilters =
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    teamFilter !== "all" ||
    complexityFilter !== "all";

  // Stats across the filtered set
  const stats = useMemo(() => {
    return {
      total: finalList.length,
      planning: finalList.filter((i) => i.status === "planning").length,
      scheduled: finalList.filter((i) => i.status === "scheduled").length,
      inProgress: finalList.filter((i) => i.status === "in_progress").length,
      completed: finalList.filter((i) => i.status === "completed").length,
      onHold: finalList.filter((i) => i.status === "on_hold").length,
    };
  }, [finalList]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#FFC72C]">Installation Timeline</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Plan and manage installation projects — auto-populated from won orders, with
            room for follow-ups and rework.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/install-teams">
            <Button variant="outline" data-testid="btn-manage-teams">
              <Users className="h-4 w-4 mr-2" />
              Install Teams
            </Button>
          </Link>
          <Button
            onClick={() => setShowNewDialog(true)}
            className="bg-[#FFC72C] hover:bg-[#FFB300] text-black"
            data-testid="btn-new-installation"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Installation
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, tone: "text-[#FFC72C]" },
          { label: "Planning", value: stats.planning, tone: "" },
          { label: "Scheduled", value: stats.scheduled, tone: "text-indigo-600" },
          { label: "In Progress", value: stats.inProgress, tone: "text-blue-600" },
          { label: "Completed", value: stats.completed, tone: "text-green-600" },
          { label: "On Hold", value: stats.onHold, tone: "text-yellow-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter + view bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Source</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger data-testid="filter-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="order_won">From won order</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                  <SelectItem value="manual_other">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Team</Label>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger data-testid="filter-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.region ? ` — ${t.region}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Complexity</Label>
              <Select value={complexityFilter} onValueChange={setComplexityFilter}>
                <SelectTrigger data-testid="filter-complexity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
                <TabsTrigger value="calendar">Team Calendar</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["/api/installations"] })}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main view */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading installations…</CardContent>
        </Card>
      ) : finalList.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <ListChecks className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="font-medium">No installations yet</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Installations appear here automatically when an order is won and
              includes installation. You can also add follow-ups or rework manually.
            </p>
            <Button onClick={() => setShowNewDialog(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" />
              Add installation
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "timeline" ? (
        <TimelineView installs={finalList} onSelect={setSelectedId} />
      ) : viewMode === "kanban" ? (
        <KanbanView installs={finalList} onSelect={setSelectedId} />
      ) : (
        <CalendarView installs={finalList} teams={teams} onSelect={setSelectedId} />
      )}

      {/* Detail drawer */}
      {selectedId && (
        <InstallationDrawer
          installationId={selectedId}
          teams={teams}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* New install dialog */}
      <NewInstallationDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={(id) => {
          setShowNewDialog(false);
          setSelectedId(id);
          qc.invalidateQueries({ queryKey: ["/api/installations"] });
          toast({ title: "Installation created" });
        }}
      />
    </div>
  );
}

// ─── Timeline view ──────────────────────────────────────────────────
// Horizontal bar per installation spanning planned start→end. A simple
// Gantt-ish visualisation keyed off the filtered date window.

function TimelineView({
  installs,
  onSelect,
}: {
  installs: Installation[];
  onSelect: (id: string) => void;
}) {
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const starts = installs
      .map((i) => i.plannedStart)
      .filter(Boolean)
      .map((d) => new Date(d as string));
    const ends = installs
      .map((i) => i.plannedEnd)
      .filter(Boolean)
      .map((d) => new Date(d as string));
    const now = new Date();
    const min = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : now;
    const max = ends.length
      ? new Date(Math.max(...ends.map((d) => d.getTime())))
      : addDays(now, 30);
    const days = Math.max(14, differenceInCalendarDays(max, min) + 3);
    return { minDate: min, maxDate: addDays(min, days), totalDays: days };
  }, [installs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          {fmtDate(minDate.toISOString())} → {fmtDate(maxDate.toISOString())}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {installs.map((i) => {
            const start = i.plannedStart ? new Date(i.plannedStart) : minDate;
            const end = i.plannedEnd ? new Date(i.plannedEnd) : addDays(start, 14);
            const leftPct = Math.max(
              0,
              Math.min(100, (differenceInCalendarDays(start, minDate) / totalDays) * 100),
            );
            const widthPct = Math.max(
              2,
              Math.min(100 - leftPct, (differenceInCalendarDays(end, start) / totalDays) * 100),
            );
            return (
              <div
                key={i.id}
                onClick={() => onSelect(i.id)}
                className="cursor-pointer grid grid-cols-[minmax(200px,240px)_1fr] items-center gap-3 hover:bg-muted/40 p-2 rounded-lg"
                data-testid={`timeline-row-${i.id}`}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{i.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {i.customerName || "—"} · {SOURCE_LABEL[i.source]}
                  </div>
                </div>
                <div className="relative h-8 bg-muted rounded">
                  <div
                    className={`absolute top-0 bottom-0 rounded ${STATUS_DOT[i.status] || "bg-blue-500"} opacity-80`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <div className="flex items-center h-full px-2 text-white text-xs font-medium truncate">
                      {fmtDate(i.plannedStart, "MMM dd")}
                      {" – "}
                      {fmtDate(i.plannedEnd, "MMM dd")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Kanban view ────────────────────────────────────────────────────

function KanbanView({
  installs,
  onSelect,
}: {
  installs: Installation[];
  onSelect: (id: string) => void;
}) {
  const byStatus = useMemo(() => {
    const out: Record<string, Installation[]> = {};
    for (const s of INSTALL_KANBAN_COLUMNS) out[s] = [];
    for (const i of installs) {
      (out[i.status] ||= []).push(i);
    }
    return out;
  }, [installs]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {INSTALL_KANBAN_COLUMNS.map((status) => (
        <div key={status} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            <h3 className="font-semibold capitalize text-sm">{status.replace("_", " ")}</h3>
            <Badge variant="secondary">{byStatus[status]?.length ?? 0}</Badge>
          </div>
          <div className="space-y-2">
            {(byStatus[status] || []).map((i) => (
              <Card
                key={i.id}
                onClick={() => onSelect(i.id)}
                className="cursor-pointer hover:shadow-md transition-shadow"
                data-testid={`kanban-card-${i.id}`}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-medium text-sm truncate">{i.title}</div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {i.complexity}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {i.customerName || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(i.plannedStart, "MMM dd")} → {fmtDate(i.plannedEnd, "MMM dd")}
                  </div>
                  <Progress value={i.progress} className="h-1.5" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Calendar / team capacity view ──────────────────────────────────

function CalendarView({
  installs,
  teams,
  onSelect,
}: {
  installs: Installation[];
  teams: InstallTeam[];
  onSelect: (id: string) => void;
}) {
  // 8-week horizon starting from this week's Monday.
  const weeks = useMemo(() => {
    const out: { start: Date; end: Date; label: string }[] = [];
    let cur = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < 8; i++) {
      const s = new Date(cur.getTime());
      const e = endOfWeek(cur, { weekStartsOn: 1 });
      out.push({ start: s, end: e, label: format(s, "MMM dd") });
      cur = addDays(cur, 7);
    }
    return out;
  }, []);

  // For each install, fetch assignments in one batch via detail cache.
  // To avoid N fetches here, we approximate team allocation using the
  // install's first assigned-phase team (if any). Real assignments show
  // in the drawer. This is a pragmatic v1 — a dedicated
  // /api/install-assignments endpoint is a later optimisation.
  const cellsByTeam = useMemo(() => {
    const byTeam = new Map<string, Map<number, Installation[]>>();
    for (const team of teams) byTeam.set(team.id, new Map());
    const unassignedWeekMap = new Map<number, Installation[]>();
    byTeam.set("__unassigned", unassignedWeekMap);

    for (const inst of installs) {
      const start = inst.plannedStart ? new Date(inst.plannedStart) : null;
      const end = inst.plannedEnd ? new Date(inst.plannedEnd) : null;
      if (!start || !end) continue;

      weeks.forEach((w, idx) => {
        const overlaps = start <= w.end && end >= w.start;
        if (!overlaps) return;
        // Installs without a team assignment go to __unassigned. Team
        // info is not on the list endpoint, so we bucket everything
        // into __unassigned by default and leave richer rendering for
        // the drawer + filter combo.
        const key = "__unassigned";
        const bucket = byTeam.get(key)!;
        const arr = bucket.get(idx) || [];
        arr.push(inst);
        bucket.set(idx, arr);
      });
    }
    return byTeam;
  }, [installs, teams, weeks]);

  const teamsToRender = teams.length > 0 ? teams : ([] as InstallTeam[]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Capacity — next 8 weeks</CardTitle>
        <CardDescription>
          Filter by team above to narrow down. Click a cell to open the installation.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[900px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card z-10 text-left p-2 border-b w-[160px]">Team</th>
              {weeks.map((w) => (
                <th key={w.label} className="p-2 border-b text-left">
                  <div className="text-xs font-normal text-muted-foreground">W/C</div>
                  <div>{w.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teamsToRender.map((team) => (
              <tr key={team.id}>
                <td className="sticky left-0 bg-card z-10 p-2 border-b align-top">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: teamSwatch(team) }}
                    />
                    <div>
                      <div className="font-medium text-sm">{team.name}</div>
                      {team.region && (
                        <div className="text-xs text-muted-foreground">{team.region}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Capacity: {team.capacityJobsPerWeek ?? 3}/wk
                  </div>
                </td>
                {weeks.map((_, idx) => {
                  const list = cellsByTeam.get(team.id)?.get(idx) || [];
                  const load = list.length;
                  const cap = team.capacityJobsPerWeek ?? 3;
                  const pct = Math.min(100, Math.round((load / Math.max(1, cap)) * 100));
                  return (
                    <td key={idx} className="p-1 border-b align-top">
                      <div
                        className="rounded p-1 min-h-[60px]"
                        style={{
                          background: pct > 100 ? "#fee2e2" : pct > 66 ? "#fef3c7" : "#f3f4f6",
                        }}
                      >
                        <div className="text-xs text-muted-foreground">
                          {load}/{cap}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Unassigned row */}
            <tr>
              <td className="sticky left-0 bg-card z-10 p-2 border-b align-top">
                <div className="font-medium text-sm">Unassigned</div>
                <div className="text-xs text-muted-foreground">No team yet</div>
              </td>
              {weeks.map((_, idx) => {
                const list = cellsByTeam.get("__unassigned")?.get(idx) || [];
                return (
                  <td key={idx} className="p-1 border-b align-top">
                    <div className="rounded p-1 min-h-[60px] space-y-1">
                      {list.slice(0, 3).map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => onSelect(inst.id)}
                          className="block w-full text-left text-xs truncate rounded px-1 py-0.5 hover:bg-muted"
                          data-testid={`cal-cell-${inst.id}`}
                        >
                          {inst.title}
                        </button>
                      ))}
                      {list.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{list.length - 3} more
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Detail drawer ──────────────────────────────────────────────────

function InstallationDrawer({
  installationId,
  teams,
  onClose,
}: {
  installationId: string;
  teams: InstallTeam[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: detail, isLoading } = useQuery<InstallationDetail>({
    queryKey: [`/api/installations/${installationId}`],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/installations/${installationId}`] });
    qc.invalidateQueries({ queryKey: ["/api/installations"] });
  };

  const patchInstall = useMutation({
    mutationFn: async (patch: Partial<Installation>) => {
      const res = await apiRequest(`/api/installations/${installationId}`, "PATCH", patch);
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const patchPhase = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Phase> }) => {
      const res = await apiRequest(`/api/installation-phases/${id}`, "PATCH", patch);
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const deletePhase = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/installation-phases/${id}`, "DELETE");
    },
    onSuccess: () => invalidate(),
  });

  const addPhase = useMutation({
    mutationFn: async (body: Partial<Phase>) => {
      const res = await apiRequest(`/api/installations/${installationId}/phases`, "POST", body);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Phase added" });
    },
  });

  const assignTeam = useMutation({
    mutationFn: async (body: { teamId: string; startDate?: string; endDate?: string }) => {
      const res = await apiRequest(
        `/api/installations/${installationId}/assignments`,
        "POST",
        body,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Team assigned" });
    },
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/installation-assignments/${id}`, "DELETE");
    },
    onSuccess: () => invalidate(),
  });

  const addMilestone = useMutation({
    mutationFn: async ({ phaseId, body }: { phaseId: string; body: any }) => {
      const res = await apiRequest(`/api/installation-phases/${phaseId}/milestones`, "POST", body);
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await apiRequest(`/api/installation-milestones/${id}`, "PATCH", { completed });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/installation-milestones/${id}`, "DELETE");
    },
    onSuccess: () => invalidate(),
  });

  return (
    <Sheet open={!!installationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !detail ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <Badge className={STATUS_STYLE[detail.status]}>
                  {detail.status.replace("_", " ")}
                </Badge>
                <span className="truncate">{detail.title}</span>
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4 mt-4">
              {/* Summary */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs">Customer</Label>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {detail.customerName || "—"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Location</Label>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {detail.location || "—"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Contact</Label>
                      <div>{detail.contactName || "—"}</div>
                      {detail.contactEmail && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {detail.contactEmail}
                        </div>
                      )}
                      {detail.contactPhone && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {detail.contactPhone}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Source</Label>
                      <div>{SOURCE_LABEL[detail.source]}</div>
                    </div>
                    <div>
                      <Label className="text-xs">Planned</Label>
                      <div>
                        {fmtDate(detail.plannedStart)} → {fmtDate(detail.plannedEnd)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Complexity</Label>
                      <div className="capitalize">{detail.complexity}</div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Progress</Label>
                    <div className="flex items-center gap-2">
                      <Progress value={detail.progress} className="flex-1" />
                      <span className="text-sm font-medium">{detail.progress}%</span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Select
                      value={detail.status}
                      onValueChange={(v) => patchInstall.mutate({ status: v as InstallStatus })}
                    >
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On hold</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Team assignments */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Team assignments</CardTitle>
                  <TeamAssignControl
                    teams={teams.filter((t) => t.active)}
                    onAssign={(teamId) => assignTeam.mutate({ teamId })}
                  />
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No teams assigned yet.</p>
                  ) : (
                    detail.assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between border rounded p-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ background: teamSwatch(a.team) }}
                          />
                          <div className="text-sm font-medium">
                            {a.team?.name || "Unknown team"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(a.startDate, "MMM dd")} – {fmtDate(a.endDate, "MMM dd")}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAssignment.mutate(a.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Phases */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Phases</CardTitle>
                  <AddPhaseControl onAdd={(body) => addPhase.mutate(body)} />
                </CardHeader>
                <CardContent className="space-y-3">
                  {detail.phases.map((phase) => (
                    <PhaseCard
                      key={phase.id}
                      phase={phase}
                      teams={teams.filter((t) => t.active)}
                      onPatch={(patch) => patchPhase.mutate({ id: phase.id, patch })}
                      onDelete={() => deletePhase.mutate(phase.id)}
                      onAddMilestone={(body) => addMilestone.mutate({ phaseId: phase.id, body })}
                      onToggleMilestone={(id, completed) =>
                        toggleMilestone.mutate({ id, completed })
                      }
                      onDeleteMilestone={(id) => deleteMilestone.mutate(id)}
                    />
                  ))}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <NotesEditor
                    initial={detail.notes || ""}
                    onSave={(notes) => patchInstall.mutate({ notes })}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Phase card ─────────────────────────────────────────────────────

function PhaseCard({
  phase,
  teams,
  onPatch,
  onDelete,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
}: {
  phase: Phase;
  teams: InstallTeam[];
  onPatch: (p: Partial<Phase>) => void;
  onDelete: () => void;
  onAddMilestone: (body: any) => void;
  onToggleMilestone: (id: string, completed: boolean) => void;
  onDeleteMilestone: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);
  const [startDate, setStartDate] = useState(phase.startDate?.slice(0, 10) || "");
  const [endDate, setEndDate] = useState(phase.endDate?.slice(0, 10) || "");
  const [progress, setProgress] = useState(phase.progress);

  useEffect(() => {
    setName(phase.name);
    setStartDate(phase.startDate?.slice(0, 10) || "");
    setEndDate(phase.endDate?.slice(0, 10) || "");
    setProgress(phase.progress);
  }, [phase.id, phase.name, phase.startDate, phase.endDate, phase.progress]);

  const [newMilestone, setNewMilestone] = useState("");

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          ) : (
            <div className="font-medium">{phase.name}</div>
          )}
          {phase.description && !editing && (
            <p className="text-xs text-muted-foreground">{phase.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge className={STATUS_STYLE[phase.status]}>{phase.status.replace("_", " ")}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
            <Edit3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div>
          <Label className="text-xs">Start</Label>
          {editing ? (
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          ) : (
            <div>{fmtDate(phase.startDate, "MMM dd")}</div>
          )}
        </div>
        <div>
          <Label className="text-xs">End</Label>
          {editing ? (
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          ) : (
            <div>{fmtDate(phase.endDate, "MMM dd")}</div>
          )}
        </div>
        <div>
          <Label className="text-xs">Team</Label>
          <Select
            value={phase.assignedTeamId || "none"}
            onValueChange={(v) =>
              onPatch({ assignedTeamId: v === "none" ? null : (v as any) })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={phase.status}
            onValueChange={(v) => onPatch({ status: v as PhaseStatus })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs w-16 shrink-0">Progress</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          onBlur={() => onPatch({ progress })}
          className="h-8 w-20"
        />
        <Progress value={progress} className="flex-1 h-2" />
      </div>

      {editing && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              onPatch({
                name,
                startDate: startDate || null,
                endDate: endDate || null,
              });
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={onDelete}>
            Delete phase
          </Button>
        </div>
      )}

      {/* Milestones */}
      <div className="pt-2 border-t">
        <div className="text-xs font-medium text-muted-foreground mb-1">Milestones</div>
        <div className="space-y-1">
          {(phase.milestones || []).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={m.completed}
                onCheckedChange={(c) => onToggleMilestone(m.id, !!c)}
              />
              <span className={m.completed ? "line-through text-muted-foreground" : ""}>
                {m.name}
              </span>
              {m.date && (
                <span className="text-xs text-muted-foreground">({fmtDate(m.date, "MMM dd")})</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 w-6 p-0"
                onClick={() => onDeleteMilestone(m.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Add milestone…"
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!newMilestone.trim()) return;
              onAddMilestone({ name: newMilestone.trim() });
              setNewMilestone("");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Small building blocks ──────────────────────────────────────────

function TeamAssignControl({
  teams,
  onAssign,
}: {
  teams: InstallTeam[];
  onAssign: (teamId: string) => void;
}) {
  const [value, setValue] = useState<string>("");
  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Assign team…" />
        </SelectTrigger>
        <SelectContent>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          if (!value) return;
          onAssign(value);
          setValue("");
        }}
      >
        Add
      </Button>
    </div>
  );
}

function AddPhaseControl({ onAdd }: { onAdd: (body: any) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Phase
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add phase</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!name.trim()) return;
                onAdd({ name: name.trim(), description });
                setName("");
                setDescription("");
                setOpen(false);
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotesEditor({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Add notes on access constraints, site contacts, risks…"
      />
      <Button size="sm" variant="secondary" onClick={() => onSave(value)}>
        Save notes
      </Button>
    </div>
  );
}

// ─── New installation dialog ────────────────────────────────────────

function NewInstallationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [customerName, setCustomerName] = useState("");
  const [location, setLocation] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [source, setSource] = useState<InstallSource>("followup");
  const [complexity, setComplexity] = useState<"simple" | "standard" | "complex">("standard");
  const [plannedStart, setPlannedStart] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setProjectId("none");
      setCustomerName("");
      setLocation("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setSource("followup");
      setComplexity("standard");
      setPlannedStart("");
      setNotes("");
    }
  }, [open]);

  const create = useMutation<Installation, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("/api/installations", "POST", {
        title,
        projectId: projectId === "none" ? null : projectId,
        customerName: customerName || null,
        location: location || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        source,
        complexity,
        plannedStart: plannedStart || null,
        notes: notes || null,
      });
      return (await res.json()) as Installation;
    },
    onSuccess: (row) => onCreated(row.id),
    onError: (e) => toast({ title: "Failed to create", description: String(e?.message || e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New installation</DialogTitle>
          <DialogDescription>
            For follow-ups, rework, or any install not yet on an order. Default phases are
            seeded — you can edit them after creating.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Warehouse 2 — post-impact repair"
              data-testid="input-new-title"
            />
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as InstallSource)}>
              <SelectTrigger data-testid="select-new-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="rework">Rework</SelectItem>
                <SelectItem value="manual_other">Other (manual)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Complexity</Label>
            <Select value={complexity} onValueChange={(v) => setComplexity(v as any)}>
              <SelectTrigger data-testid="select-new-complexity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="complex">Complex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Link to project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="No project link" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project link</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.customerCompany?.name ? ` — ${p.customerCompany.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <Label>Contact name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label>Contact email</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Contact phone</Label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div>
            <Label>Planned start</Label>
            <Input
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="bg-[#FFC72C] hover:bg-[#FFB300] text-black"
            data-testid="btn-submit-new"
          >
            {create.isPending ? "Creating…" : "Create installation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
