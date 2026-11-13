"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api, ApiClientError } from "@/lib/api/client";
import type { CitationDto } from "@/lib/api/sse";
import { queryKeys, userQueryKey } from "./query-keys";
import type {
  CreateResponseEditInput,
  SetActiveVersionInput,
} from "@/lib/schemas/response";

export interface SourceChainStepDto {
  id: string;
  quote: string;
  depth: number;
}

export interface ResponseItemDto {
  id: string;
  chatId: string;
  prompt: string;
  origin?: "DIRECT" | "PROMOTED" | string;
  quote?: string | null;
  sourceAnnotationId?: string | null;
  sourceWorkspaceId?: string | null;
  sourceChain?: SourceChainStepDto[] | null;
  sourceRemoved?: boolean;
  sourceAccessible?: boolean;
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
  /** The version shown in the timeline, with its latest saved edit. */
  activeVersion?: (Partial<ResponseVersionDto> & { id: string }) | null;
  versionCount?: number;
  createdAt: string;
  updatedAt: string;
  attachments?: Array<{
    id: string;
    kind: string;
    originalName: string;
    mime: string;
    bytes: number;
    width?: number | null;
    height?: number | null;
  }>;
  uploadedAttachment?: {
    id: string;
    originalName: string;
    mime: string;
    bytes: number;
    createdAt?: string | Date;
  } | null;
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
  number?: number;
  versionNumber?: number;
  status?: string;
  content: string;
  originalContent?: string;
  thoughtSummary?: string | null;
  modelKey?: string | null;
  modelId?: string | null;
  providerModelId?: string | null;
  promptVersion?: number;
  generationId?: string | null;
  createdById?: string;
  createdAt: string;
  isActive?: boolean;
  edited?: boolean;
  hasEdits?: boolean;
  editCount?: number;
  citations?: CitationDto[];
  latestEdit?: {
    id: string;
    revision: number;
    editorId: string;
    createdAt: string;
  } | null;
  latestEditContent?: string | null;
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
      api<ResponseVersionDto[] | { activeVersionId: string | null; versions: ResponseVersionDto[] }>(`/api/v1/responses/${responseId}/versions`, { signal }),
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

export function useCreateVersionEdit(userId: string, workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      versionId,
      input,
    }: {
      versionId: string;
      input: CreateResponseEditInput;
    }) =>
      api<{
        id: string;
        versionId: string;
        revision: number;
        content: string;
        editorId: string;
        createdAt: string;
      }>(`/api/v1/response-versions/${versionId}/edits`, {
        method: "POST",
        body: input,
      }),
    onSuccess: (edit, { versionId }) => {
      const baseKey = queryKeys.responses.all(userId, workspaceId);
      // Show the saved text (and its revision) right away. Without this the
      // card falls back to the old text until the refetch ends, and a new
      // draft started in between would carry a stale base revision.
      queryClient.setQueriesData<InfiniteData<PaginatedResponses>>(
        { queryKey: baseKey },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => {
                const ver = item.activeVersion;
                if (!ver || ver.id !== versionId) return item;
                return {
                  ...item,
                  activeVersion: {
                    ...ver,
                    content: edit.content,
                    edited: true,
                    hasEdits: true,
                    latestEdit: {
                      id: edit.id,
                      revision: edit.revision,
                      editorId: edit.editorId,
                      createdAt: edit.createdAt,
                    },
                    latestEditContent: edit.content,
                  },
                };
              }),
            })),
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: baseKey });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("annotations-changed", { detail: { workspaceId } })
        );
      }
    },
    onError: (err) => {
      // Someone else saved first: load their text.
      if (err instanceof ApiClientError && err.code === "edit_conflict") {
        queryClient.invalidateQueries({
          queryKey: queryKeys.responses.all(userId, workspaceId),
        });
      }
    },
  });
}
