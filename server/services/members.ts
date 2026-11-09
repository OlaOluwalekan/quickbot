import "server-only";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { requireWorkspace, requireProject, resolveWorkspaceRole } from "@/server/authz/access";
import { can, ROLE_RANK, maxRole, computeCapabilities, type EffectiveRole } from "@/server/authz/permissions";
import { logActivity } from "./activity";
import { getOwnerGraceInfo } from "./member-limits";
import { getPendingOutgoingTransfer } from "./ownership-transfer";
import { notify } from "./notify";
import { getUserAvatar } from "./avatar";
import { getMonthlySpendByActor } from "./billing-owner";
import type { WorkspaceRole, ProjectRole } from "../db/generated/client";

async function getOwnerMonthlySpendByActor(ownerId: string): Promise<Map<string, number>> {
  const account = await db.creditAccount.findUnique({
    where: { userId: ownerId },
    select: { id: true },
  });
  if (!account) return new Map();
  return getMonthlySpendByActor(account.id).catch(() => new Map<string, number>());
}

type MemberNotifyTarget = { workspaceId: string } | { projectId: string };

/**
 * Tell a member their access changed (ROLE_CHANGED / MEMBER_REMOVED).
 * Best-effort: a notification failure must never fail the membership change.
 */
async function notifyMemberChange(
  userId: string,
  type: "ROLE_CHANGED" | "MEMBER_REMOVED",
  target: MemberNotifyTarget,
  extra: Record<string, unknown> = {}
) {
  try {
    const isWorkspace = "workspaceId" in target;
    const resourceName = isWorkspace
      ? (
          await db.workspace.findUnique({
            where: { id: target.workspaceId },
            select: { title: true },
          })
        )?.title
      : (
          await db.project.findUnique({
            where: { id: target.projectId },
            select: { name: true },
          })
        )?.name;
    const label = isWorkspace ? "workspace" : "project";
    const name = resourceName || `a ${label}`;

    await notify(userId, type, {
      ...target,
      resourceName: name,
      ...(type === "MEMBER_REMOVED"
        ? { message: `Your access to the ${label} "${name}" was removed.` }
        : {}),
      // Removed members can no longer open the resource itself
      href:
        type === "ROLE_CHANGED" && isWorkspace
          ? `/workspaces/${target.workspaceId}`
          : "/workspaces",
      ...extra,
    });
  } catch (err) {
    console.error(`[Members] Failed to send ${type} notification:`, err);
  }
}

export type MemberSummary = {
  id: string;
  userId: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
  role: string;
  invitedById: string | null;
  createdAt: Date;
  inherited?: boolean;
  source?: "WORKSPACE" | "PROJECT" | "BOTH";
  inheritedRole?: string | null;
  canComment?: boolean | null;
  canAsk?: boolean | null;
  /** True when the project level already grants the capability (locked "on" in the UI). */
  inheritedCanComment?: boolean;
  inheritedCanAsk?: boolean;
  /** What the member can actually do here, after role defaults, toggles and suspension. */
  effectiveCanComment?: boolean;
  effectiveCanAsk?: boolean;
  suspendedAt?: Date | null;
  suspendedReason?: string | null;
  monthlyCreditCap?: number | null;
  monthlyCreditsUsed?: number;
  keepActive?: boolean;
};

