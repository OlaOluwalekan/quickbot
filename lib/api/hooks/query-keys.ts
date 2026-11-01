/**
 * Enforces the Klecx query-key convention: every key starts with `["u", userId, ...]`.
 * This guarantees caches never mix across user accounts.
 */
export function userQueryKey<const T extends readonly unknown[]>(
  userId: string,
  ...parts: T
): readonly ["u", string, ...T] {
  if (!userId || typeof userId !== "string") {
    throw new Error("userQueryKey requires a non-empty userId");
  }
  return ["u", userId, ...parts] as const;
}

export const queryKeys = {
  workspaces: {
    all: (userId: string) => userQueryKey(userId, "workspaces"),
    list: (
      userId: string,
      filters?: {
        projectId?: string | null;
        tagId?: string;
        pinned?: boolean;
        archived?: boolean;
        trashed?: boolean;
        q?: string;
      },
    ) => userQueryKey(userId, "workspaces", "list", filters ?? {}),
    detail: (userId: string, workspaceId: string) =>
      userQueryKey(userId, "workspaces", "detail", workspaceId),
    search: (
      userId: string,
      params: { q: string; scope?: string; workspaceId?: string },
    ) => userQueryKey(userId, "workspaces", "search", params),
  },
  responses: {
    all: (userId: string, workspaceId: string) =>
      userQueryKey(userId, "workspaces", workspaceId, "responses"),
    infinite: (
      userId: string,
      workspaceId: string,
      view: {
        mode?: "all" | "bookmarked" | "tag";
        tagId?: string;
        limit?: number;
      } = {},
    ) =>
      userQueryKey(userId, "workspaces", workspaceId, "responses", {
        mode: view.mode ?? "all",
        tagId: view.tagId ?? null,
        limit: view.limit ?? 30,
      }),
    versions: (userId: string, responseId: string) =>
      userQueryKey(userId, "responses", responseId, "versions"),
  },
  projects: {
    all: (userId: string) => userQueryKey(userId, "projects"),
    list: (userId: string, filters?: { includeArchived?: boolean }) =>
      userQueryKey(userId, "projects", "list", filters ?? {}),
    detail: (userId: string, projectId: string) =>
      userQueryKey(userId, "projects", "detail", projectId),
  },
  me: {
    profile: (userId: string) => userQueryKey(userId, "me", "profile"),
    preferences: (userId: string) => userQueryKey(userId, "me", "preferences"),
    credits: (userId: string) => userQueryKey(userId, "me", "credits"),
  },
  home: {
    get: (userId: string) => userQueryKey(userId, "home"),
  },
} as const;
