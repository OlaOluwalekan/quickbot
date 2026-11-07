import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace, requireProject } from "@/server/authz/access";
import { toPage } from "@/server/http/pagination";
import type { Prisma } from "../db/generated/client";

export type LogActivityParams = {
  workspaceId?: string | null;
  projectId?: string | null;
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Prisma.InputJsonValue;
};

type DbOrTx = Prisma.TransactionClient | typeof db;

export async function logActivity(
  prisma: DbOrTx,
  params: LogActivityParams
) {
  // Some unit tests mock a partial Prisma client without the activityLog delegate
  if (!prisma?.activityLog) return null;
  try {
    return await prisma.activityLog.create({
      data: {
        workspaceId: params.workspaceId ?? null,
        projectId: params.projectId ?? null,
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        meta: params.meta ?? undefined,
      },
    });
  } catch (err) {
    // Inside a transaction a failed INSERT aborts the whole Postgres transaction,
    // so swallowing here would make the caller's COMMIT silently roll back.
    // Let it propagate so the change and its activity entry stay atomic (§7.4).
    if (prisma !== db) throw err;
    console.error("[ActivityLog] Failed to log activity:", err);
    return null;
  }
}

export type ListActivityOptions = {
  cursor?: string;
  limit?: number;
};

export async function listWorkspaceActivity(
  actor: Actor,
  workspaceId: string,
  options: ListActivityOptions = {}
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");
  const limit = options.limit ?? 30;

  const logs = await db.activityLog.findMany({
    where: { workspaceId },
    take: limit + 1,
    ...(options.cursor
      ? {
          cursor: { id: options.cursor },
          skip: 1,
        }
      : {}),
    orderBy: { createdAt: "desc" },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          displayUsername: true,
          image: true,
          avatarAttachmentId: true,
        },
      },
    },
  });

  const formatted = logs.map((log) => ({
    id: log.id,
    workspaceId: log.workspaceId,
    projectId: log.projectId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    meta: log.meta,
    createdAt: log.createdAt,
    actor: {
      id: log.actor.id,
      name: log.actor.name,
      username: log.actor.username || log.actor.displayUsername,
      image: log.actor.image,
      avatarAttachmentId: log.actor.avatarAttachmentId,
    },
  }));

  return toPage(formatted, limit);
}

export async function listProjectActivity(
  actor: Actor,
  projectId: string,
  options: ListActivityOptions = {}
) {
  await requireProject(actor, projectId, "workspace.read");
  const limit = options.limit ?? 30;

  const logs = await db.activityLog.findMany({
    where: { projectId },
    take: limit + 1,
    ...(options.cursor
      ? {
          cursor: { id: options.cursor },
          skip: 1,
        }
      : {}),
    orderBy: { createdAt: "desc" },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          displayUsername: true,
          image: true,
          avatarAttachmentId: true,
        },
      },
    },
  });

  const formatted = logs.map((log) => ({
    id: log.id,
    workspaceId: log.workspaceId,
    projectId: log.projectId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    meta: log.meta,
    createdAt: log.createdAt,
    actor: {
      id: log.actor.id,
      name: log.actor.name,
      username: log.actor.username || log.actor.displayUsername,
      image: log.actor.image,
      avatarAttachmentId: log.actor.avatarAttachmentId,
    },
  }));

  return toPage(formatted, limit);
}