export async function listWorkspaceMembers(actor: Actor, workspaceId: string) {
  const { role: actorRole } = await requireWorkspace(
    actor,
    workspaceId,
    "workspace.read"
  );

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          displayUsername: true,
          image: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              displayUsername: true,
              image: true,
            },
          },
        },
      },
      project: {
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              displayUsername: true,
              image: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  displayUsername: true,
                  image: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!workspace) throw Errors.notFound("Workspace");

  // Fetch owner avatar
  const ownerAvatar = await getUserAvatar(workspace.owner.id).catch(() => null);

  const ownerSummary: MemberSummary = {
    id: `owner-${workspace.owner.id}`,
    userId: workspace.owner.id,
    name: workspace.owner.name,
    email: workspace.owner.email,
    username: workspace.owner.username || workspace.owner.displayUsername,
    image: workspace.owner.image,
    avatarUrl: ownerAvatar?.avatarUrl || workspace.owner.image || null,
    role: "OWNER",
    invitedById: null,
    createdAt: workspace.createdAt,
    inherited: false,
    source: "WORKSPACE",
    inheritedRole: null,
  };

  const membersMap = new Map<string, MemberSummary>();

  // 1. Inherited project members (if workspace belongs to a project)
  if (workspace.project) {
    if (workspace.project.ownerId !== workspace.ownerId) {
      const pOwner = workspace.project.owner;
      membersMap.set(pOwner.id, {
        id: `project-owner-${pOwner.id}`,
        userId: pOwner.id,
        name: pOwner.name,
        email: pOwner.email,
        username: pOwner.username || pOwner.displayUsername,
        image: pOwner.image,
        avatarUrl: pOwner.image || null,
        role: "ADMIN",
        invitedById: null,
        createdAt: workspace.createdAt,
        inherited: true,
        source: "PROJECT",
        inheritedRole: "ADMIN",
        inheritedCanComment: true,
        inheritedCanAsk: true,
        effectiveCanComment: true,
        effectiveCanAsk: true,
      });
    }

    if (workspace.project.members) {
      for (const pm of workspace.project.members) {
        if (pm.userId === workspace.ownerId || pm.userId === workspace.project.ownerId) continue;
        const inheritedCaps = rowCapabilities(pm);
        membersMap.set(pm.userId, {
          id: pm.id,
          userId: pm.userId,
          name: pm.user.name,
          email: pm.user.email,
          username: pm.user.username || pm.user.displayUsername,
          image: pm.user.image,
          avatarUrl: pm.user.image || null,
          role: pm.role,
          invitedById: pm.invitedById,
          createdAt: pm.createdAt,
          inherited: true,
          source: "PROJECT",
          inheritedRole: pm.role,
          canComment: pm.canComment,
          canAsk: pm.canAsk,
          inheritedCanComment: inheritedCaps.comment,
          inheritedCanAsk: inheritedCaps.ask,
          effectiveCanComment: inheritedCaps.comment,
          effectiveCanAsk: inheritedCaps.ask,
          suspendedAt: pm.suspendedAt,
          suspendedReason: pm.suspendedReason,
          keepActive: pm.keepActive,
          monthlyCreditCap: pm.monthlyCreditCap,
        });
      }
    }
  }

  // 2. Explicit workspace members (adds rights or sets workspace role)
  for (const wm of workspace.members) {
    if (wm.userId === workspace.ownerId) continue;
    const existing = membersMap.get(wm.userId);
    const wsCaps = rowCapabilities(wm);
    if (existing) {
      existing.source = "BOTH";
      existing.role = maxRole(existing.inheritedRole, wm.role) ?? wm.role;
      existing.id = wm.id;
      // Toggles shown/edited here are the workspace row's own; the project
      // grant is unioned on top (top-down: a row can add, never remove).
      existing.canComment = wm.canComment;
      existing.canAsk = wm.canAsk;
      existing.effectiveCanComment = Boolean(existing.inheritedCanComment) || wsCaps.comment;
      existing.effectiveCanAsk = Boolean(existing.inheritedCanAsk) || wsCaps.ask;
      existing.suspendedAt = wm.suspendedAt ?? existing.suspendedAt;
      existing.suspendedReason = wm.suspendedReason ?? existing.suspendedReason;
      if (wm.monthlyCreditCap !== undefined) {
        existing.monthlyCreditCap = wm.monthlyCreditCap;
      }
    } else {
      membersMap.set(wm.userId, {
        id: wm.id,
        userId: wm.userId,
        name: wm.user.name,
        email: wm.user.email,
        username: wm.user.username || wm.user.displayUsername,
        image: wm.user.image,
        avatarUrl: wm.user.image || null,
        role: wm.role,
        invitedById: wm.invitedById,
        createdAt: wm.createdAt,
        inherited: false,
        source: "WORKSPACE",
        inheritedRole: null,
        canComment: wm.canComment,
        canAsk: wm.canAsk,
        effectiveCanComment: wsCaps.comment,
        effectiveCanAsk: wsCaps.ask,
        suspendedAt: wm.suspendedAt,
        suspendedReason: wm.suspendedReason,
        keepActive: wm.keepActive,
        monthlyCreditCap: wm.monthlyCreditCap,
      });
    }
  }

  // Populate avatars & monthly spend for members. Read-only: an owner without
  // a credit account yet simply shows 0 used (no account is created here).
  const spendByActor = await getOwnerMonthlySpendByActor(workspace.ownerId);
  const memberList = Array.from(membersMap.values());
  await Promise.all(
    memberList.map(async (m) => {
      const av = await getUserAvatar(m.userId).catch(() => null);
      if (av?.avatarUrl) {
        m.avatarUrl = av.avatarUrl;
      }
      m.monthlyCreditsUsed = spendByActor.get(m.userId) ?? 0;
    })
  );

  return {
    owner: ownerSummary,
    members: memberList,
    totalCount: memberList.length + 1, // members + owner
    canManage: can(actorRole, "workspace.manage_members"),
    isOwner: actor.userId === workspace.ownerId,
    ...(await ownerOnlyExtras(actor, workspace.ownerId, { workspaceId })),
  };
}

