"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "./query-keys";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from "@/lib/schemas/workspace";

export interface WorkspaceDto {
  id: string;
  title: string;
  createdBy: string;
  projectId?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedWorkspaces {
  items: WorkspaceDto[];
  nextCursor: string | null;
}

export interface WorkspaceListFilters {
  projectId?: string | null;
  standalone?: boolean;
  q?: string;
  archived?: boolean;
  limit?: number;
}

export function useWorkspaces(
  userId: string,
  filters?: WorkspaceListFilters,
  options?: Omit<
    UseQueryOptions<PaginatedWorkspaces, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.workspaces.list(userId, filters),
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (filters?.projectId) params.set("projectId", filters.projectId);
      if (filters?.standalone !== undefined) {
        params.set("standalone", String(filters.standalone));
      }
      if (filters?.q) params.set("q", filters.q);
      if (filters?.archived !== undefined) {
        params.set("archived", String(filters.archived));
      }
      if (filters?.limit) params.set("limit", String(filters.limit));
      const qs = params.toString();
      return api<PaginatedWorkspaces>(
        `/api/v1/workspaces${qs ? `?${qs}` : ""}`,
        { signal },
      );
    },
    ...options,
  });
}

export function useWorkspace(
  userId: string,
  workspaceId: string | null | undefined,
  options?: Omit<UseQueryOptions<WorkspaceDto, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.workspaces.detail(userId, workspaceId ?? ""),
    enabled: Boolean(userId && workspaceId),
    queryFn: ({ signal }) =>
      api<WorkspaceDto>(`/api/v1/workspaces/${workspaceId}`, { signal }),
    ...options,
  });
}

export function useCreateWorkspace(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      api<WorkspaceDto>("/api/v1/workspaces", {
        method: "POST",
        body: input,
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(
        queryKeys.workspaces.detail(userId, created.id),
        created,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all(userId),
      });
    },
  });
}

export function useUpdateWorkspace(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: UpdateWorkspaceInput;
    }) =>
      api<WorkspaceDto>(`/api/v1/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: input,
      }),
    onMutate: async ({ workspaceId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.workspaces.all(userId),
      });

      const previousDetail = queryClient.getQueryData<WorkspaceDto>(
        queryKeys.workspaces.detail(userId, workspaceId),
      );
      const previousLists = queryClient.getQueriesData<PaginatedWorkspaces>({
        queryKey: queryKeys.workspaces.all(userId),
      });

      if (previousDetail) {
        queryClient.setQueryData<WorkspaceDto>(
          queryKeys.workspaces.detail(userId, workspaceId),
          {
            ...previousDetail,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.projectId !== undefined
              ? { projectId: input.projectId }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        );
      }

      queryClient.setQueriesData<PaginatedWorkspaces>(
        { queryKey: queryKeys.workspaces.all(userId) },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((ws) =>
              ws.id === workspaceId
                ? {
                    ...ws,
                    ...(input.title !== undefined ? { title: input.title } : {}),
                    ...(input.projectId !== undefined
                      ? { projectId: input.projectId }
                      : {}),
                  }
                : ws,
            ),
          };
        },
      );

      return { previousDetail, previousLists };
    },
    onError: (_err, { workspaceId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          queryKeys.workspaces.detail(userId, workspaceId),
          context.previousDetail,
        );
      }
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: (_data, _err, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.detail(userId, workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all(userId),
      });
    },
  });
}

export function useDeleteWorkspace(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceId: string) =>
      api<{ id: string; deleted: boolean }>(
        `/api/v1/workspaces/${workspaceId}`,
        {
          method: "DELETE",
        },
      ),
    onMutate: async (workspaceId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.workspaces.all(userId),
      });

      const previousLists = queryClient.getQueriesData<PaginatedWorkspaces>({
        queryKey: queryKeys.workspaces.all(userId),
      });

      queryClient.setQueriesData<PaginatedWorkspaces>(
        { queryKey: queryKeys.workspaces.all(userId) },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((ws) => ws.id !== workspaceId),
          };
        },
      );

      return { previousLists };
    },
    onError: (_err, _workspaceId, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.all(userId),
      });
    },
  });
}
