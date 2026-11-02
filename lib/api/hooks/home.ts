"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "./query-keys";
import type { HomeData } from "@/server/services/home";

export type {
  HomeData,
  HomeRecentWorkspace,
  HomeProjectCard,
  HomeSharedWorkspace,
  HomeCredits,
  HomeOnboarding,
} from "@/server/services/home";

export function useHomeData(
  userId: string,
  options?: Omit<UseQueryOptions<HomeData, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.home.get(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) => api<HomeData>("/api/v1/home", { signal }),
    staleTime: 15_000,
    ...options,
  });
}
