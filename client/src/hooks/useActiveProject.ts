import { useQuery } from "@tanstack/react-query";
import type { Project, CustomerCompany, ProjectContact } from "@shared/schema";

// Shape returned by GET /api/active-project: the Project row joined with
// its CustomerCompany (may be null if a customer is not yet attached) and
// the project's contacts. Mirrors the type defined locally in
// OrderForm.tsx / ProjectSwitcher.tsx — centralised here so future
// consumers can import it directly.
export type ActiveProjectWithRelations =
  | (Project & {
      customerCompany: CustomerCompany | null;
      contacts?: ProjectContact[];
    })
  | null;

/**
 * Thin wrapper over `GET /api/active-project` for the forms that want to
 * prefill Project Information (company name, site location, description,
 * logo) from whichever project the rep currently has selected in the
 * header chip. Shares the react-query cache with ProjectSwitcher and the
 * OrderForm banner so there's no duplicate fetch.
 */
export function useActiveProject() {
  const { data, isLoading } = useQuery<ActiveProjectWithRelations>({
    queryKey: ["/api/active-project"],
    // 30s matches ProjectSwitcher — long enough to dedupe across pages,
    // short enough that a switch is reflected promptly on nav.
    staleTime: 30_000,
    retry: false,
  });
  return { activeProject: data ?? null, isLoading };
}
