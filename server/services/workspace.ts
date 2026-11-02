import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { toPage } from "@/server/http/pagination";
import {
  requireProject,
  requireWorkspace,
} from "@/server/authz/access";
import type {
  CreateWorkspaceInput,
  SearchWorkspacesQuery,
  UpdateWorkspaceInput,
} from "@/lib/schemas/workspace";

export type ListWorkspacesOptions = {
  cursor?: string;
  limit?: number;
  projectId?: string;
  standalone?: boolean;
  archived?: boolean;
  q?: string;
};

export async function listWorkspaces(
  actor: Actor,
  query: ListWorkspacesOptions = {}
) {
  const limit = query.limit ?? 20;

  const accessibleCondition = {
    OR: [
      { ownerId: actor.userId },
      {
        members: {
          some: {
            userId: actor.userId,
            role: { not: "NONE" as const },
          },
        },
      },
      {
        AND: [
          {
            project: {
              deletedAt: null,
              members: { some: { userId: actor.userId } },
            },
          },
          {
            members: { none: { userId: actor.userId } },
          },
        ],
      },
    ],
  };

  const where = {
    deletedAt: null,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.standalone ? { projectId: null } : {}),
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" as const } }
      : {}),
    ...accessibleCondition,
  };

  const rows = await db.workspace.findMany({
    where,
    take: limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  return toPage(rows, limit);
}

export async function createWorkspace(
  actor: Actor,
  input: CreateWorkspaceInput
) {
  if (input.projectId) {
    // If projectId specified, require project EDITOR+
    await requireProject(actor, input.projectId, "workspace.generate");
  }

  const trimmedTitle = input.title?.trim();
  const title = trimmedTitle || "New workspace";
  const titleSource = trimmedTitle ? ("USER" as const) : ("AUTO" as const);

  return db.workspace.create({
    data: {
      ownerId: actor.userId,
      projectId: input.projectId ?? null,
      title,
      titleSource,
    },
  });
}

export async function getWorkspace(actor: Actor, workspaceId: string) {
  const { role } = await requireWorkspace(actor, workspaceId, "workspace.read");

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  if (!workspace) throw Errors.notFound("Workspace");

  return {
    ...workspace,
    role,
  };
}

export async function updateWorkspace(
  actor: Actor,
  workspaceId: string,
  input: UpdateWorkspaceInput
) {
  // Always authorize first, ensuring non-members and soft-deleted resources get 404 (never 403)
  await requireWorkspace(actor, workspaceId, "workspace.rename");

  // Reject updates containing no supported fields
  const hasSupportedFields = Object.values(input).some((v) => v !== undefined);
  if (!hasSupportedFields) {
    throw Errors.validation({ formErrors: ["No supported update fields provided"] });
  }

  // Field-specific authorization checks
  if (input.archived !== undefined) {
    await requireWorkspace(actor, workspaceId, "workspace.archive");
  }

  if (input.projectId !== undefined && input.projectId !== null) {
    await requireProject(actor, input.projectId, "workspace.generate");
  }

  return db.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(input.title !== undefined
        ? { title: input.title.trim(), titleSource: "USER" as const }
        : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });
}

export async function deleteWorkspace(actor: Actor, workspaceId: string) {
  // Soft delete: owner only
  await requireWorkspace(actor, workspaceId, "workspace.delete");

  return db.workspace.update({
    where: { id: workspaceId },
    data: { deletedAt: new Date() },
  });
}

export async function restoreWorkspace(actor: Actor, workspaceId: string) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
  });

  // Only the owner can restore; return 404 if not found or not owner
  if (!ws || ws.ownerId !== actor.userId) {
    throw Errors.notFound("Workspace");
  }

  if (!ws.deletedAt) {
    return ws;
  }

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - ws.deletedAt.getTime();
  if (elapsed > thirtyDaysMs) {
    throw Errors.conflict("Workspace deleted more than 30 days ago cannot be restored");
  }

  return db.workspace.update({
    where: { id: workspaceId },
    data: { deletedAt: null },
  });
}

export async function touchWorkspaceActivity(workspaceId: string) {
  try {
    return await db.workspace.update({
      where: { id: workspaceId },
      data: { lastActivityAt: new Date() },
    });
  } catch {
    // Non-fatal if workspace doesn't exist
    return null;
  }
}

export async function searchWorkspaces(
  actor: Actor,
  query: SearchWorkspacesQuery
) {
  const q = query.q.trim();
  const targetWorkspaceId = query.workspaceId || query.chatId;
  const isScoped =
    (query.scope === "this chat" || query.scope === "this-chat") &&
    Boolean(targetWorkspaceId);

  if (isScoped && targetWorkspaceId) {
    // Must enforce read access to the requested workspace
    await requireWorkspace(actor, targetWorkspaceId, "workspace.read");

    const responseDelegate = (db as any).response;
    const responses = responseDelegate
      ? await responseDelegate.findMany({
          where: {
            chatId: targetWorkspaceId,
            OR: [
              { question: { contains: q, mode: "insensitive" } },
              { response: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

    return { results: responses };
  }

  // "all chats" scope: search accessible workspace titles and responses
  const accessibleCondition = {
    OR: [
      { ownerId: actor.userId },
      {
        members: {
          some: {
            userId: actor.userId,
            role: { not: "NONE" as const },
          },
        },
      },
      {
        AND: [
          {
            project: {
              deletedAt: null,
              members: { some: { userId: actor.userId } },
            },
          },
          {
            members: { none: { userId: actor.userId } },
          },
        ],
      },
    ],
  };

  const workspaces = await db.workspace.findMany({
    where: {
      deletedAt: null,
      title: { contains: q, mode: "insensitive" },
      ...accessibleCondition,
    },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: 20,
  });

  const responseDelegate = (db as any).response;
  const responses = responseDelegate
    ? await responseDelegate.findMany({
        where: {
          chat: {
            deletedAt: null,
            ...accessibleCondition,
          },
          OR: [
            { question: { contains: q, mode: "insensitive" } },
            { response: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];

  return { results: [...workspaces, ...responses] };
}
