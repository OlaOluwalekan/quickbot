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
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/schemas/workspace";

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  createdBy: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedProjects {
  items: ProjectDto[];
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
