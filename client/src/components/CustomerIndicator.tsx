import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface CartProjectInfo {
  company?: string | null;
  location?: string | null;
  companyLogoUrl?: string | null;
  projectDescription?: string | null;
}

/**
 * Small "active customer" chip rendered in the top bar whenever the logged-in
 * user has a cart project with a customer name set. Keeps the sales rep
 * oriented — they always know which customer they're building for.
 *
 * Renders nothing if:
 *  - user not signed in
 *  - no project info has been saved
 *  - project has no company name
 */
export function CustomerIndicator() {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery<CartProjectInfo>({
    queryKey: ["/api/cart-project-info"],
    enabled: isAuthenticated,
    // Refetch whenever a mutation invalidates this — standard TanStack behaviour.
    staleTime: 30_000,
    retry: false,
  });

  if (!isAuthenticated || !data?.company) return null;

  const initials = data.company
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  return (
    <div
      className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/30"
      data-testid="customer-indicator"
      title={
        data.location
          ? `Active customer: ${data.company} — ${data.location}`
          : `Active customer: ${data.company}`
      }
    >
      {data.companyLogoUrl ? (
        <img
          src={data.companyLogoUrl}
          alt={`${data.company} logo`}
          className="h-6 w-6 rounded-full object-cover border border-white dark:border-gray-900"
          onError={(e) => {
            // Hide broken image, fallback to initials below
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-6 w-6 rounded-full bg-primary/30 flex items-center justify-center">
          {initials ? (
            <span className="text-[10px] font-bold text-primary-foreground">{initials}</span>
          ) : (
            <Building2 className="h-3.5 w-3.5 text-primary-foreground" />
          )}
        </div>
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
          Working with
        </span>
        <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
          {data.company}
        </span>
      </div>
    </div>
  );
}