export async function listProjectMembers(actor: Actor, projectId: string) {
  const { role: actorRole } = await requireProject(
    actor,
    projectId,
    "workspace.read"
  );

  const proj = await db.project.findUnique({
    where: { id: projectId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          displayUsername: true,
          image: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              displayUsername: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!proj) throw Errors.notFound("Project");

  const ownerAvatar = await getUserAvatar(proj.owner.id).catch(() => null);

  const ownerSummary: MemberSummary = {
    id: `owner-${proj.owner.id}`,
    userId: proj.owner.id,
    name: proj.owner.name,
    email: proj.owner.email,
    username: proj.owner.username || proj.owner.displayUsername,
    image: proj.owner.image,
    avatarUrl: ownerAvatar?.avatarUrl || proj.owner.image || null,
    role: "OWNER",
    invitedById: null,
    createdAt: proj.createdAt,
    inherited: false,
    source: "PROJECT",
    inheritedRole: null,
  };

  const memberList: MemberSummary[] = proj.members
    .filter((m) => m.userId !== proj.ownerId)
    .map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      username: m.user.username || m.user.displayUsername,
      image: m.user.image,
      avatarUrl: m.user.image || null,
      role: m.role,
      invitedById: m.invitedById,
      createdAt: m.createdAt,
      inherited: false,
      source: "PROJECT" as const,
      inheritedRole: null,
      canComment: m.canComment,
      canAsk: m.canAsk,
      effectiveCanComment: rowCapabilities(m).comment,
      effectiveCanAsk: rowCapabilities(m).ask,
      suspendedAt: m.suspendedAt,
      suspendedReason: m.suspendedReason,
      monthlyCreditCap: m.monthlyCreditCap,
    }));

  const spendByActor = await getOwnerMonthlySpendByActor(proj.ownerId);
  await Promise.all(
    memberList.map(async (m) => {
      const av = await getUserAvatar(m.userId).catch(() => null);
      if (av?.avatarUrl) {
        m.avatarUrl = av.avatarUrl;
      }
      m.monthlyCreditsUsed = spendByActor.get(m.userId) ?? 0;
    })
  );

  return {
    owner: ownerSummary,
    members: memberList,
    totalCount: memberList.length + 1,
    canManage: can(actorRole, "workspace.manage_members"),
    isOwner: actor.userId === proj.ownerId,
    ...(await ownerOnlyExtras(actor, proj.ownerId, { projectId })),
  };
}

