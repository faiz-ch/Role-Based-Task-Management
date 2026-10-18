import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * How long each kind of data counts as "fresh" before a background re-check.
 * Our OWN saves always refresh data immediately (see client.ts), so these
 * times only affect how quickly OTHER people's changes appear.
 */
export const FRESH = {
  RARE: 5 * 60_000, // departments, roles, permissions, categories
  NORMAL: 2 * 60_000, // users, single records
  LIVE: 30_000, // projects, tasks, dashboard
};

/** Lists that other people change often are re-checked every 60 s while open. */
export const POLL_MS = 60_000;

/** Stable empty array, so "no data yet" never creates a new array every render. */
export const EMPTY: any[] = [];

/**
 * Cache labels. The same label always means the same data, so every page
 * that asks for e.g. ["departments"] shares ONE downloaded copy.
 */
export const qk = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  departments: ["departments"] as const,
  department: (id: number) => ["departments", id] as const,
  roles: ["roles"] as const,
  assignableRoles: ["roles", "assignable"] as const,
  role: (id: number) => ["roles", id] as const,
  permissions: ["permissions"] as const,
  categories: ["categories"] as const,
  users: ["users"] as const,
  user: (id: number) => ["users", id] as const,
  projects: ["projects"] as const,
  project: (id: number) => ["projects", id] as const,
  tasks: (params: Record<string, unknown> = {}) => ["tasks", params] as const,
  task: (id: number) => ["task", id] as const,
  subtask: (id: number) => ["subtask", id] as const,
};

type Updater<T> = T | ((old: T) => T);

/**
 * Read data through the shared store.
 *
 * Returns { data, setData, isLoading, error, refetch }.
 * `setData` works exactly like a React useState setter (value or
 * `prev => next`), so existing page code such as
 * `setProjects((prev) => [...prev, newProject])` keeps working — it now
 * updates the shared copy, so every page sees the change.
 */
export function useCachedQuery<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  fallback: T,
  options: { staleTime?: number; enabled?: boolean; poll?: boolean } = {}
) {
  const qc = useQueryClient();
  const enabled = options.enabled ?? true;
  const query = useQuery<T>({
    queryKey: key,
    queryFn: fetcher,
    // Only override the default freshness (30 s) when a page asks for a
    // different one — passing "undefined" would otherwise mean "always stale".
    ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
    enabled,
    refetchInterval: options.poll ? POLL_MS : false,
    refetchIntervalInBackground: false,
  });

  const keyString = JSON.stringify(key);
  const setData = useCallback(
    (updater: Updater<T>) => {
      qc.setQueryData<T>(key, (old) =>
        typeof updater === "function"
          ? (updater as (o: T) => T)(old === undefined ? fallback : old)
          : updater
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, keyString]
  );

  return {
    data: query.data === undefined ? fallback : query.data,
    setData,
    // true only on the FIRST load (no data in the store yet) — never while
    // refreshing in the background, so the page does not flash a spinner
    isLoading: enabled && query.isPending,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
