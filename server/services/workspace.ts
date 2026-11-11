import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { logActivity } from "./activity";
import { countWorkspaceMembers } from "./members";
import { toPage } from "@/server/http/pagination";
import {
  requireProject,
  requireWorkspace,
  resolveWorkspaceRole,
} from "@/server/authz/access";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";
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
          },
        },
      },
      {
        project: {
          deletedAt: null,
          OR: [
            { ownerId: actor.userId },
            { members: { some: { userId: actor.userId } } },
          ],
        },
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

  const ws = await db.workspace.create({
    data: {
      ownerId: actor.userId,
      projectId: input.projectId ?? null,
      title,
      titleSource,
    },
  });

  await logActivity(db, {
    workspaceId: ws.id,
    projectId: ws.projectId,
    actorId: actor.userId,
    action: "workspace.created",
    targetType: "workspace",
    targetId: ws.id,
    meta: { title: ws.title },
  });

  return ws;
}

export type WorkspaceSourceProvenance =
  | { canAccess: false; removed: boolean }
  | {
      canAccess: true;
      removed: false;
      sourceWorkspaceId: string;
      sourceWorkspaceTitle: string;
      sourceAnnotationId: string | null;
      threadParam: string | null;
      annotationRemoved: boolean;
    };

async function resolveWorkspaceSourceProvenance(
  actor: Actor,
  sourceWorkspaceId: string | null,
  sourceAnnotationId: string | null
): Promise<WorkspaceSourceProvenance | null> {
  if (!sourceWorkspaceId) return null;

  const sourceWs = await db.workspace.findFirst({
    where: { id: sourceWorkspaceId },
    select: { id: true, title: true, deletedAt: true },
  });

  if (!sourceWs || sourceWs.deletedAt !== null) {
    return { canAccess: false, removed: true };
  }

  const sourceAccess = await resolveWorkspaceRole(actor.userId, sourceWs.id);
  if (!sourceAccess) {
    // Do not leak the source workspace title or thread chain to non-members.
    return { canAccess: false, removed: false };
  }

  let threadParam: string | null = null;
  let annotationRemoved = false;

  if (sourceAnnotationId) {
    const chainRows = await db.$queryRaw<
      Array<{
        id: string;
        depth: number;
        visibility: string;
        created_by_id: string;
      }>
    >`
      WITH RECURSIVE chain AS (
        SELECT id, parent_annotation_id, depth, visibility, created_by_id, 0 AS step
        FROM annotations
        WHERE id = ${sourceAnnotationId}
          AND workspace_id = ${sourceWs.id}
          AND deleted_at IS NULL

        UNION ALL

        SELECT parent.id, parent.parent_annotation_id, parent.depth, parent.visibility, parent.created_by_id, c.step + 1 AS step
        FROM annotations parent
        INNER JOIN chain c ON parent.id = c.parent_annotation_id
        WHERE parent.deleted_at IS NULL AND c.step < ${MAX_ANNOTATION_DEPTH}
      )
      SELECT id, depth, visibility, created_by_id
      FROM chain
      ORDER BY depth ASC;
    `;

    const hasHidden = chainRows.some(
      (r) => r.visibility === "PRIVATE" && r.created_by_id !== actor.userId
    );
    const hasTarget = chainRows.some((r) => r.id === sourceAnnotationId);

    if (!hasTarget || hasHidden) {
      annotationRemoved = true;
    } else {
      threadParam = chainRows.map((r) => r.id).join(",");
    }
  }

  return {
    canAccess: true,
    removed: false,
    sourceWorkspaceId: sourceWs.id,
    sourceWorkspaceTitle: sourceWs.title,
    sourceAnnotationId,
    threadParam,
    annotationRemoved,
  };
}

export async function getWorkspace(actor: Actor, workspaceId: string) {
  const { role, capabilities } = await requireWorkspace(actor, workspaceId, "workspace.read");

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

  const [memberCount, sourceProvenance] = await Promise.all([
    countWorkspaceMembers(workspaceId),
    resolveWorkspaceSourceProvenance(
      actor,
      workspace.sourceWorkspaceId,
      workspace.sourceAnnotationId
    ),
  ]);

  return {
    ...workspace,
    role,
    capabilities: Array.from(capabilities),
    // Effective headcount (owner + explicit + inherited project members);
    // `_count.members` would miss inherited access.
    memberCount,
    sourceProvenance,
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

  const updated = await db.workspace.update({
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

  if (input.title !== undefined) {
    await logActivity(db, {
      workspaceId,
      projectId: updated.projectId,
      actorId: actor.userId,
      action: "workspace.renamed",
      targetType: "workspace",
      targetId: workspaceId,
      meta: { title: updated.title },
    });
  }

  if (input.archived !== undefined) {
    await logActivity(db, {
      workspaceId,
      projectId: updated.projectId,
      actorId: actor.userId,
      action: input.archived ? "workspace.archived" : "workspace.unarchived",
      targetType: "workspace",
      targetId: workspaceId,
    });
  }

  return updated;
}

export async function deleteWorkspace(actor: Actor, workspaceId: string) {
  // Soft delete: owner only
  await requireWorkspace(actor, workspaceId, "workspace.delete");

  const deleted = await db.workspace.update({
    where: { id: workspaceId },
    data: { deletedAt: new Date() },
  });

  await logActivity(db, {
    workspaceId,
    projectId: deleted.projectId,
    actorId: actor.userId,
    action: "workspace.deleted",
    targetType: "workspace",
    targetId: workspaceId,
  });

  return deleted;
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

  const restored = await db.workspace.update({
    where: { id: workspaceId },
    data: { deletedAt: null },
  });

  await logActivity(db, {
    workspaceId,
    projectId: restored.projectId,
    actorId: actor.userId,
    action: "workspace.restored",
    targetType: "workspace",
    targetId: workspaceId,
  });

  return restored;
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
          },
        },
      },
      {
        project: {
          deletedAt: null,
          OR: [
            { ownerId: actor.userId },
            { members: { some: { userId: actor.userId } } },
          ],
        },
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