/**
 * Owner-only data for the Share & people dialog (F1.3): the over-limit grace
 * banner and the owner's own pending outgoing transfer (so it can be cancelled).
 */
async function ownerOnlyExtras(
  actor: Actor,
  ownerId: string,
  scope: { workspaceId?: string; projectId?: string }
) {
  if (actor.userId !== ownerId) return {};
  const [grace, outgoingTransfer] = await Promise.all([
    getOwnerGraceInfo(ownerId),
    getPendingOutgoingTransfer(actor.userId, scope),
  ]);
  return { grace, outgoingTransfer };
}

function rowCapabilities(row: {
  role: string;
  canComment?: boolean | null;
  canAsk?: boolean | null;
  suspendedAt?: Date | null;
}) {
  const caps = computeCapabilities(row.role as EffectiveRole, {
    canComment: row.canComment,
    canAsk: row.canAsk,
    suspended: Boolean(row.suspendedAt),
  });
  return { comment: caps.has("workspace.comment"), ask: caps.has("workspace.ask") };
}

export type UpdateMemberRoleInput =
  | string
  | {
      role?: string;
      canComment?: boolean | null;
      canAsk?: boolean | null;
    };

export async function updateWorkspaceMemberRole(
  actor: Actor,
  workspaceId: string,
  targetUserId: string,
  roleOrInput: UpdateMemberRoleInput
) {
  const inputObj =
    typeof roleOrInput === "string" ? { role: roleOrInput } : roleOrInput;
  const { role: newRole, canComment, canAsk } = inputObj;

  const { ws } = await requireWorkspace(actor, workspaceId, "workspace.manage_members");

  if (targetUserId === ws.ownerId) {
    throw Errors.badRequest("Cannot change the owner's role");
  }

  const validRoles: WorkspaceRole[] = [
    "VIEWER",
    "COMMENTER",
    "EDITOR",
    "ADMIN",
  ];
  if (newRole !== undefined && (!validRoles.includes(newRole as WorkspaceRole) || newRole === "OWNER")) {
    throw Errors.badRequest("Invalid role for workspace member");
  }

  // Hierarchy enforcement: only owner can promote to/demote from ADMIN
  const isOwner = actor.userId === ws.ownerId;
  const existingMember = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });

  let inheritedRole: WorkspaceRole | null = null;
  if (ws.projectId) {
    const project = await db.project.findUnique({
      where: { id: ws.projectId },
      select: { ownerId: true },
    });
    if (project?.ownerId === targetUserId) {
      inheritedRole = "ADMIN";
    } else {
      const pm = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: ws.projectId, userId: targetUserId } },
      });
      if (pm) {
        inheritedRole = pm.role as WorkspaceRole;
      }
    }
  }

  // Role changes only apply to existing members (explicit or inherited from the project).
  const isExplicitMember = Boolean(existingMember);
  if (!isExplicitMember && !inheritedRole) {
    throw Errors.notFound("Member");
  }

  // ADMIN rows reject toggles with 422. Judge by the role the member will have
  // after this request, so "demote to Editor + set toggles" in one call works.
  const effectiveTargetRole = maxRole(
    (newRole as WorkspaceRole | undefined) ?? existingMember?.role ?? null,
    inheritedRole
  );
  const hasToggles = canComment !== undefined || canAsk !== undefined;
  if (hasToggles && effectiveTargetRole === "ADMIN") {
    throw Errors.unprocessable(
      "Admin role has fixed capabilities and does not support toggles",
      "admin_toggles_not_allowed"
    );
  }

  if (!isOwner) {
    if (newRole === "ADMIN") {
      throw Errors.forbidden("Only the owner can assign the Admin role");
    }
    if (existingMember?.role === "ADMIN" || inheritedRole === "ADMIN") {
      throw Errors.forbidden("Only the owner can modify an Admin's role");
    }
  }

  // Workspace role cannot be lower than the inherited project role
  if (newRole && inheritedRole && (ROLE_RANK[newRole as WorkspaceRole] ?? 0) < (ROLE_RANK[inheritedRole] ?? 0)) {
    throw Errors.conflict(
      "Workspace role cannot be lower than the inherited project role",
      "role_below_inherited"
    );
  }

  const oldRole = existingMember?.role ?? inheritedRole ?? "VIEWER";

  const updateData: {
    role?: WorkspaceRole;
    canComment?: boolean | null;
    canAsk?: boolean | null;
  } = {};
  if (newRole !== undefined) updateData.role = newRole as WorkspaceRole;
  if (canComment !== undefined) updateData.canComment = canComment;
  if (canAsk !== undefined) updateData.canAsk = canAsk;

  const createData = {
    workspaceId,
    userId: targetUserId,
    role: (newRole ?? existingMember?.role ?? inheritedRole ?? "VIEWER") as WorkspaceRole,
    canComment: canComment ?? null,
    canAsk: canAsk ?? null,
    invitedById: actor.userId,
  };

  const updated = await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    update: updateData,
    create: createData,
  });

  await logActivity(db, {
    workspaceId,
    actorId: actor.userId,
    action: "member.role_changed",
    targetType: "user",
    targetId: targetUserId,
    meta: {
      oldRole,
      newRole: updated.role,
      canComment: updated.canComment,
      canAsk: updated.canAsk,
    },
  });

  if (newRole !== undefined && oldRole !== newRole) {
    await notifyMemberChange(
      targetUserId,
      "ROLE_CHANGED",
      { workspaceId },
      { oldRole, newRole }
    );
  }

  return { success: true, member: updated };
}

