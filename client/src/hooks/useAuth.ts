import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  const hasFetched = useRef(false);

  const { data: user, isLoading: queryLoading, isFetched, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 30 * 1000,
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
