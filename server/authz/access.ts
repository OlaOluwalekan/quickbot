import "server-only";
import type { Actor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import {
  ALL_PERMISSIONS,
  computeCapabilities,
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
  capabilities: Set<Permission>;
};

export type ResolvedProjectAccess = {
  project: {
    id: string;
    ownerId: string;
    archivedAt: Date | null;
  };
  role: EffectiveRole;
  capabilities: Set<Permission>;
};

/**
 * Resolves a user's effective role and capability set on a workspace.
 *
 * Top-down permission inheritance (F1.1) + Member capabilities (F1.2):
 * effectiveRole(user, workspace) =
 *   OWNER                                  if workspace.ownerId == user
 *   max(projectRole, workspaceRole)        by rank VIEWER < COMMENTER < EDITOR < ADMIN
 *   where projectRole = OWNER->ADMIN* if user owns the workspace's project, else ProjectMember.role or none
 *
 * Capabilities = projectCapabilities ∪ workspaceCapabilities
 * - Suspended row contributes only workspace.read (and VIEWER to the role).
 * - Explicit false removes only from its row; cannot remove a grant from the other level.
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
      members: {
        where: { userId },
        select: {
          role: true,
          canComment: true,
          canAsk: true,
          suspendedAt: true,
          suspendedReason: true,
        },
      },
      project: {
        select: {
          id: true,
          ownerId: true,
          deletedAt: true,
          members: {
            where: { userId },
            select: {
              role: true,
              canComment: true,
              canAsk: true,
              suspendedAt: true,
              suspendedReason: true,
            },
          },
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
    return {
      ws: summary,
      role: "OWNER",
      capabilities: new Set<Permission>(ALL_PERMISSIONS),
    };
  }

  // 1. Project level
  let projectRole: EffectiveRole | null = null;
  let projectCapabilities = new Set<Permission>();

  if (ws.project && !ws.project.deletedAt) {
    if (ws.project.ownerId === userId) {
      projectRole = "ADMIN";
      projectCapabilities = computeCapabilities("ADMIN");
    } else {
      const pm = ws.project.members?.[0];
      if (pm) {
        // A suspended row is read-only: it also contributes only VIEWER to the
        // effective role, so role-based checks (moderation, revert) agree.
        projectRole = pm.suspendedAt ? "VIEWER" : (pm.role as EffectiveRole);
        projectCapabilities = computeCapabilities(pm.role as EffectiveRole, {
          canComment: pm.canComment,
          canAsk: pm.canAsk,
          suspended: Boolean(pm.suspendedAt),
        });
      }
    }
  }

  // 2. Workspace level
  let workspaceRole: EffectiveRole | null = null;
  let workspaceCapabilities = new Set<Permission>();

  const wm = ws.members?.[0];
  if (wm) {
    workspaceRole = wm.suspendedAt ? "VIEWER" : (wm.role as EffectiveRole);
    workspaceCapabilities = computeCapabilities(wm.role as EffectiveRole, {
      canComment: wm.canComment,
      canAsk: wm.canAsk,
      suspended: Boolean(wm.suspendedAt),
    });
  }

  const effective = maxRole(projectRole, workspaceRole);
  if (!effective) {
    return null;
  }

  const capabilities = new Set<Permission>([
    ...projectCapabilities,
    ...workspaceCapabilities,
  ]);

  return { ws: summary, role: effective, capabilities };
}

/**
 * Enforces that actor holds perm on workspaceId.
 * - Throws 404 Not Found when the workspace does not exist, is soft-deleted,
 *   or the actor has no role (null) - never leaking existence via 403.
 * - Throws 403 Forbidden when the actor has access to the workspace
 *   but their capabilities set does not grant perm.
 * - Throws 409 Conflict when the workspace is archived and perm is anything
 *   other than "workspace.read" or "workspace.archive".
 */
export async function requireWorkspace(
  actor: Actor,
  workspaceId: string,
  perm: Permission
): Promise<ResolvedWorkspaceAccess> {
  const r = await resolveWorkspaceRole(actor.userId, workspaceId);
  if (!r) throw Errors.notFound("Workspace"); // never 403 -> no existence leak
  if (!r.capabilities.has(perm)) throw Errors.forbidden();
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
 * Soft-deleted projects (deletedAt != null) return null.
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
      members: {
        where: { userId },
        select: {
          role: true,
          canComment: true,
          canAsk: true,
          suspendedAt: true,
          suspendedReason: true,
        },
      },
    },
  });

  if (!project) return null;

  const summary = {
    id: project.id,
    ownerId: project.ownerId,
    archivedAt: project.archivedAt,
  };

  if (project.ownerId === userId) {
    return {
      project: summary,
      role: "OWNER",
      capabilities: new Set<Permission>(ALL_PERMISSIONS),
    };
  }

  const pm = project.members?.[0];
  if (pm) {
    const capabilities = computeCapabilities(pm.role as EffectiveRole, {
      canComment: pm.canComment,
      canAsk: pm.canAsk,
      suspended: Boolean(pm.suspendedAt),
    });
    const role: EffectiveRole = pm.suspendedAt ? "VIEWER" : (pm.role as EffectiveRole);
    return { project: summary, role, capabilities };
  }

  return null;
}

/**
 * Enforces that actor holds perm on projectId.
 * - Throws 404 Not Found when the project does not exist, is soft-deleted,
 *   or the actor is neither owner nor member - never leaking existence via 403.
 * - Throws 403 Forbidden when the actor is a member
 *   but their capability set does not grant perm.
 * - Throws 409 Conflict when the project is archived and perm is anything
 *   other than "workspace.read" or "workspace.archive".
 */
export async function requireProject(
  actor: Actor,
  projectId: string,
  perm: Permission
): Promise<ResolvedProjectAccess> {
  const r = await resolveProjectRole(actor.userId, projectId);
  if (!r) throw Errors.notFound("Project"); // never 403 -> no existence leak
  if (!r.capabilities.has(perm)) throw Errors.forbidden();
  if (
    r.project.archivedAt &&
    perm !== "workspace.read" &&
    perm !== "workspace.archive"
  ) {
    throw Errors.conflict("Project is archived");
  }
  return r;
}
