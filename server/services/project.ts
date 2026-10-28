import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { toPage } from "@/server/http/pagination";
import {
  requireProject,
} from "@/server/authz/access";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "@/lib/schemas/workspace";
import type { PageQuery } from "@/server/http/pagination";

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
    archivedAt: query.archived ? { not: null } : null,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
    OR: [
      { ownerId: actor.userId },
      { members: { some: { userId: actor.userId } } },
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
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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
  return db.project.create({
    data: {
      ownerId: actor.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    },
  });
}

export async function getProject(actor: Actor, projectId: string) {
  const { role } = await requireProject(actor, projectId, "workspace.read");

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      _count: {
        select: {
          workspaces: { where: { deletedAt: null } },
          members: true,
        },
      },
    },
  });

  if (!project) throw Errors.notFound("Project");

  return {
    ...project,
    role,
  };
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  input: UpdateProjectInput
) {
  if (input.name !== undefined || input.description !== undefined) {
    await requireProject(actor, projectId, "workspace.rename");
  }

  if (input.archived !== undefined) {
    await requireProject(actor, projectId, "workspace.archive");
  }

  return db.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });
}

export async function deleteProject(actor: Actor, projectId: string) {
  await requireProject(actor, projectId, "workspace.delete");

  // Soft delete the project (workspaces remain intact)
  return db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });
}

export async function getProjectWorkspaces(
  actor: Actor,
  projectId: string,
  query: PageQuery
) {
  await requireProject(actor, projectId, "workspace.read");

  // List non-deleted workspaces in this project where actor is owner OR
  // has an explicit workspace role != NONE OR has no explicit workspace role (inherits project role)
  const rows = await db.workspace.findMany({
    where: {
      projectId,
      deletedAt: null,
      OR: [
        { ownerId: actor.userId },
        { members: { some: { userId: actor.userId, role: { not: "NONE" } } } },
        {
          AND: [
            { members: { none: { userId: actor.userId } } },
          ],
        },
      ],
    },
    take: query.limit + 1,
    ...(query.cursor
      ? {
          cursor: { id: query.cursor },
          skip: 1,
        }
      : {}),
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
  });

  return toPage(rows, query.limit);
}
