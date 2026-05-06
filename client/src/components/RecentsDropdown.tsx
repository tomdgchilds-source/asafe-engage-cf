import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Clock, History, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useRecents } from "@/hooks/useRecents";
import { iconFor } from "@/lib/recentsRoutes";

type Variant = "desktop" | "mobile";

interface RecentsDropdownProps {
  variant?: Variant;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function RecentsDropdown({ variant = "desktop" }: RecentsDropdownProps) {
  const { entries, clear, remove } = useRecents();
  const [open, setOpen] = useState(false);

  // Memoise the rendered list so we don't recreate row components every
  // render (popover stays mounted while open).
  const rows = useMemo(() => {
    return entries.map((entry) => {
      const Icon = iconFor(entry.iconName);
      return { ...entry, Icon };
    });
  }, [entries]);

  const triggerSize = variant === "mobile" ? "p-1.5 sm:p-2" : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative hover:bg-muted hover:text-primary touch-manipulation",
            triggerSize,
          )}
          aria-label="Recently visited pages"
          data-testid={`recents-trigger-${variant}`}
        >
          <History className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="recents-popover"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recents</h3>
            {rows.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({rows.length})
              </span>
            )}
          </div>
          {rows.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={clear}
              data-testid="recents-clear"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No recent pages yet
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Pages you visit will appear here for quick navigation.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <ul className="py-1">
              {rows.map((row) => (
                <li
                  key={row.path}
                  className="group flex items-center hover:bg-muted/50 transition-colors"
                >
                  <Link
                    href={row.path}
                    className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5"
                    onClick={() => setOpen(false)}
                    data-testid={`recents-item-${row.path}`}
                  >
                    <row.Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {row.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {row.path}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {formatRelative(row.visitedAt)}
                    </span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 mr-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(row.path);
                    }}
                    aria-label={`Remove ${row.title} from recents`}
                    data-testid={`recents-remove-${row.path}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