export async function updateProjectMemberRole(
  actor: Actor,
  projectId: string,
  targetUserId: string,
  roleOrInput: UpdateMemberRoleInput
) {
  const inputObj =
    typeof roleOrInput === "string" ? { role: roleOrInput } : roleOrInput;
  const { role: newRole, canComment, canAsk } = inputObj;

  const { project } = await requireProject(actor, projectId, "workspace.manage_members");

  if (targetUserId === project.ownerId) {
    throw Errors.badRequest("Cannot change the owner's role");
  }

  const validRoles: ProjectRole[] = ["VIEWER", "COMMENTER", "EDITOR", "ADMIN"];
  if (newRole !== undefined && (!validRoles.includes(newRole as ProjectRole) || newRole === "OWNER")) {
    throw Errors.badRequest("Invalid role for project member");
  }

  const isOwner = actor.userId === project.ownerId;
  const existingMember = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });

  // Role changes only apply to existing members; new people must be invited
  if (!existingMember) {
    throw Errors.notFound("Member");
  }

  const effectiveRole = newRole ?? existingMember.role;

  // ADMIN rows reject toggles with 422 (judged by the role after this request)
  const hasToggles = canComment !== undefined || canAsk !== undefined;
  if (hasToggles && effectiveRole === "ADMIN") {
    throw Errors.unprocessable(
      "Admin role has fixed capabilities and does not support toggles",
      "admin_toggles_not_allowed"
    );
  }

  if (!isOwner) {
    if (newRole === "ADMIN") {
      throw Errors.forbidden("Only the owner can assign the Admin role");
    }
    if (existingMember?.role === "ADMIN") {
      throw Errors.forbidden("Only the owner can modify an Admin's role");
    }
  }

  const oldRole = existingMember.role;

  const updateData: {
    role?: ProjectRole;
    canComment?: boolean | null;
    canAsk?: boolean | null;
  } = {};
  if (newRole !== undefined) updateData.role = newRole as ProjectRole;
  if (canComment !== undefined) updateData.canComment = canComment;
  if (canAsk !== undefined) updateData.canAsk = canAsk;

  const updated = await db.projectMember.update({
    where: { id: existingMember.id },
    data: updateData,
  });

  await logActivity(db, {
    projectId,
    actorId: actor.userId,
    action: "member.role_changed",
    targetType: "user",
    targetId: targetUserId,
    meta: {
      oldRole,
      newRole: updated.role,
      canComment: updated.canComment,
      canAsk: updated.canAsk,
    },
  });

  if (newRole !== undefined && oldRole !== newRole) {
    await notifyMemberChange(
      targetUserId,
      "ROLE_CHANGED",
      { projectId },
      { oldRole, newRole }
    );
  }

  return { success: true, member: updated };
}

