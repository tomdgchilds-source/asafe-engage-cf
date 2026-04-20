import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Tag, TrendingUp, AlertTriangle, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Shape returned by GET /api/admin/partner-codes. Mirrors the
 * partner_codes table + is kept loose on numeric/date fields because the
 * Cloudflare Worker serialises everything as JSON.
 */
interface PartnerCode {
  id: string;
  code: string;
  partnerName: string;
  discountPercent: number;
  validFrom: string | null;
  validTo: string | null;
  usageCap: number | null;
  usageCount: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Short helper — turns an ISO string into a local "Apr 18, 2026" style date. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Decide the "Status" badge for a partner code. Order matters — inactive
 * and expired take precedence over exhausted because a deactivated code
 * that happens to also be at cap should still read as "Inactive".
 */
function statusOf(
  code: PartnerCode,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string } {
  if (!code.isActive) {
    return { label: "Inactive", variant: "secondary" };
  }
  if (code.validTo && new Date(code.validTo) < new Date()) {
    return { label: "Expired", variant: "destructive" };
  }
  if (code.usageCap !== null && code.usageCount >= code.usageCap) {
    return { label: "Exhausted", variant: "outline", className: "text-amber-600 border-amber-500" };
  }
  return { label: "Active", variant: "default", className: "bg-emerald-600 text-white hover:bg-emerald-600" };
}

export function PartnerCodesTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Controlled form state for the "new code" dialog. Kept as a single
  // object for an easy reset on close.
  const emptyForm = {
    code: "",
    partnerName: "",
    discountPercent: "",
    usageCap: "",
    validFrom: "",
    validTo: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const listQuery = useQuery<PartnerCode[]>({
    queryKey: ["/api/admin/partner-codes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/partner-codes", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load partner codes (${res.status})`);
      return res.json();
    },
  });

  const codes = listQuery.data ?? [];

  // Cheap summary stats — all derived on the client because the list is
  // always short (we don't expect hundreds of partner codes).
  const stats = useMemo(() => {
    const active = codes.filter((c) => c.isActive).length;
    const redemptions = codes.reduce((n, c) => n + (c.usageCount ?? 0), 0);
    const nearingCap = codes.filter(
      (c) =>
        c.isActive &&
        c.usageCap !== null &&
        c.usageCount >= c.usageCap * 0.8 &&
        c.usageCount < c.usageCap,
    ).length;
    return { active, redemptions, nearingCap };
  }, [codes]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const discountPercent = Number(form.discountPercent);
      const usageCap = form.usageCap.trim() ? Number(form.usageCap) : null;
      const body = {
        code: form.code.trim().toUpperCase(),
        partnerName: form.partnerName.trim(),
        discountPercent,
        usageCap,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        notes: form.notes.trim() || null,
      };

      if (!body.code || !body.partnerName || !Number.isFinite(discountPercent)) {
        throw new Error("Code, partner name, and discount % are required.");
      }
      if (discountPercent < 1 || discountPercent > 35) {
        throw new Error("Discount % must be between 1 and 35.");
      }
      if (usageCap !== null && (!Number.isFinite(usageCap) || usageCap < 1)) {
        throw new Error("Usage cap must be a positive integer (or blank for unlimited).");
      }
      if (body.validFrom && body.validTo && new Date(body.validFrom) > new Date(body.validTo)) {
        throw new Error("Valid-from date must be earlier than valid-to.");
      }

      const res = await fetch("/api/admin/partner-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Create failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-codes"] });
      setForm(emptyForm);
      setIsDialogOpen(false);
      toast({ title: "Partner code created", description: "The code is now active." });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't create code",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Atomic toggle. We invalidate the list on success so counts + status
  // badges refresh. On failure we refetch anyway so the UI re-syncs with
  // the actual server state.
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/partner-codes/${id}/active`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error(`Toggle failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-codes"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-codes"] });
      toast({
        title: "Couldn't change status",
        description: "The list has been refreshed with the server state.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4" data-testid="admin-partner-codes-tab">
      {/* ── Summary strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active codes</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              {codes.length - stats.active} inactive
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total redemptions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.redemptions}</div>
            <p className="text-xs text-muted-foreground">All-time across all codes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nearing cap</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.nearingCap}</div>
            <p className="text-xs text-muted-foreground">Codes at ≥80% of their usage cap</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Main table ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Partner codes</CardTitle>
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="bg-primary text-black hover:bg-yellow-400"
            data-testid="admin-create-partner-code"
          >
            <Plus className="h-4 w-4 mr-2" />
            New partner code
          </Button>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading partner codes…
            </div>
          ) : codes.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Tag className="h-8 w-8 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">No partner codes yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first code to hand out to channel partners.
                </p>
              </div>
              <Button
                onClick={() => setIsDialogOpen(true)}
                className="bg-primary text-black hover:bg-yellow-400"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create partner code
              </Button>
            </div>
          ) : (
            <TooltipProvider delayDuration={150}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="w-[160px]">Usage</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => {
                    const status = statusOf(code);
                    const usagePct =
                      code.usageCap !== null && code.usageCap > 0
                        ? Math.min(100, Math.round((code.usageCount / code.usageCap) * 100))
                        : 0;
                    const usageColourClass =
                      usagePct >= 100
                        ? "[&>div]:bg-red-500"
                        : usagePct >= 80
                          ? "[&>div]:bg-amber-500"
                          : "";
                    return (
                      <TableRow
                        key={code.id}
                        data-testid={`admin-partner-code-row-${code.id}`}
                      >
                        <TableCell className="font-mono text-xs">{code.code}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>{code.partnerName}</span>
                            {code.notes && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {code.notes}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {code.discountPercent}%
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              {code.usageCount}
                              {" / "}
                              {code.usageCap === null ? "∞" : code.usageCap}
                            </div>
                            {code.usageCap !== null && (
                              <Progress
                                value={usagePct}
                                className={`h-1.5 ${usageColourClass}`}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {code.validFrom || code.validTo ? (
                            <>
                              {fmtDate(code.validFrom)} – {fmtDate(code.validTo)}
                            </>
                          ) : (
                            <span className="text-muted-foreground">Always</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={status.variant}
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtDate(code.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={code.isActive}
                            disabled={toggleMutation.isPending}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: code.id, isActive: checked })
                            }
                            data-testid={`admin-partner-code-toggle-${code.id}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* ── Create dialog ──────────────────────────────────────────── */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setForm(emptyForm);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New partner code</DialogTitle>
            <DialogDescription>
              Codes are case-insensitive. Leave usage cap blank for unlimited.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="pc-code">Code</Label>
                <Input
                  id="pc-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  onBlur={(e) => setForm({ ...form, code: e.target.value.trim().toUpperCase() })}
                  placeholder="GULF-SAFETY-2026"
                  required
                  data-testid="admin-partner-code-field-code"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="pc-partner">Partner name</Label>
                <Input
                  id="pc-partner"
                  value={form.partnerName}
                  onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                  placeholder="Gulf Safety Partners"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-pct">Discount %</Label>
                <Input
                  id="pc-pct"
                  type="number"
                  min={1}
                  max={35}
                  step={1}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  placeholder="10"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  1–35. Applied amount is capped to 15% per order regardless.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-cap">Usage cap</Label>
                <Input
                  id="pc-cap"
                  type="number"
                  min={1}
                  step={1}
                  value={form.usageCap}
                  onChange={(e) => setForm({ ...form, usageCap: e.target.value })}
                  placeholder="Unlimited"
                />
                <p className="text-[11px] text-muted-foreground">Blank = unlimited.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-from">Valid from</Label>
                <Input
                  id="pc-from"
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-to">Valid to</Label>
                <Input
                  id="pc-to"
                  type="date"
                  value={form.validTo}
                  onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="pc-notes">Notes</Label>
                <Textarea
                  id="pc-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Internal context for sales ops (not shown to customers)."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-primary text-black hover:bg-yellow-400"
                data-testid="admin-partner-code-submit"
              >
                {createMutation.isPending ? "Creating…" : "Create code"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
