/**
 * /admin/migrations
 *
 * Lists every schema migration bundled in migrations/ with its status from
 * the schema_migrations table, and applies the pending ones in order. This
 * replaces the old MIGRATION_TOKEN-gated apply-*-schema endpoints: there is
 * no local database and nobody runs psql, so schema changes ship as .sql
 * files and are applied from here after deploy.
 *
 * If the Worker has a MIGRATION_TOKEN secret, the apply call needs it as a
 * bearer token in addition to the admin session; the page asks for it.
 */

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Database, Play, RefreshCw } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MigrationRow {
  id: string;
  appliedHistorically: boolean;
  statementCount: number;
  status: "applied" | "pending";
  appliedAt: string | null;
  appliedBy: string | null;
  note: string | null;
}

interface MigrationsResponse {
  migrations: MigrationRow[];
  pending: number;
  tokenRequired: boolean;
}

interface ApplyLogEntry {
  id: string;
  status: "applied" | "failed" | "skipped";
  statements: number;
  ms: number;
  error?: string;
}

interface ApplyResponse {
  ok: boolean;
  applied?: number;
  message?: string;
  log: ApplyLogEntry[];
}

function StatusChip({ status }: { status: MigrationRow["status"] }) {
  return status === "applied" ? (
    <Badge variant="secondary">Applied</Badge>
  ) : (
    <Badge variant="destructive">Pending</Badge>
  );
}

function LogChip({ status }: { status: ApplyLogEntry["status"] }) {
  if (status === "applied") return <Badge variant="secondary">applied</Badge>;
  if (status === "failed") return <Badge variant="destructive">failed</Badge>;
  return <Badge variant="outline">skipped</Badge>;
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export default function Migrations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [log, setLog] = useState<ApplyLogEntry[] | null>(null);

  const listQuery = useQuery<MigrationsResponse>({
    queryKey: ["/api/admin/migrations"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const apply = useMutation<ApplyResponse, Error>({
    mutationFn: async () => {
      const headers: Record<string, string> = {};
      if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
      const res = await fetch("/api/admin/migrations/apply", {
        method: "POST",
        headers,
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ApplyResponse>;
      if (res.status === 401 || res.status === 403) {
        throw new Error(body.message || `Rejected (${res.status})`);
      }
      return { ok: Boolean(body.ok), applied: body.applied, message: body.message, log: body.log ?? [] };
    },
    onSuccess: (data) => {
      setLog(data.log);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/migrations"] });
      toast({
        title: data.ok
          ? `Applied ${data.applied ?? 0} migration${data.applied === 1 ? "" : "s"}`
          : "Migration run stopped on a failure",
        description: data.ok
          ? "schema_migrations updated."
          : data.message || "See the log below for the failing statement.",
        variant: data.ok ? undefined : "destructive",
      });
    },
    onError: (err) => {
      toast({ title: "Could not apply", description: err.message, variant: "destructive" });
    },
  });

  const rows = listQuery.data?.migrations ?? [];
  const pending = listQuery.data?.pending ?? 0;
  const tokenRequired = listQuery.data?.tokenRequired ?? false;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="admin-migrations">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          Schema migrations
        </h1>
        <p className="text-sm text-muted-foreground">
          SQL files bundled from <code className="text-xs">migrations/</code>, applied in
          order and recorded in <code className="text-xs">schema_migrations</code>. Every
          statement is idempotent, so re-applying is a no-op.
        </p>
      </div>

      {listQuery.error && (
        <Card className="border-destructive/40">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-base">Could not load migrations</CardTitle>
              <CardDescription>{(listQuery.error as Error).message}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Apply pending
            </CardTitle>
            <CardDescription>
              {pending === 0
                ? "Nothing pending — the database matches the bundled migrations."
                : `${pending} migration${pending === 1 ? "" : "s"} pending. Each file runs in its own transaction; a failure stops the run.`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tokenRequired && (
              <Input
                type="password"
                placeholder="MIGRATION_TOKEN"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-56"
                data-testid="input-migration-token"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${listQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => apply.mutate()}
              disabled={apply.isPending || pending === 0 || (tokenRequired && !token.trim())}
              data-testid="button-apply-migrations"
            >
              <Play className="h-4 w-4 mr-1" />
              {apply.isPending ? "Applying…" : "Apply pending"}
            </Button>
          </div>
        </CardHeader>
        {log && (
          <CardContent>
            <div className="text-sm font-medium mb-2">Last run</div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Migration</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Statements</TableHead>
                    <TableHead className="text-right">ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        Nothing to apply.
                      </TableCell>
                    </TableRow>
                  )}
                  {log.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.id}
                        {entry.error && (
                          <pre className="mt-1 whitespace-pre-wrap text-destructive">{entry.error}</pre>
                        )}
                      </TableCell>
                      <TableCell><LogChip status={entry.status} /></TableCell>
                      <TableCell className="text-right">{entry.statements}</TableCell>
                      <TableCell className="text-right">{entry.ms}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All migrations</CardTitle>
          <CardDescription>
            {rows.length} file{rows.length === 1 ? "" : "s"} bundled. "historical" rows ran
            through the old apply-*-schema endpoints before this page existed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Migration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Statements</TableHead>
                    <TableHead>Applied at</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => (
                    <TableRow key={m.id} data-testid={`row-migration-${m.id}`}>
                      <TableCell className="font-mono text-xs">{m.id}</TableCell>
                      <TableCell><StatusChip status={m.status} /></TableCell>
                      <TableCell className="text-right">{m.statementCount}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(m.appliedAt)}</TableCell>
                      <TableCell>{m.appliedBy ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.note ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
