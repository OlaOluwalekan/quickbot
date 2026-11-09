"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "./query-keys";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/schemas/workspace";

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  createdBy?: string;
  ownerId?: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  role?: string;
  capabilities?: string[];
  owner?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    username?: string | null;
  };
  members?: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
      username?: string | null;
    };
  }>;
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
  deletedAt?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    username?: string | null;
  };
  _count?: {
    responses?: number;
  };
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
): UseQueryResult<ProjectDto, Error>;
export function useProject(
  projectId: string | null | undefined,
  options?: Omit<UseQueryOptions<ProjectDto, Error>, "queryKey" | "queryFn">,
): UseQueryResult<ProjectDto, Error>;
export function useProject(
  idOrUserId: string | null | undefined,
  idOrOptions?: string | null | Omit<UseQueryOptions<ProjectDto, Error>, "queryKey" | "queryFn">,
  options?: Omit<UseQueryOptions<ProjectDto, Error>, "queryKey" | "queryFn">,
) {
  const { data: session } = authClient.useSession();
  let explicitUserId = "";
  let projectId: string | null | undefined = "";
  let opts = options;

  if (typeof idOrOptions === "string" || idOrOptions === null) {
    explicitUserId = idOrUserId ?? "";
    projectId = idOrOptions;
  } else {
    projectId = idOrUserId;
    opts = idOrOptions;
  }

  const effectiveUserId = explicitUserId || session?.user?.id || "";

  return useQuery({
    queryKey: effectiveUserId
      ? queryKeys.projects.detail(effectiveUserId, projectId ?? "")
      : (["projects", "detail", projectId ?? ""] as const),
    enabled: Boolean(effectiveUserId && projectId) && (opts?.enabled !== false),
    queryFn: ({ signal }) =>
      api<ProjectDto>(`/api/v1/projects/${projectId}`, { signal }),
    ...opts,
  });
}

export function useProjectWorkspaces(
  userId: string,
  projectId: string | null | undefined,
  filters?: {
    q?: string;
    sort?: "lastActivity" | "name" | "createdAt";
    limit?: number;
    cursor?: string;
  },
  options?: Omit<
    UseQueryOptions<PaginatedProjectWorkspaces, Error>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<PaginatedProjectWorkspaces, Error>;
export function useProjectWorkspaces(
  projectId: string | null | undefined,
  filters?: {
    q?: string;
    sort?: "lastActivity" | "name" | "createdAt";
    limit?: number;
    cursor?: string;
  },
  options?: Omit<
    UseQueryOptions<PaginatedProjectWorkspaces, Error>,
    "queryKey" | "queryFn"
  >,
): UseQueryResult<PaginatedProjectWorkspaces, Error>;
export function useProjectWorkspaces(
  firstArg: string | null | undefined,
  secondArg?:
    | string
    | null
    | {
        q?: string;
        sort?: "lastActivity" | "name" | "createdAt";
        limit?: number;
        cursor?: string;
      },
  thirdArg?:
    | {
        q?: string;
        sort?: "lastActivity" | "name" | "createdAt";
        limit?: number;
        cursor?: string;
      }
    | Omit<
        UseQueryOptions<PaginatedProjectWorkspaces, Error>,
        "queryKey" | "queryFn"
      >,
  fourthArg?: Omit<
    UseQueryOptions<PaginatedProjectWorkspaces, Error>,
    "queryKey" | "queryFn"
  >,
) {
  const { data: session } = authClient.useSession();
  let explicitUserId = "";
  let projectId: string | null | undefined = "";
  let filters:
    | {
        q?: string;
        sort?: "lastActivity" | "name" | "createdAt";
        limit?: number;
        cursor?: string;
      }
    | undefined;
  let options:
    | Omit<
        UseQueryOptions<PaginatedProjectWorkspaces, Error>,
        "queryKey" | "queryFn"
      >
    | undefined;

  if (typeof secondArg === "string" || secondArg === null) {
    explicitUserId = firstArg ?? "";
    projectId = secondArg;
    filters = thirdArg as typeof filters;
    options = fourthArg;
  } else {
    projectId = firstArg;
    filters = secondArg;
    options = thirdArg as typeof options;
  }

  const effectiveUserId = explicitUserId || session?.user?.id || "";

  return useQuery({
    queryKey: effectiveUserId
      ? queryKeys.projects.workspaces(
          effectiveUserId,
          projectId ?? "",
          filters ? { q: filters.q, sort: filters.sort } : undefined
        )
      : (["projects", projectId ?? "", "workspaces", filters ?? {}] as const),
    enabled: Boolean(effectiveUserId && projectId) && (options?.enabled !== false),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (filters?.q) params.set("q", filters.q);
      if (filters?.sort) params.set("sort", filters.sort);
      if (filters?.limit) params.set("limit", String(filters.limit));
      if (filters?.cursor) params.set("cursor", filters.cursor);
      const qs = params.toString();
      return api<PaginatedProjectWorkspaces>(
        `/api/v1/projects/${projectId}/workspaces${qs ? `?${qs}` : ""}`,
        { signal }
      );
    },
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
