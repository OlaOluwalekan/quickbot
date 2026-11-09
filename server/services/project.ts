import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { toPage } from "@/server/http/pagination";
import {
  requireProject,
} from "@/server/authz/access";
import { logActivity } from "./activity";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectWorkspacesQuery,
} from "@/lib/schemas/workspace";
import type { Prisma } from "@/server/db/generated/client";

export type ListProjectsOptions = {
  cursor?: string;
  limit?: number;
  archived?: boolean;
  q?: string;
};

export async function listProjects(
  actor: Actor,
  query: ListProjectsOptions = {}
) {
  const limit = query.limit ?? 20;

  const where = {
    deletedAt: null,
    ...(query.archived !== undefined
      ? query.archived
        ? { archivedAt: { not: null } }
        : { archivedAt: null }
      : { archivedAt: null }),
    ...(query.q
      ? {
          name: {
            contains: query.q,
            mode: "insensitive" as const,
          },
        }
      : {}),
    OR: [
      { ownerId: actor.userId },
      {
        members: {
          some: {
            userId: actor.userId,
            suspendedAt: null,
          },
        },
      },
    ],
  };

  const rows = await db.project.findMany({
    where,
    take: limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      _count: {
        select: {
          workspaces: { where: { deletedAt: null } },
          members: true,
        },
      },
    },
  });

  return toPage(rows, limit);
}

export async function createProject(actor: Actor, input: CreateProjectInput) {
  const p = await db.project.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId: actor.userId,
    },
  });

  await logActivity(db, {
    projectId: p.id,
    actorId: actor.userId,
    action: "project.created",
    targetType: "project",
    targetId: p.id,
    meta: { name: p.name },
  });

  return p;
}

export async function getProject(actor: Actor, projectId: string) {
  const { role, capabilities } = await requireProject(actor, projectId, "workspace.read");

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          username: true,
        },
      },
      members: {
        where: { suspendedAt: null },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              username: true,
            },
          },
        },
        take: 5,
      },
      _count: {
        select: {
          workspaces: { where: { deletedAt: null } },
          members: { where: { suspendedAt: null } },
        },
      },
    },
  });

  if (!project) throw Errors.notFound("Project");

  return {
    ...project,
    role,
    capabilities: Array.from(capabilities),
  };
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  input: UpdateProjectInput
) {
  // Always authorize first, ensuring non-members and soft-deleted resources get 404 (never 403)
  await requireProject(actor, projectId, "workspace.rename");

  // Reject updates containing no supported fields
  const hasSupportedFields = Object.values(input).some((v) => v !== undefined);
  if (!hasSupportedFields) {
    throw Errors.validation({ formErrors: ["No supported update fields provided"] });
  }

  if (input.archived !== undefined) {
    await requireProject(actor, projectId, "workspace.archive");
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });

  const actions = [];
  if (input.name !== undefined) actions.push("project.renamed");
  if (input.archived === true) actions.push("project.archived");
  if (input.archived === false) actions.push("project.unarchived");

  for (const action of actions) {
    await logActivity(db, {
      projectId,
      actorId: actor.userId,
      action: action as any,
      targetType: "project",
      targetId: projectId,
      meta: { name: updated.name },
    });
  }

  return updated;
}

export async function deleteProject(actor: Actor, projectId: string) {
  // Hierarchy enforcement: Only owner can delete project
  const { project } = await requireProject(actor, projectId, "workspace.delete");

  if (project.ownerId !== actor.userId) {
    throw Errors.forbidden("Only the owner can delete a project");
  }

  const deleted = await db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });

  // Soft-delete unlinks child workspaces (§2.4: workspaces become standalone)
  if (typeof db.workspace.updateMany === "function") {
    await db.workspace.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
  }

  await logActivity(db, {
    projectId,
    actorId: actor.userId,
    action: "project.deleted",
    targetType: "project",
    targetId: projectId,
  });

  return deleted;
}

export async function getProjectWorkspaces(
  actor: Actor,
  projectId: string,
  query: ListProjectWorkspacesQuery
) {
  await requireProject(actor, projectId, "workspace.read");

  const where: Prisma.WorkspaceWhereInput = {
    projectId,
    deletedAt: null,
    ...(query.q
      ? {
          title: {
            contains: query.q,
            mode: "insensitive",
          },
        }
      : {}),
  };

  const sort = query.sort ?? "lastActivity";
  let orderBy: Prisma.WorkspaceOrderByWithRelationInput[];
  if (sort === "name") {
    orderBy = [{ title: "asc" }, { id: "desc" }];
  } else if (sort === "createdAt") {
    orderBy = [{ createdAt: "desc" }, { id: "desc" }];
  } else {
    // "lastActivity"
    orderBy = [{ lastActivityAt: "desc" }, { id: "desc" }];
  }

  // List all non-deleted workspaces in this project
  const rows = await db.workspace.findMany({
    where,
    take: query.limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
    orderBy,
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          username: true,
        },
      },
      _count: {
        select: {
          responses: true,
        },
      },
    },
  });

  return toPage(rows, query.limit);
}
