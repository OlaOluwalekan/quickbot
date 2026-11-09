import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { toPage } from "@/server/http/pagination";
import {
  requireProject,
} from "@/server/authz/access";
import {
  ALL_PERMISSIONS,
  computeCapabilities,
  type EffectiveRole,
  type Permission,
} from "@/server/authz/permissions";
import { logActivity } from "./activity";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectWorkspacesQuery,
  ListMovableWorkspacesQuery,
} from "@/lib/schemas/workspace";
import { MOVABLE_WORKSPACES_LIMIT } from "@/lib/schemas/workspace";
import type { Prisma } from "@/server/db/generated/client";
import type { PageQuery } from "@/server/http/pagination";

// Public profile fields only — no email addresses on the project page.
const personSelect = {
  id: true,
  name: true,
  image: true,
  username: true,
} as const;

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
  const p = await db.project.create({
    data: {
      ownerId: actor.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
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
  const { role, capabilities } = await requireProject(
    actor,
    projectId,
    "workspace.read"
  );

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      owner: { select: personSelect },
      // A few members for the header avatar stack; the full list lives in
      // the Share & people dialog.
      members: {
        orderBy: { createdAt: "asc" },
        take: 5,
        select: { id: true, role: true, user: { select: personSelect } },
      },
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
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });

  if (input.name !== undefined) {
    await logActivity(db, {
      projectId,
      actorId: actor.userId,
      action: "project.renamed",
      targetType: "project",
      targetId: projectId,
      meta: { name: updated.name },
    });
  }

  if (input.archived !== undefined) {
    await logActivity(db, {
      projectId,
      actorId: actor.userId,
      action: input.archived ? "project.archived" : "project.unarchived",
      targetType: "project",
      targetId: projectId,
    });
  }

  return updated;
}

export async function deleteProject(actor: Actor, projectId: string) {
  await requireProject(actor, projectId, "workspace.delete");

  // Soft delete the project (workspaces remain intact)
  const deleted = await db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date() },
  });

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
  query: PageQuery & Partial<Pick<ListProjectWorkspacesQuery, "q" | "sort">>
) {
  const access = await requireProject(actor, projectId, "workspace.read");

  // What the project role contributes on each child workspace. Mirrors
  // resolveWorkspaceRole: the project owner acts as ADMIN on workspaces.
  const inherited: ReadonlySet<Permission> =
    access.role === "OWNER" ? computeCapabilities("ADMIN") : access.capabilities;

  const where: Prisma.WorkspaceWhereInput = {
    projectId,
    deletedAt: null,
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" as const } }
      : {}),
  };

  const sort = query.sort ?? "lastActivity";
  const orderBy: Prisma.WorkspaceOrderByWithRelationInput[] =
    sort === "name"
      ? [{ title: "asc" }, { id: "asc" }]
      : sort === "createdAt"
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ lastActivityAt: "desc" }, { id: "desc" }];

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
    select: {
      id: true,
      title: true,
      ownerId: true,
      projectId: true,
      archivedAt: true,
      lastActivityAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: personSelect },
      _count: { select: { responses: true } },
      members: {
        where: { userId: actor.userId },
        select: {
          role: true,
          canComment: true,
          canAsk: true,
          suspendedAt: true,
        },
      },
    },
  });

  const page = toPage(rows, query.limit);
  return {
    nextCursor: page.nextCursor,
    items: page.items.map(({ members, ...ws }) => {
      let caps: Set<Permission>;
      if (ws.ownerId === actor.userId) {
        caps = new Set<Permission>(ALL_PERMISSIONS);
      } else {
        caps = new Set<Permission>(inherited);
        const wm = members?.[0];
        if (wm) {
          for (const p of computeCapabilities(wm.role as EffectiveRole, {
            canComment: wm.canComment,
            canAsk: wm.canAsk,
            suspended: Boolean(wm.suspendedAt),
          })) {
            caps.add(p);
          }
        }
      }
      return { ...ws, capabilities: Array.from(caps) };
    }),
  };
}

/**
 * Workspaces the actor may move INTO this project: not already in it, not
 * archived/deleted, and where the actor holds "workspace.rename" (what
 * updateWorkspace requires). Rename is granted to the workspace owner and to
 * unsuspended ADMINs — directly on the workspace, or via its current project
 * (the project owner counts as ADMIN there). Small, searchable result set.
 */
export async function listMovableWorkspaces(
  actor: Actor,
  projectId: string,
  query: ListMovableWorkspacesQuery
) {
  // Moving in needs "workspace.generate" on the target project.
  await requireProject(actor, projectId, "workspace.generate");

  const adminRow = { userId: actor.userId, role: "ADMIN" as const, suspendedAt: null };

  const items = await db.workspace.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: { not: projectId } }],
      ...(query.q
        ? { title: { contains: query.q, mode: "insensitive" as const } }
        : {}),
      AND: [
        {
          OR: [
            { ownerId: actor.userId },
            { members: { some: adminRow } },
            {
              project: {
                deletedAt: null,
                OR: [
                  { ownerId: actor.userId },
                  { members: { some: adminRow } },
                ],
              },
            },
          ],
        },
      ],
    },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: MOVABLE_WORKSPACES_LIMIT,
    select: {
      id: true,
      title: true,
      project: { select: { id: true, name: true } },
    },
  });

  return { items };
}
