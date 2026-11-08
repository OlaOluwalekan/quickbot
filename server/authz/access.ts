import "server-only";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import {
  can,
  maxRole,
  type EffectiveRole,
  type Permission,
} from "./permissions";

export type ResolvedWorkspaceAccess = {
  ws: {
    id: string;
    ownerId: string;
    projectId: string | null;
    archivedAt: Date | null;
  };
  role: EffectiveRole;
};

export type ResolvedProjectAccess = {
  project: {
    id: string;
    ownerId: string;
    archivedAt: Date | null;
  };
  role: EffectiveRole;
};

/**
 * Resolves a user's effective role on a workspace.
 *
 * Top-down permission inheritance (F1.1):
 * effectiveRole(user, workspace) =
 *   OWNER                                  if workspace.ownerId == user
 *   max(projectRole, workspaceRole)        by rank VIEWER < COMMENTER < EDITOR < ADMIN
 *   where projectRole = OWNER->ADMIN* if user owns the workspace's project, else ProjectMember.role or none
 *
 * * The project owner gets ADMIN on every workspace in their project even if someone else
 *   owns the workspace (owner of the container must be able to see/manage what's in it).
 *   Keep billing with the workspace owner.
 *
 * A workspace row can add rights, never remove inherited ones.
 * Soft-deleted workspaces (`deletedAt != null`) return `null`.
 */
export async function resolveWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<ResolvedWorkspaceAccess | null> {
  const ws = await db.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      projectId: true,
      archivedAt: true,
      members: { where: { userId }, select: { role: true } },
      project: {
        select: {
          id: true,
          ownerId: true,
          deletedAt: true,
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });

  if (!ws) return null;

  const summary = {
    id: ws.id,
    ownerId: ws.ownerId,
    projectId: ws.projectId,
    archivedAt: ws.archivedAt,
  };

  if (ws.ownerId === userId) {
    return { ws: summary, role: "OWNER" };
  }

  // Determine inherited project role
  let projectRole: EffectiveRole | null = null;
  if (ws.project) {
    if (!ws.project.deletedAt) {
      if (ws.project.ownerId === userId) {
        projectRole = "ADMIN";
      } else if (ws.project.members?.[0]?.role) {
        projectRole = ws.project.members[0].role as EffectiveRole;
      }
    }
  } else if (ws.projectId) {
    // Fallback for mocked queries in tests that don't include project relation
    const project = await db.project.findUnique({
      where: { id: ws.projectId },
      select: { ownerId: true, deletedAt: true },
    });
    if (project && !project.deletedAt) {
      if (project.ownerId === userId) {
        projectRole = "ADMIN";
      } else {
        const pm = await db.projectMember.findUnique({
          where: {
            projectId_userId: { projectId: ws.projectId, userId },
          },
          select: { role: true },
        });
        if (pm) {
          projectRole = pm.role as EffectiveRole;
        }
      }
    }
  }

  const workspaceRole = (ws.members?.[0]?.role as EffectiveRole) ?? null;

  const effective = maxRole(projectRole, workspaceRole);
  if (!effective) {
    return null;
  }

  return { ws: summary, role: effective };
}

/**
 * Enforces that `actor` holds `perm` on `workspaceId`.
 * - Throws `404 Not Found` when the workspace does not exist, is soft-deleted,
 *   or the actor has no role (`null`) — never leaking existence via `403`.
 * - Throws `403 Forbidden` when the actor has access to the workspace (`VIEWER+`)
 *   but their role does not grant `perm`.
 * - Throws `409 Conflict` when the workspace is archived and `perm` is anything
 *   other than `"workspace.read"` or `"workspace.archive"`.
 */
export async function requireWorkspace(
  actor: Actor,
  workspaceId: string,
  perm: Permission
): Promise<ResolvedWorkspaceAccess> {
  const r = await resolveWorkspaceRole(actor.userId, workspaceId);
  if (!r) throw Errors.notFound("Workspace"); // never 403 -> no existence leak
  if (!can(r.role, perm)) throw Errors.forbidden();
  if (
    r.ws.archivedAt &&
    perm !== "workspace.read" &&
    perm !== "workspace.archive"
  ) {
    throw Errors.conflict("Workspace is archived");
  }
  return r;
}

/**
 * Resolves a user's effective role on a project.
 * Precedence: OWNER > ProjectMember role > none.
 * Soft-deleted projects (`deletedAt != null`) return `null`.
 */
export async function resolveProjectRole(
  userId: string,
  projectId: string
): Promise<ResolvedProjectAccess | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      archivedAt: true,
      members: { where: { userId }, select: { role: true } },
    },
  });

  if (!project) return null;

  const summary = {
    id: project.id,
    ownerId: project.ownerId,
    archivedAt: project.archivedAt,
  };

  if (project.ownerId === userId) {
    return { project: summary, role: "OWNER" };
  }

  const memberRole = project.members?.[0]?.role;
  if (memberRole) {
    return { project: summary, role: memberRole };
  }

  return null;
}

/**
 * Enforces that `actor` holds `perm` on `projectId`.
 * - Throws `404 Not Found` when the project does not exist, is soft-deleted,
 *   or the actor is neither owner nor member — never leaking existence via `403`.
 * - Throws `403 Forbidden` when the actor is a member (`VIEWER+`)
 *   but their role does not grant `perm`.
 * - Throws `409 Conflict` when the project is archived and `perm` is anything
 *   other than `"workspace.read"` or `"workspace.archive"`.
 */
export async function requireProject(
  actor: Actor,
  projectId: string,
  perm: Permission
): Promise<ResolvedProjectAccess> {
  const r = await resolveProjectRole(actor.userId, projectId);
  if (!r) throw Errors.notFound("Project"); // never 403 -> no existence leak
  if (!can(r.role, perm)) throw Errors.forbidden();
  if (
    r.project.archivedAt &&
    perm !== "workspace.read" &&
    perm !== "workspace.archive"
  ) {
    throw Errors.conflict("Project is archived");
  }
  return r;
}