export async function removeWorkspaceMember(
  actor: Actor,
  workspaceId: string,
  targetUserId: string
) {
  const isSelf = actor.userId === targetUserId;

  // Authorize first so strangers get 404 (no existence leak, no activity entries).
  // Leaving only needs read access; removing someone else needs manage_members.
  const { ws } = await requireWorkspace(
    actor,
    workspaceId,
    isSelf ? "workspace.read" : "workspace.manage_members"
  );

  if (targetUserId === ws.ownerId) {
    throw Errors.badRequest("Cannot remove the workspace owner. Transfer ownership first.");
  }

  // Check if member exists in workspace or inherits from project
  const existingWm = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });

  let inheritsFromProject = false;
  let projectRole: WorkspaceRole | null = null;
  if (ws.projectId) {
    const project = await db.project.findUnique({
      where: { id: ws.projectId },
      select: { ownerId: true },
    });
    if (project?.ownerId === targetUserId) {
      inheritsFromProject = true;
      projectRole = "ADMIN";
    } else {
      const pm = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: ws.projectId, userId: targetUserId } },
      });
      if (pm) {
        inheritsFromProject = true;
        projectRole = pm.role as WorkspaceRole;
      }
    }
  }

  if (!existingWm && !inheritsFromProject) {
    // Not a member
    throw Errors.notFound("Member");
  }

  if (!isSelf && actor.userId !== ws.ownerId) {
    // Admins (explicit or inherited from the project) can only be removed by the owner
    if (existingWm?.role === "ADMIN" || projectRole === "ADMIN") {
      throw Errors.forbidden("Only the owner can remove an Admin");
    }
  }

  if (!existingWm && inheritsFromProject) {
    // Top-down rule: a workspace can't take away access that comes from the
    // project. The only way to remove it is to remove them from the project.
    throw Errors.conflict(
      "This member's access comes from the project. Remove them from the project instead.",
      "member_inherited"
    );
  }

  if (existingWm) {
    await db.workspaceMember.delete({
      where: { id: existingWm.id },
    });
  }

  await logActivity(db, {
    workspaceId,
    actorId: actor.userId,
    action: "member.removed",
    targetType: "user",
    targetId: targetUserId,
    meta: { selfLeave: isSelf },
  });

  if (!isSelf) {
    if (inheritsFromProject && projectRole) {
      await notifyMemberChange(
        targetUserId,
        "ROLE_CHANGED",
        { workspaceId },
        { oldRole: existingWm!.role, newRole: projectRole }
      );
    } else {
      await notifyMemberChange(targetUserId, "MEMBER_REMOVED", { workspaceId });
    }
  }

  return { success: true };
}

export async function removeProjectMember(
  actor: Actor,
  projectId: string,
  targetUserId: string
) {
  const isSelf = actor.userId === targetUserId;

  // Authorize first so strangers get 404 (no existence leak, no activity entries)
  const { project } = await requireProject(
    actor,
    projectId,
    isSelf ? "workspace.read" : "workspace.manage_members"
  );

  if (targetUserId === project.ownerId) {
    throw Errors.badRequest("Cannot remove the project owner. Transfer ownership first.");
  }

  const targetMember = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!targetMember) {
    throw Errors.notFound("Member");
  }

  if (!isSelf && actor.userId !== project.ownerId && targetMember.role === "ADMIN") {
    throw Errors.forbidden("Only the owner can remove an Admin");
  }

  // Removing from project deletes ProjectMember row, removing inherited workspace access
  await db.projectMember.delete({ where: { id: targetMember.id } });

  await logActivity(db, {
    projectId,
    actorId: actor.userId,
    action: "member.removed",
    targetType: "user",
    targetId: targetUserId,
    meta: { selfLeave: isSelf },
  });

  if (!isSelf) {
    await notifyMemberChange(targetUserId, "MEMBER_REMOVED", { projectId });
  }

  return { success: true };
}

