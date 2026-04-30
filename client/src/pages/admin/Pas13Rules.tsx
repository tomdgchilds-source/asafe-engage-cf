/**
 * /admin/pas13-rules
 *
 * Admin-only editor for the BITA-style PAS 13 vehicle classification
 * thresholds (T1..T4). Rows live in the `pas13_vehicle_classes` table; the
 * worker preloads them at cold-start and `classifyVehicle()` reads through
 * to the active table at runtime.
 *
 * The standard does NOT publish a numbered taxonomy (see comments in
 * shared/pas13Rules.ts) — the seed values are σ subagent's pragmatic
 * stand-in. This page exists so A-SAFE engineering can refine the bands
 * without a code change.
 *
 * UI: shadcn `<Table>` of editable rows + a single "Save changes" button
 * that bulk-upserts the rows whose form state diverges from the loaded
 * snapshot. No row delete; admins can widen a class's bounds to neutralise
 * it but classCodes are intentionally sticky (existing pas13Verdict outputs
 * already reference T1..T4 in chat history / saved orders).
 *
 * Empty / blank max fields render as "∞" and submit as null — that's the
 * convention used by the heaviest row (T4) for an open-ended class.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Save, Undo2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Pas13ClassRow {
  id: string;
  classCode: string;
  massMinKg: number;
  massMaxKg: number | null;
  speedMinKmh: number;
  speedMaxKmh: number | null;
  description: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface ListResponse {
  rows: Pas13ClassRow[];
  bootstrapNeeded?: boolean;
  message?: string;
}

// Form-shape mirrors Pas13ClassRow but every numeric is a string so the
// `<Input>` controls handle empty / partially-typed values cleanly. Empty
// max fields submit as null.
interface FormRow {
  id: string;
  classCode: string;
  massMinKg: string;
  massMaxKg: string;
  speedMinKmh: string;
  speedMaxKmh: string;
  description: string;
}

function rowToForm(r: Pas13ClassRow): FormRow {
  return {
    id: r.id,
    classCode: r.classCode,
    massMinKg: String(r.massMinKg ?? 0),
    massMaxKg: r.massMaxKg === null || r.massMaxKg === undefined ? "" : String(r.massMaxKg),
    speedMinKmh: String(r.speedMinKmh ?? 0),
    speedMaxKmh: r.speedMaxKmh === null || r.speedMaxKmh === undefined ? "" : String(r.speedMaxKmh),
    description: r.description ?? "",
  };
}

function formsEqual(a: FormRow, b: FormRow): boolean {
  return (
    a.classCode === b.classCode &&
    a.massMinKg === b.massMinKg &&
    a.massMaxKg === b.massMaxKg &&
    a.speedMinKmh === b.speedMinKmh &&
    a.speedMaxKmh === b.speedMaxKmh &&
    a.description === b.description
  );
}

export default function Pas13Rules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listQuery = useQuery<ListResponse>({
    queryKey: ["/api/admin/pas13-vehicle-classes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pas13-vehicle-classes", {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(`Failed to load PAS 13 classes (${res.status})`);
      return res.json();
    },
  });

  // Local form state, indexed by classCode. Initialised from the server
  // snapshot on every fresh load so external edits show up.
  const [forms, setForms] = useState<Record<string, FormRow>>({});
  const [snapshot, setSnapshot] = useState<Record<string, FormRow>>({});

  useEffect(() => {
    const rows = listQuery.data?.rows ?? [];
    if (rows.length === 0) return;
    const next: Record<string, FormRow> = {};
    for (const r of rows) next[r.classCode] = rowToForm(r);
    setForms(next);
    setSnapshot(next);
  }, [listQuery.data]);

  const dirtyCodes = useMemo(() => {
    const codes: string[] = [];
    for (const code of Object.keys(forms)) {
      const f = forms[code];
      const s = snapshot[code];
      if (!s) {
        codes.push(code);
        continue;
      }
      if (!formsEqual(f, s)) codes.push(code);
    }
    return codes;
  }, [forms, snapshot]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate the dirty rows client-side so the user gets a single
      // toast pointing at the bad cell rather than five round-trip 400s.
      const payload: Array<{
        classCode: string;
        massMinKg: number;
        massMaxKg: number | null;
        speedMinKmh: number;
        speedMaxKmh: number | null;
        description: string;
      }> = [];
      for (const code of dirtyCodes) {
        const f = forms[code];
        const massMin = Number(f.massMinKg);
        const speedMin = Number(f.speedMinKmh);
        const massMax = f.massMaxKg.trim() === "" ? null : Number(f.massMaxKg);
        const speedMax =
          f.speedMaxKmh.trim() === "" ? null : Number(f.speedMaxKmh);
        if (!Number.isFinite(massMin) || massMin < 0) {
          throw new Error(`${code}: mass min must be ≥ 0`);
        }
        if (massMax !== null && (!Number.isFinite(massMax) || massMax <= massMin)) {
          throw new Error(
            `${code}: mass max must be > mass min (or blank for open-ended)`,
          );
        }
        if (!Number.isFinite(speedMin) || speedMin < 0) {
          throw new Error(`${code}: speed min must be ≥ 0`);
        }
        if (
          speedMax !== null &&
          (!Number.isFinite(speedMax) || speedMax <= speedMin)
        ) {
          throw new Error(
            `${code}: speed max must be > speed min (or blank for open-ended)`,
          );
        }
        payload.push({
          classCode: code,
          massMinKg: massMin,
          massMaxKg: massMax,
          speedMinKmh: speedMin,
          speedMaxKmh: speedMax,
          description: f.description,
        });
      }

      const res = await fetch("/api/admin/pas13-vehicle-classes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || `Save failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/pas13-vehicle-classes"],
      });
      const accepted = Array.isArray(data?.accepted) ? data.accepted.length : 0;
      const rejected = Array.isArray(data?.rejected) ? data.rejected.length : 0;
      toast({
        title:
          rejected > 0
            ? `Saved ${accepted}, rejected ${rejected}`
            : `Saved ${accepted} ${accepted === 1 ? "class" : "classes"}`,
        description: rejected
          ? data.rejected
              .map((r: any) => `${r.classCode}: ${r.reason}`)
              .join("; ")
          : "PAS 13 classifier will use the new thresholds on its next call.",
        variant: rejected > 0 ? "destructive" : undefined,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save thresholds",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bootstrapNeeded = listQuery.data?.bootstrapNeeded === true;

  if (listQuery.isLoading) {
    return (
      <div
        className="container mx-auto p-6"
        data-testid="admin-pas13-rules-loading"
      >
        <div className="text-sm text-muted-foreground">Loading PAS 13 thresholds…</div>
      </div>
    );
  }

  return (
    <div
      className="container mx-auto p-6 space-y-6"
      data-testid="admin-pas13-rules"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          PAS 13 Vehicle Classification Thresholds
        </h1>
        <p className="text-sm text-muted-foreground">
          T1..T4 mass / speed bands consumed by{" "}
          <code className="text-xs">classifyVehicle()</code>. PAS 13:2017 does
          not publish a numbered taxonomy — these values are A-SAFE engineering
          conventions, editable per environment.
        </p>
      </div>

      {bootstrapNeeded && (
        <Card className="border-amber-500/40 bg-amber-50/40">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-base">Schema not applied yet</CardTitle>
              <CardDescription>
                Run{" "}
                <code className="text-xs">
                  POST /api/admin/apply-pas13-classes-schema
                </code>{" "}
                with the migration token before editing.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Vehicle classes</CardTitle>
            <CardDescription>
              Leave a "max" cell blank for an open-ended class (rendered as ∞).
              Editing a row marks it dirty; "Save changes" bulk-upserts every
              dirty row in one request.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={dirtyCodes.length === 0 || saveMutation.isPending}
              onClick={() => setForms(snapshot)}
              data-testid="admin-pas13-rules-revert"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Revert
            </Button>
            <Button
              disabled={dirtyCodes.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="bg-primary text-black hover:bg-yellow-400"
              data-testid="admin-pas13-rules-save"
            >
              <Save className="h-4 w-4 mr-2" />
              Save changes
              {dirtyCodes.length > 0 && (
                <span className="ml-2 rounded bg-black/10 px-1.5 text-xs font-mono">
                  {dirtyCodes.length}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(forms).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No vehicle classes loaded. Apply the schema first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Code</TableHead>
                  <TableHead className="text-right w-[110px]">Mass min (kg)</TableHead>
                  <TableHead className="text-right w-[110px]">Mass max (kg)</TableHead>
                  <TableHead className="text-right w-[110px]">Speed min (km/h)</TableHead>
                  <TableHead className="text-right w-[110px]">Speed max (km/h)</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(forms)
                  .sort(
                    (a, b) => Number(a.massMinKg || 0) - Number(b.massMinKg || 0),
                  )
                  .map((f) => {
                    const isDirty = dirtyCodes.includes(f.classCode);
                    const update = (patch: Partial<FormRow>) =>
                      setForms((prev) => ({
                        ...prev,
                        [f.classCode]: { ...prev[f.classCode], ...patch },
                      }));
                    return (
                      <TableRow
                        key={f.classCode}
                        className={isDirty ? "bg-amber-50/50" : ""}
                        data-testid={`admin-pas13-class-row-${f.classCode}`}
                      >
                        <TableCell className="font-mono font-semibold">
                          {f.classCode}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={f.massMinKg}
                            onChange={(e) =>
                              update({ massMinKg: e.target.value })
                            }
                            className="text-right h-8 font-mono text-sm"
                            data-testid={`admin-pas13-mass-min-${f.classCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder="∞"
                            value={f.massMaxKg}
                            onChange={(e) =>
                              update({ massMaxKg: e.target.value })
                            }
                            className="text-right h-8 font-mono text-sm"
                            data-testid={`admin-pas13-mass-max-${f.classCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.1"
                            value={f.speedMinKmh}
                            onChange={(e) =>
                              update({ speedMinKmh: e.target.value })
                            }
                            className="text-right h-8 font-mono text-sm"
                            data-testid={`admin-pas13-speed-min-${f.classCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.1"
                            placeholder="∞"
                            value={f.speedMaxKmh}
                            onChange={(e) =>
                              update({ speedMaxKmh: e.target.value })
                            }
                            className="text-right h-8 font-mono text-sm"
                            data-testid={`admin-pas13-speed-max-${f.classCode}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={f.description}
                            onChange={(e) =>
                              update({ description: e.target.value })
                            }
                            className="h-8 text-sm"
                            data-testid={`admin-pas13-description-${f.classCode}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Boundary semantic: a value equal to a class's max sits in that class but{" "}
        <code>conservativeClass = true</code> bumps the verdict to the next
        heavier class (see comments in <code>shared/pas13Rules.ts</code>).
      </p>
    </div>
  );
}
