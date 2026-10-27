import "server-only";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { can, type EffectiveRole, type Permission } from "./permissions";

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
 * Precedence (D-02): OWNER > explicit WorkspaceMember role > inherited ProjectMember role > none.
 * - Soft-deleted workspaces (`deletedAt != null`) return `null`.
 * - Explicit `WorkspaceRole.NONE` overrides any inherited project role and returns `null`.
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

  const explicit = ws.members[0]?.role; // workspace row overrides project row
  if (explicit) {
    return explicit === "NONE" ? null : { ws: summary, role: explicit };
  }

  if (ws.projectId) {
    const pm = await db.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: ws.projectId, userId },
      },
      select: { role: true },
    });
    if (pm) {
      return { ws: summary, role: pm.role };
    }
  }

  return null;
}

/**
 * Enforces that `actor` holds `perm` on `workspaceId`.
 * - Throws `404 Not Found` when the workspace does not exist, is soft-deleted,
 *   or the actor has no role (`null` / `NONE`) — never leaking existence via `403`.
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

  const memberRole = project.members[0]?.role;
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
