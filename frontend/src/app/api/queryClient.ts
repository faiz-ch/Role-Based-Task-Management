import { QueryClient } from "@tanstack/react-query";

/**
 * The ONE shared data store for the whole app (TanStack Query).
 *
 * - Pages read data through useCachedQuery() (see queries.ts) instead of
 *   downloading it into private state. Data a page already loaded is kept
 *   here, so going back to a page is instant and costs no request.
 * - "staleTime": how long data counts as fresh. While fresh, no new request
 *   is sent. After that, the old data is shown immediately and a fresh copy
 *   is fetched quietly in the background.
 * - "refetchOnWindowFocus": when the user returns to the browser tab, data
 *   on screen is re-checked (so colleagues' changes appear).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      gcTime: 10 * 60_000, // keep unused data in memory for 10 minutes
      refetchOnWindowFocus: true,
      // Retry once only for server/network errors, never for 4xx (no permission, not found)
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
