import { useQuery } from "@tanstack/react-query";

// Public runtime config exposed by /api/config. Only public-safe values
// end up here (e.g. the Turnstile *site* key — never the secret). The
// response is cached forever on the client because values are static
// for the lifetime of a build; the server caches at the edge for 60s.
export interface PublicConfig {
  turnstileSiteKey: string | null;
}

export function usePublicConfig() {
  return useQuery<PublicConfig>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
