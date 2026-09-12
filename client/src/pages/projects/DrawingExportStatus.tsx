/**
 * Export status chip + actions for one layout drawing on the project
 * detail page (Phase 4 Task L5, client half).
 *
 * Reads GET /api/layout-drawings/:id/export (404 = never exported, which
 * we treat as data, not an error), shows "Export up to date" / "Export
 * stale" / "Not exported", and offers "Export sheet" (POST, then refetch)
 * plus an "Open sheet" link to the stored PDF when one exists.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  exportButtonLabel,
  exportChip,
  exportSheetUrl,
  type DrawingExportStatus as ExportStatus,
} from "./drawingExport";

export function exportStatusQueryKey(drawingId: string) {
  return [`/api/layout-drawings/${drawingId}/export`] as const;
}

async function fetchExportStatus(drawingId: string): Promise<ExportStatus | null> {
  const res = await fetch(`/api/layout-drawings/${drawingId}/export`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(res.status, (await res.text()) || res.statusText);
  }
  return (await res.json()) as ExportStatus;
}

export function DrawingExportStatus({
  drawingId,
  className,
}: {
  drawingId: string;
  className?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = exportStatusQueryKey(drawingId);

  const { data: status, isLoading, isError } = useQuery<ExportStatus | null>({
    queryKey,
    queryFn: () => fetchExportStatus(drawingId),
    // A 404 is already mapped to null; anything else is a real failure.
    retry: false,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/layout-drawings/${drawingId}/export`, "POST");
      return (await res.json()) as ExportStatus;
    },
    onSuccess: (result) => {
      // Seed the cache with the fresh status so the chip flips immediately,
      // then refetch to confirm against the server.
      queryClient.setQueryData(queryKey, result);
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Sheet exported",
        description: `Drawing sheet v${result.version} is ready to open.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Export failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const chip = exportChip(status);
  const url = exportSheetUrl(status);
  const pending = exportMutation.isPending;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-testid={`drawing-export-${drawingId}`}
    >
      {isLoading ? (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking export
        </Badge>
      ) : isError ? (
        <Badge variant="outline" className="text-destructive">
          Export status unavailable
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className={chip.className}
          data-testid={`drawing-export-chip-${chip.state}`}
        >
          {chip.label}
        </Badge>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        disabled={pending || isLoading}
        onClick={() => exportMutation.mutate()}
        data-testid={`button-export-sheet-${drawingId}`}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
        {exportButtonLabel(status, pending)}
      </Button>

      {url && (
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5"
          data-testid={`link-open-sheet-${drawingId}`}
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open sheet
          </a>
        </Button>
      )}
    </div>
  );
}
