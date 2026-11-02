"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys, userQueryKey } from "./query-keys";
import type {
  CreateResponseEditInput,
  SetActiveVersionInput,
} from "@/lib/schemas/response";

export interface ResponseItemDto {
  id: string;
  chatId: string;
  prompt: string;
  response: string;
  originalResponse?: string;
  isEdited?: boolean;
  latestEdit?: {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  activeVersionId?: string | null;
  versionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponses {
  items: ResponseItemDto[];
  nextCursor: string | null;
}

export interface ResponsesViewFilter {
  view?: "original" | "edited";
  mode?: "all" | "bookmarked" | "tag";
  tagId?: string;
  limit?: number;
}

export interface ResponseVersionDto {
  id: string;
  responseId: string;
  versionNumber: number;
  content: string;
  modelId?: string | null;
  thoughtSummary?: string | null;
  createdAt: string;
}

/**
 * Infinite query for workspace responses keyed by `["u", userId, "workspaces", workspaceId, "responses", view]`.
 */
export function useResponses(
  userId: string,
  workspaceId: string | null | undefined,
  view: ResponsesViewFilter = {},
) {
  const normalizedView = {
    view: view.view ?? "edited",
    mode: view.mode ?? "all",
    tagId: view.tagId ?? null,
    limit: view.limit ?? 30,
  };

  return useInfiniteQuery({
    queryKey: userQueryKey(
      userId,
      "workspaces",
      workspaceId ?? "",
      "responses",
      normalizedView,
    ),
    enabled: Boolean(userId && workspaceId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      params.set("view", normalizedView.view);
      params.set("limit", String(normalizedView.limit));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      return api<PaginatedResponses>(
        `/api/v1/workspaces/${workspaceId}/responses?${params.toString()}`,
        { signal },
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useResponseVersions(
  userId: string,
  responseId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.responses.versions(userId, responseId ?? ""),
    enabled: Boolean(userId && responseId),
    queryFn: ({ signal }) =>
      api<{
        activeVersionId: string | null;
        versions: ResponseVersionDto[];
      }>(`/api/v1/responses/${responseId}/versions`, { signal }),
  });
}

export function useSwitchActiveVersion(userId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      responseId,
      input,
    }: {
      responseId: string;
      input: SetActiveVersionInput;
    }) =>
      api<{
        id: string;
        activeVersionId: string;
        response: string;
      }>(`/api/v1/responses/${responseId}/versions`, {
        method: "PATCH",
        body: input,
      }),
    onMutate: async ({ responseId, input }) => {
      const baseKey = queryKeys.responses.all(userId, workspaceId);
      await queryClient.cancelQueries({ queryKey: baseKey });

      const previousLists = queryClient.getQueriesData<
        InfiniteData<PaginatedResponses>
      >({
        queryKey: baseKey,
      });

      queryClient.setQueriesData<InfiniteData<PaginatedResponses>>(
        { queryKey: baseKey },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === responseId
                  ? { ...item, activeVersionId: input.versionId }
                  : item,
              ),
            })),
          };
        },
      );

      return { previousLists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: (_data, _err, { responseId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.responses.all(userId, workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.responses.versions(userId, responseId),
      });
    },
  });
}

export function useCreateResponseEdit(userId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      responseId,
      input,
    }: {
      responseId: string;
      input: CreateResponseEditInput;
    }) =>
      api<{
        id: string;
        responseId: string;
        content: string;
        createdAt: string;
        updatedAt: string;
      }>(`/api/v1/responses/${responseId}/edits`, {
        method: "POST",
        body: input,
      }),
    onMutate: async ({ responseId, input }) => {
      const baseKey = queryKeys.responses.all(userId, workspaceId);
      await queryClient.cancelQueries({ queryKey: baseKey });

      const previousLists = queryClient.getQueriesData<
        InfiniteData<PaginatedResponses>
      >({
        queryKey: baseKey,
      });

      queryClient.setQueriesData<InfiniteData<PaginatedResponses>>(
        { queryKey: baseKey },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === responseId
                  ? {
                      ...item,
                      response: input.content,
                      isEdited: true,
                    }
                  : item,
              ),
            })),
          };
        },
      );

      return { previousLists };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.responses.all(userId, workspaceId),
      });
    },
  });
}

export function useRevertResponseEdit(userId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (responseId: string) =>
      api<{ reverted: boolean }>(`/api/v1/responses/${responseId}/edits`, {
        method: "DELETE",
      }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.responses.all(userId, workspaceId),
      });
    },
  });
}
