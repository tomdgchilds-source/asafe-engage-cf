import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getQueryFn } from "@/lib/queryClient";

/**
 * The ONLY place that may query GET /api/auth/user. Every other component
 * must derive auth state from this hook (`isAuthenticated`) and gate its
 * own authenticated queries with `enabled: isAuthenticated`, so anonymous
 * visitors on public pages never fire 401-ing probes.
 */
export function useAuth() {
  const hasFetched = useRef(false);

  const { data: user, isFetched, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 60_000,
    gcTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (isFetched) {
      hasFetched.current = true;
    }
  }, [isFetched]);

  // isLoading is true until we've completed at least one fetch
  const isLoading = !hasFetched.current && !isFetched;
  const isAuthenticated = !!user;

  return {
    user,
    isLoading,
    isAuthenticated,
    error,
  };
}
