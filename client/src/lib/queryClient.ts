import { QueryClient, QueryFunction } from "@tanstack/react-query";

/** Error thrown for non-2xx responses; carries the HTTP status so retry
 *  and 401-handling logic can branch on it without parsing the message. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`${status}: ${message}`);
    this.name = "ApiError";
    this.status = status;
  }
}

function httpStatusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number") {
    return (err as { status: number }).status;
  }
  // Legacy errors constructed elsewhere as `new Error("401: ...")`.
  if (err instanceof Error) {
    const m = /^(\d{3}):/.exec(err.message);
    if (m) return Number(m[1]);
  }
  return undefined;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiError(res.status, text);
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
export const getQueryFn =
  <T,>({ on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
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
        // Callers opting into returnNull type their data as `T | null`.
        return null as unknown as T;
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
      staleTime: 60_000, // 1 minute: dedupes across route changes without going stale for a session
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      retry: (failureCount, error) => {
        // Never retry a 401 (it will not become authorised by waiting) or
        // any other 4xx; retry transient failures at most twice.
        const status = httpStatusOf(error);
        if (status === 401) return false;
        if (status !== undefined && status >= 400 && status < 500) return false;
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
    if (httpStatusOf(error) === 401 && queryKey !== '/api/auth/user') {
      // Don't redirect if already on landing page (prevents infinite loop)
      if (window.location.pathname !== '/') {
        window.location.href = "/";
      }
    }
  }
});
