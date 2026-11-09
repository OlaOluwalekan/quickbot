"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "./query-keys";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/schemas/workspace";

export interface ProjectPersonDto {
  id: string;
  name: string;
  image?: string | null;
  username?: string | null;
}

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  createdBy?: string;
  ownerId?: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  /** Caller's effective role on the project (server-computed). */
  role?: string;
  /** Caller's capabilities on the project (server-computed). */
  capabilities?: string[];
  owner?: ProjectPersonDto;
  members?: Array<{ id: string; role: string; user: ProjectPersonDto }>;
  _count?: {
    workspaces?: number;
    members?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedProjects {
  items: ProjectDto[];
  nextCursor: string | null;
}

export interface ProjectWorkspaceDto {
  id: string;
  title: string;
  ownerId: string;
  projectId?: string | null;
  archivedAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: ProjectPersonDto;
  _count?: { responses?: number };
  /** Caller's capabilities on this workspace (server-computed). */
  capabilities: string[];
}

export interface PaginatedProjectWorkspaces {
  items: ProjectWorkspaceDto[];
  nextCursor: string | null;
}

export function useProjects(
  userId: string,
  filters?: { includeArchived?: boolean; q?: string },
  options?: Omit<
    UseQueryOptions<PaginatedProjects, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: queryKeys.projects.list(userId, filters),
    enabled: Boolean(userId),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (filters?.includeArchived !== undefined) {
        params.set("archived", String(filters.includeArchived));
      }
      if (filters?.q) {
        params.set("q", filters.q);
      }
      const qs = params.toString();
      return api<PaginatedProjects>(`/api/v1/projects${qs ? `?${qs}` : ""}`, {
        signal,
      });
    },
    ...options,
  });
}

export function useProject(
  userId: string,
  projectId: string | null | undefined,
  options?: Omit<UseQueryOptions<ProjectDto, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: queryKeys.projects.detail(userId, projectId ?? ""),
    enabled: Boolean(userId && projectId),
    queryFn: ({ signal }) =>
      api<ProjectDto>(`/api/v1/projects/${projectId}`, { signal }),
    ...options,
  });
}

export type ProjectWorkspaceSort = "lastActivity" | "name" | "createdAt";

/**
 * Cursor-paginated workspaces of a project (infinite scroll).
 * `q` is matched server-side against the workspace title.
 */
export function useProjectWorkspaces(
  userId: string,
  projectId: string | null | undefined,
  filters: { q?: string; sort?: ProjectWorkspaceSort; limit?: number } = {},
  options?: { initialPage?: PaginatedProjectWorkspaces },
) {
  const { q, sort = "lastActivity", limit = 30 } = filters;
  return useInfiniteQuery({
    queryKey: queryKeys.projects.workspaces(userId, projectId ?? "", {
      q,
      sort,
    }),
    enabled: Boolean(userId && projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("sort", sort);
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam);
      return api<PaginatedProjectWorkspaces>(
        `/api/v1/projects/${projectId}/workspaces?${params.toString()}`,
        { signal },
      );
    },
    getNextPageParam: (last) => last.nextCursor,
    ...(options?.initialPage
      ? {
          initialData: { pages: [options.initialPage], pageParams: [null] },
          // Server-rendered first page is fresh; refetch only on change.
          staleTime: 30_000,
        }
      : {}),
  });
}

export function useCreateProject(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api<ProjectDto>("/api/v1/projects", {
        method: "POST",
        body: input,
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(
        queryKeys.projects.detail(userId, created.id),
        created,
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all(userId),
      });
    },
  });
}

export function useUpdateProject(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: UpdateProjectInput;
    }) =>
      api<ProjectDto>(`/api/v1/projects/${projectId}`, {
        method: "PATCH",
        body: input,
      }),
    onMutate: async ({ projectId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projects.all(userId),
      });

      const previousDetail = queryClient.getQueryData<ProjectDto>(
        queryKeys.projects.detail(userId, projectId),
      );
      const previousLists = queryClient.getQueriesData<PaginatedProjects>({
        queryKey: queryKeys.projects.all(userId),
      });

      if (previousDetail) {
        queryClient.setQueryData<ProjectDto>(
          queryKeys.projects.detail(userId, projectId),
          {
            ...previousDetail,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        );
      }

      queryClient.setQueriesData<PaginatedProjects>(
        { queryKey: queryKeys.projects.all(userId) },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.description !== undefined
                      ? { description: input.description }
                      : {}),
                  }
                : p,
            ),
          };
        },
      );

      return { previousDetail, previousLists };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          queryKeys.projects.detail(userId, projectId),
          context.previousDetail,
        );
      }
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(userId, projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all(userId),
      });
    },
  });
}

export function useDeleteProject(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      api<{ id: string; deleted: boolean }>(`/api/v1/projects/${projectId}`, {
        method: "DELETE",
      }),
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projects.all(userId),
      });

      const previousLists = queryClient.getQueriesData<PaginatedProjects>({
        queryKey: queryKeys.projects.all(userId),
      });

      queryClient.setQueriesData<PaginatedProjects>(
        { queryKey: queryKeys.projects.all(userId) },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((p) => p.id !== projectId),
          };
        },
      );

      return { previousLists };
    },
    onError: (_err, _projectId, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all(userId),
      });
    },
  });
}
