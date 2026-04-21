import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  ChevronDown,
  Plus,
  Settings2,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, CustomerCompany, ProjectContact } from "@shared/schema";
import { NewProjectDialog } from "@/components/NewProjectDialog";

type ProjectWithCustomer = Project & {
  customerCompany: CustomerCompany | null;
};
type ActiveProject =
  | (Project & {
      customerCompany: CustomerCompany | null;
      contacts: ProjectContact[];
    })
  | null;

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  won: {
    label: "Won",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  lost: {
    label: "Lost",
    className: "bg-rose-100 text-rose-800 border-rose-200",
  },
  on_hold: {
    label: "On hold",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
};

/**
 * Header chip that shows the active customer + project and, when clicked,
 * opens a compact picker for switching / creating projects.
 */
export function ProjectSwitcher() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: active } = useQuery<ActiveProject>({
    queryKey: ["/api/active-project"],
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });

  const { data: projects = [] } = useQuery<ProjectWithCustomer[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated && open, // lazy — only when popover opens
    staleTime: 30_000,
  });

  const switchActive = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiRequest("/api/active-project", "POST", { projectId });
      return (await res.json()) as ActiveProject;
    },
    onSuccess: (fresh) => {
      // Invalidate every query that keys off the active project. The
      // Cart page, OrderForm, Dashboard, and Project Cart all snapshot
      // company data per-project, so they need to refetch on switch
      // — otherwise the header says "dp world" while the cart still
      // shows dnata.
      queryClient.invalidateQueries({ queryKey: ["/api/active-project"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart-project-info"] });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return (
            typeof k === "string" &&
            (k.startsWith("/api/projects/") ||
              k.startsWith("/api/orders") ||
              k.startsWith("/api/site-surveys") ||
              k.startsWith("/api/layout-drawings"))
          );
        },
      });
      setOpen(false);
      toast({
        title: "Switched project",
        description: fresh?.name
          ? `Now working on ${fresh.name}`
          : "Active project updated.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not switch project",
        description:
          error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => {
      const aT = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
      const bT = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
      return bT - aT;
    });
    const scoped = needle
      ? sorted.filter((p) => {
          const custName = p.customerCompany?.name?.toLowerCase() ?? "";
          return (
            p.name.toLowerCase().includes(needle) ||
            custName.includes(needle)
          );
        })
      : sorted;
    return scoped.slice(0, 10);
  }, [projects, search]);

  if (!isAuthenticated) return null;

  // Empty state — no project ever created
  if (!active) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="hidden md:flex items-center gap-1.5 border-[#FFC72C] text-foreground hover:bg-[#FFC72C]/10 min-h-[40px]"
          data-testid="button-setup-project"
        >
          <Plus className="h-4 w-4" />
          Set up project
        </Button>
        <NewProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
    );
  }

  const customer = active.customerCompany;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center rounded-full",
              "bg-primary/10 dark:bg-primary/20 border border-primary/30",
              "hover:bg-primary/20 transition-colors",
              "min-h-[44px] md:min-h-[40px]",
              // Compact on mobile: just the logo chip + tiny chevron, tap
              // targets still 44x44. Grows on md+ to show the two-line
              // project/company block.
              "gap-1 pl-1 pr-1.5 py-0.5 sm:gap-2 sm:pl-1.5 sm:pr-2 sm:py-1",
            )}
            data-testid="project-switcher-trigger"
            aria-label={`Switch project — currently ${customer?.name || active.name}`}
          >
            <CustomerAvatar
              name={customer?.name ?? active.name}
              logoUrl={customer?.logoUrl ?? null}
              size={28}
            />
            {/* Text block hidden below md so the switcher fits in the
                mobile header alongside the currency selector + cart. */}
            <div className="hidden md:flex flex-col leading-tight text-left max-w-[160px]">
              <span className="text-xs font-semibold text-foreground truncate">
                {customer?.name || "No customer"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {active.name}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[320px] max-w-[calc(100vw-1rem)] p-0 overflow-hidden"
        >
          <div className="p-3 pb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Working on
            </p>
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              data-testid="input-project-search"
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto px-1 pb-1">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground px-3 py-4 text-center">
                {projects.length === 0
                  ? "No projects yet."
                  : "No matches."}
              </div>
            ) : (
              filtered.map((p) => {
                const isActive = p.id === active.id;
                const meta = STATUS_META[p.status ?? "active"];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => switchActive.mutate(p.id)}
                    disabled={switchActive.isPending}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left min-h-[44px]",
                      "hover:bg-muted transition-colors",
                      isActive && "bg-[#FFC72C]/10",
                    )}
                    data-testid={`switch-to-${p.id}`}
                  >
                    <CustomerAvatar
                      name={p.customerCompany?.name ?? p.name}
                      logoUrl={p.customerCompany?.logoUrl ?? null}
                      size={28}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {p.customerCompany?.name ?? "No customer"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.name}
                      </div>
                    </div>
                    {isActive ? (
                      <Check className="h-4 w-4 text-[#FFC72C]" />
                    ) : p.status && p.status !== "active" && meta ? (
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] px-1.5 py-0", meta.className)}
                      >
                        {meta.label}
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <Separator />
          <div className="p-1">
            <Button
              variant="ghost"
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              data-testid="button-new-project-in-switcher"
            >
              <Plus className="mr-2 h-4 w-4" />
              New project
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start h-9 text-sm"
              onClick={() => {
                setOpen(false);
                setLocation("/projects");
              }}
              data-testid="button-manage-projects"
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Manage projects
            </Button>
            {switchActive.isPending && (
              <div className="flex items-center justify-center py-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <NewProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CustomerAvatar({
  name,
  logoUrl,
  size = 28,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ height: size, width: size }}
        className="rounded-full object-cover border border-white dark:border-gray-900 flex-shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      style={{ height: size, width: size }}
      className="rounded-full bg-[#FFC72C] flex items-center justify-center flex-shrink-0"
    >
      {initials ? (
        <span className="text-[10px] font-bold text-black">{initials}</span>
      ) : (
        <Building2 className="h-3.5 w-3.5 text-black" />
      )}
    </div>
  );
}
