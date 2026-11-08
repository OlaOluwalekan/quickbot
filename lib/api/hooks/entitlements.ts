"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientContext,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  entitlementsForPlan,
  type Entitlements,
} from "@/lib/entitlements/shared";

export const ENTITLEMENTS_QUERY_KEY = ["me", "entitlements"] as const;

const DEFAULT_FREE_ENTITLEMENTS: Entitlements = entitlementsForPlan("FREE");

let fallbackQueryClient: QueryClient | null = null;
function getFallbackQueryClient(): QueryClient {
  if (!fallbackQueryClient) {
    fallbackQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }
  return fallbackQueryClient;
}

function isEntitlementsShape(value: unknown): value is Entitlements {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.plan === "string" &&
    Array.isArray(obj.models) &&
    typeof obj.limits === "object" &&
    obj.limits !== null &&
    typeof obj.features === "object" &&
    obj.features !== null
  );
}

export function useEntitlements(
  options?: Omit<
    UseQueryOptions<Entitlements, Error>,
    "queryKey" | "queryFn"
  >
) {
  const contextClient = React.useContext(QueryClientContext);
  const query = useQuery(
    {
      queryKey: ENTITLEMENTS_QUERY_KEY,
      staleTime: 60_000,
      enabled: options?.enabled ?? Boolean(contextClient),
      queryFn: async ({ signal }) => {
        const res = await api<Entitlements>("/api/v1/me/entitlements", {
          signal,
        });
        return isEntitlementsShape(res) ? res : DEFAULT_FREE_ENTITLEMENTS;
      },
      ...options,
    },
    contextClient ?? getFallbackQueryClient()
  );

  const entitlements = isEntitlementsShape(query.data)
    ? query.data
    : DEFAULT_FREE_ENTITLEMENTS;

  return {
    ...query,
    data: entitlements,
    entitlements,
  };
}