export async function transferWorkspaceOwnership(
  actor: Actor,
  workspaceId: string,
  input: { newOwnerId: string; confirmation: string }
) {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, title: true, ownerId: true },
  });

  if (!ws) throw Errors.notFound("Workspace");

  if (actor.userId !== ws.ownerId) {
    throw Errors.forbidden("Only the workspace owner can transfer ownership");
  }

  const { newOwnerId, confirmation } = input;
  const cleanConf = confirmation.trim();
  if (cleanConf !== "TRANSFER" && cleanConf !== ws.title.trim()) {
    throw Errors.badRequest("Invalid confirmation text. Type 'TRANSFER' or the workspace title.");
  }

  if (newOwnerId === actor.userId) {
    throw Errors.badRequest("You are already the owner of this workspace");
  }

  const targetUser = await db.user.findUnique({
    where: { id: newOwnerId },
  });
  if (!targetUser) {
    throw Errors.notFound("New owner user");
  }

  const targetAccess = await resolveWorkspaceRole(newOwnerId, workspaceId);
  if (!targetAccess) {
    throw Errors.badRequest("New owner must be an existing member of this workspace");
  }

  return await db.$transaction(async (tx) => {
    // 1. Update workspace owner
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { ownerId: newOwnerId },
    });

    // 2. Remove new owner from workspaceMember table if present
    await tx.workspaceMember.deleteMany({
      where: { workspaceId, userId: newOwnerId },
    });

    // 3. Make previous owner an ADMIN
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: actor.userId } },
      update: { role: "ADMIN" },
      create: {
        workspaceId,
        userId: actor.userId,
        role: "ADMIN",
        invitedById: actor.userId,
      },
    });

    // 4. Log activity
    await logActivity(tx, {
      workspaceId,
      actorId: actor.userId,
      action: "workspace.ownership_transferred",
      targetType: "user",
      targetId: newOwnerId,
      meta: {
        previousOwnerId: actor.userId,
        newOwnerId,
      },
    });

    return { success: true, newOwnerId };
  });
}

export async function transferProjectOwnership(
  actor: Actor,
  projectId: string,
  input: { newOwnerId: string; confirmation: string }
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, ownerId: true },
  });

  if (!project) throw Errors.notFound("Project");

  if (actor.userId !== project.ownerId) {
    throw Errors.forbidden("Only the project owner can transfer ownership");
  }

  const { newOwnerId, confirmation } = input;
  const cleanConf = confirmation.trim();
  if (cleanConf !== "TRANSFER" && cleanConf !== project.name.trim()) {
    throw Errors.badRequest("Invalid confirmation text. Type 'TRANSFER' or the project name.");
  }

  if (newOwnerId === actor.userId) {
    throw Errors.badRequest("You are already the owner of this project");
  }

  const targetUser = await db.user.findUnique({
    where: { id: newOwnerId },
  });
  if (!targetUser) {
    throw Errors.notFound("New owner user");
  }

  const targetMembership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: newOwnerId } },
  });
  if (!targetMembership) {
    throw Errors.badRequest("New owner must be an existing member of this project");
  }

  return await db.$transaction(async (tx) => {
    // 1. Update project owner
    await tx.project.update({
      where: { id: projectId },
      data: { ownerId: newOwnerId },
    });

    // 2. Remove new owner from projectMember table
    await tx.projectMember.deleteMany({
      where: { projectId, userId: newOwnerId },
    });

    // 3. Make previous owner an ADMIN
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: actor.userId } },
      update: { role: "ADMIN" },
      create: {
        projectId,
        userId: actor.userId,
        role: "ADMIN",
        invitedById: actor.userId,
      },
    });

    // 4. Log activity
    await logActivity(tx, {
      projectId,
      actorId: actor.userId,
      action: "project.ownership_transferred",
      targetType: "user",
      targetId: newOwnerId,
      meta: {
        previousOwnerId: actor.userId,
        newOwnerId,
      },
    });

    return { success: true, newOwnerId };
  });
}

