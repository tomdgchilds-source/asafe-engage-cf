import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getQueryFn } from "@/lib/queryClient";

/** True for the customer-facing token pages that never carry a rep session. */
export function isPublicSharePath(pathname: string): boolean {
  return pathname.startsWith("/share/") || pathname.startsWith("/approve/");
}

/**
 * The ONLY place that may query GET /api/auth/user. Every other component
 * must derive auth state from this hook (`isAuthenticated`) and gate its
 * own authenticated queries with `enabled: isAuthenticated`, so anonymous
 * visitors on public pages never fire 401-ing probes.
 */
export function useAuth() {
  const hasFetched = useRef(false);

  // Token-gated public pages (/share/..., /approve/...) are opened by
  // customers who have no session. Probing /api/auth/user there only logs
  // a 401 in their console, so skip the query and report unauthenticated.
  const isPublicPage = isPublicSharePath(
    typeof window !== "undefined" ? window.location.pathname : "",
  );

  const { data: user, isFetched, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
    enabled: !isPublicPage,
  });

  useEffect(() => {
    if (isFetched) {
      hasFetched.current = true;
    }
  }, [isFetched]);

  // isLoading is true until we've completed at least one fetch. A public
  // page never fetches, so it is never "loading".
  const isLoading = !isPublicPage && !hasFetched.current && !isFetched;
  const isAuthenticated = !isPublicPage && !!user;

  return {
    user,
    isLoading,
    isAuthenticated,
    error,
  };
}
