import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useAuth() {
  const [hasInitialCheck, setHasInitialCheck] = useState(false);
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  useEffect(() => {
    // Mark initial check as complete after first load
    if (!isLoading) {
      setHasInitialCheck(true);
    }
  }, [isLoading]);

  // For mobile, consider user as not authenticated if there's an error
  // This prevents hanging on network issues
  const isAuthenticated = !error && !!user;

  return {
    user,
    isLoading: isLoading && !hasInitialCheck,
    isAuthenticated,
    error,
  };
}