/**
 * Number of people with access to a workspace: the owner, plus explicit
 * members, plus project members inheriting access.
 */
export async function countWorkspaceMembers(workspaceId: string): Promise<number> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      ownerId: true,
      members: { select: { userId: true, role: true } },
      project: {
        select: {
          ownerId: true,
          members: { select: { userId: true } },
        },
      },
    },
  });
  if (!ws) return 0;

  const people = new Set<string>();
  if (ws.project?.ownerId) people.add(ws.project.ownerId);
  for (const pm of ws.project?.members ?? []) people.add(pm.userId);
  for (const wm of ws.members ?? []) {
    people.add(wm.userId);
  }
  people.delete(ws.ownerId);
  return people.size + 1;
}


export async function updateWorkspaceMemberCap(
  actor: Actor,
  workspaceId: string,
  targetUserId: string,
  monthlyCreditCap: number | null
) {
  const { ws } = await requireWorkspace(actor, workspaceId, "workspace.manage_members");
  if (actor.userId !== ws.ownerId) {
    throw Errors.forbidden("Only the workspace owner can modify collaborator spend caps");
  }
  if (targetUserId === ws.ownerId) {
    throw Errors.badRequest("Cannot set a collaborator cap on the workspace owner");
  }
  if (monthlyCreditCap !== null && (!Number.isInteger(monthlyCreditCap) || monthlyCreditCap < 0)) {
    throw Errors.badRequest("monthlyCreditCap must be a non-negative integer or null");
  }

  const existingMember = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
  });
  if (!existingMember) {
    // A member who only inherits access from the project has no WorkspaceMember
    // row. Creating one just to hold the cap would turn them into an explicit
    // member whose access survives removal from the project, so their cap is
    // managed on the project instead (resolveMemberMonthlyCreditCap reads it there).
    const projectMember =
      ws.projectId
        ? await db.projectMember.findUnique({
            where: { projectId_userId: { projectId: ws.projectId, userId: targetUserId } },
            select: { id: true },
          })
        : null;
    if (projectMember) {
      throw Errors.conflict(
        "This member has access through the project. Change their credit cap from the project's members."
      );
    }
    throw Errors.notFound("Member");
  }

  const updated = await db.workspaceMember.update({
    where: { id: existingMember.id },
    data: { monthlyCreditCap },
  });

  await logActivity(db, {
    workspaceId,
    actorId: actor.userId,
    action: "member.cap_changed",
    targetType: "user",
    targetId: targetUserId,
    meta: { monthlyCreditCap },
  });

  return { success: true, member: updated };
}

export async function updateProjectMemberCap(
  actor: Actor,
  projectId: string,
  targetUserId: string,
  monthlyCreditCap: number | null
) {
  const { project } = await requireProject(actor, projectId, "workspace.manage_members");
  if (actor.userId !== project.ownerId) {
    throw Errors.forbidden("Only the project owner can modify collaborator spend caps");
  }
  if (targetUserId === project.ownerId) {
    throw Errors.badRequest("Cannot set a collaborator cap on the project owner");
  }
  if (monthlyCreditCap !== null && (!Number.isInteger(monthlyCreditCap) || monthlyCreditCap < 0)) {
    throw Errors.badRequest("monthlyCreditCap must be a non-negative integer or null");
  }

  const existingMember = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!existingMember) {
    throw Errors.notFound("Member");
  }

  const updated = await db.projectMember.update({
    where: { id: existingMember.id },
    data: { monthlyCreditCap },
  });

  await logActivity(db, {
    projectId,
    actorId: actor.userId,
    action: "member.cap_changed",
    targetType: "user",
    targetId: targetUserId,
    meta: { monthlyCreditCap },
  });

  return { success: true, member: updated };
}
