import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Join the queryKey parts properly
    const url = queryKey.join("/") as string;
    
    // Validate that the URL is a valid API endpoint
    if (!url.startsWith('/api/') && !url.startsWith('http')) {
      console.error('Invalid query key:', queryKey);
      throw new Error(`Invalid API endpoint: ${url}`);
    }
    
    // Don't try to fetch blob URLs or data URLs
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      console.error('Attempted to fetch from invalid URL type:', url);
      throw new Error('Cannot fetch from blob or data URLs');
    }
    
    try {
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error('Fetch error for URL:', url, error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes cache
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (including 401 unauthorized)
        if (error instanceof Error) {
          const message = error.message;
          if (message.startsWith('4')) return false;
        }
        return failureCount < 2;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});

// Global handler: redirect to landing on 401 errors from any query (skip /api/auth/user — that's expected when unauthenticated)
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.state.status === 'error') {
    const error = event.query.state.error;
    const queryKey = event.query.queryKey[0];
    if (error instanceof Error && error.message.startsWith('401') && queryKey !== '/api/auth/user') {
      window.location.href = "/";
    }
  }
});
