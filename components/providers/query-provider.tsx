"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let activeBrowserQueryClient: QueryClient | null = null;

/**
 * Clears the TanStack Query cache and resets transient UI + generation stream stores.
 * Called on sign-out and account switch so user caches never mix.
 */
export function clearAllClientCaches(client?: QueryClient | null): void {
  const target = client ?? activeBrowserQueryClient;
  target?.clear();
  useUiStore.getState().clearAllDrafts();
  useUiStore.getState().resetTransientUi();
  useGenerationStore.getState().clearAllStreams();
}

export interface QueryProviderProps {
  children: React.ReactNode;
  userId?: string | null;
  client?: QueryClient;
}

export function QueryProvider({
  children,
  userId,
  client,
}: QueryProviderProps) {
  const [queryClient] = React.useState<QueryClient>(() => {
    const resolved = client ?? createAppQueryClient();
    if (typeof window !== "undefined") {
      activeBrowserQueryClient = resolved;
    }
    return resolved;
  });

  const previousUserIdRef = React.useRef<string | null | undefined>(userId);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      activeBrowserQueryClient = queryClient;
    }
  }, [queryClient]);

  React.useEffect(() => {
    const prevUserId = previousUserIdRef.current;
    if (prevUserId !== undefined && prevUserId !== userId) {
      clearAllClientCaches(queryClient);
    }
    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export default QueryProvider;
