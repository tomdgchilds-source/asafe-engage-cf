import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { getQueryFn } from "@/lib/queryClient";
import { BrandedSpinner } from "@/components/BrandedSpinner";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { data: adminUser, isLoading, error } = useQuery({
    queryKey: ["/api/admin/session"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <BrandedSpinner size="lg" label="Verifying admin access…" />
      </div>
    );
  }

  if (!adminUser || error) {
    return <Redirect to="/admin/login" />;
  }

  return <>{children}</>;
}
