import "server-only";
import { db } from "@/server/db/client";
import { getEntitlements } from "@/server/billing/entitlements";
import { notify } from "@/server/services/notify";
import { Errors } from "@/server/http/errors";
import type { Actor } from "@/server/auth/session";

// TODO(8.3/8.4): Triggered by billing subscription downgrades/cancellations (see quick_implementation_fix_for_v2.md Step 8.3/8.4)

export interface GracePeriodInfo {
  inGrace: boolean;
  limit: number;
  graceEndsAt: Date | null;
  daysRemaining: number;
}

/**
 * Check if the owner is currently in an over-limit grace period.
 */
export async function isOwnerInGrace(ownerId: string): Promise<boolean> {
  const grace = await db.memberLimitGrace.findUnique({
    where: { ownerId },
    select: { graceEndsAt: true },
  });
  if (!grace) return false;
  return grace.graceEndsAt > new Date();
}

/**
 * Get active grace period info for an owner (used by Share & People dialog banner).
 */
export async function getOwnerGraceInfo(ownerId: string): Promise<GracePeriodInfo> {
  const grace = await db.memberLimitGrace.findUnique({
    where: { ownerId },
  });
  if (!grace || grace.graceEndsAt <= new Date()) {
    return {
      inGrace: false,
      limit: 0,
      graceEndsAt: null,
      daysRemaining: 0,
    };
  }

  const msRemaining = grace.graceEndsAt.getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  return {
    inGrace: true,
    limit: grace.limit,
    graceEndsAt: grace.graceEndsAt,
    daysRemaining,
  };
}

/**
 * Start 14-day over-limit grace period when owner downgrades or exceeds member limits.
 * Notifies owner and collaborator members, blocks new invitations.
 */
export async function startOverLimitGrace(ownerId: string, newLimit: number) {
  const graceEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const grace = await db.memberLimitGrace.upsert({
    where: { ownerId },
    update: {
      limit: newLimit,
      graceEndsAt,
    },
    create: {
      ownerId,
      limit: newLimit,
      graceEndsAt,
    },
  });

  // Notify owner
  await notify(ownerId, "MEMBER_LIMIT_EXCEEDED", {
    limit: newLimit,
    graceEndsAt: graceEndsAt.toISOString(),
  });

  // Collect all distinct collaborator userIds across owner's workspaces and projects
  const [workspaces, projects] = await Promise.all([
    db.workspace.findMany({
      where: { ownerId, deletedAt: null },
      select: {
        id: true,
        members: {
          where: { suspendedAt: null, userId: { not: ownerId } },
          select: { userId: true },
        },
      },
    }),
    db.project.findMany({
      where: { ownerId, deletedAt: null },
      select: {
        id: true,
        members: {
          where: { suspendedAt: null, userId: { not: ownerId } },
          select: { userId: true },
        },
      },
    }),
  ]);

  const memberUserIds = new Set<string>();
  for (const ws of workspaces) {
    for (const m of ws.members) memberUserIds.add(m.userId);
  }
  for (const p of projects) {
    for (const m of p.members) memberUserIds.add(m.userId);
  }

  for (const memberUserId of memberUserIds) {
    await notify(memberUserId, "MEMBER_LIMIT_EXCEEDED", {
      limit: newLimit,
      graceEndsAt: graceEndsAt.toISOString(),
    });
  }

  return grace;
}

/**
 * Enforce member limit after grace period has expired.
 * Suspends the most recently added members beyond the limit across all the owner's workspaces/projects
 * (suspendedAt = now, suspendedReason = "PLAN_LIMIT"), respecting explicit keepActive flags.
 * Notifies each suspended member.
 */
export async function enforceMemberLimit(ownerId: string) {
  const grace = await db.memberLimitGrace.findUnique({
    where: { ownerId },
  });
  const limit = grace ? grace.limit : (await getEntitlements(ownerId)).limits.members;

  // Find all active (non-suspended) members in owner's workspaces and projects
  const [wsMembers, projMembers] = await Promise.all([
    db.workspaceMember.findMany({
      where: {
        workspace: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: null,
      },
      include: {
        workspace: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" }, // Most recently added first
    }),
    db.projectMember.findMany({
      where: {
        project: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: null,
      },
      include: {
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" }, // Most recently added first
    }),
  ]);

  // Total active memberships
  const totalActive = wsMembers.length + projMembers.length;
  if (totalActive <= limit) {
    return { suspendedCount: 0 };
  }

  const excess = totalActive - limit;

  // Candidates for suspension: those without keepActive === true
  const candidates: Array<{
    type: "workspace" | "project";
    id: string;
    userId: string;
    createdAt: Date;
    resourceName: string;
    keepActive: boolean;
  }> = [
    ...wsMembers.map((m) => ({
      type: "workspace" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      resourceName: m.workspace.title,
      keepActive: m.keepActive,
    })),
    ...projMembers.map((m) => ({
      type: "project" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      resourceName: m.project.name,
      keepActive: m.keepActive,
    })),
  ];

  // Put non-keepActive items first, sorted by createdAt desc (most recent first)
  const toSuspend = candidates
    .filter((c) => !c.keepActive)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, excess);

  const now = new Date();
  for (const item of toSuspend) {
    if (item.type === "workspace") {
      await db.workspaceMember.update({
        where: { id: item.id },
        data: {
          suspendedAt: now,
          suspendedReason: "PLAN_LIMIT",
        },
      });
    } else {
      await db.projectMember.update({
        where: { id: item.id },
        data: {
          suspendedAt: now,
          suspendedReason: "PLAN_LIMIT",
        },
      });
    }

    await notify(item.userId, "MEMBER_SUSPENDED", {
      resourceName: item.resourceName,
      reason: "PLAN_LIMIT",
    });
  }

  return { suspendedCount: toSuspend.length };
}

/**
 * Un-suspends oldest-first up to the current limit across all owner's workspaces/projects.
 * Notifies each restored member.
 */
export async function restoreWithinLimit(ownerId: string, limitOverride?: number) {
  const grace = await db.memberLimitGrace.findUnique({ where: { ownerId } });
  const entitlements = await getEntitlements(ownerId);
  const limit = limitOverride ?? (grace ? grace.limit : entitlements.limits.members);

  // Count currently active (non-suspended) members
  const [activeWsCount, activeProjCount] = await Promise.all([
    db.workspaceMember.count({
      where: {
        workspace: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: null,
      },
    }),
    db.projectMember.count({
      where: {
        project: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: null,
      },
    }),
  ]);

  const currentActive = activeWsCount + activeProjCount;
  const availableSlots = Math.max(0, limit - currentActive);

  if (availableSlots <= 0) {
    return { restoredCount: 0 };
  }

  // Find suspended members, oldest-first
  const [suspendedWs, suspendedProj] = await Promise.all([
    db.workspaceMember.findMany({
      where: {
        workspace: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: { not: null },
      },
      include: {
        workspace: { select: { title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.projectMember.findMany({
      where: {
        project: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: { not: null },
      },
      include: {
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const candidates: Array<{
    type: "workspace" | "project";
    id: string;
    userId: string;
    createdAt: Date;
    resourceName: string;
  }> = [
    ...suspendedWs.map((m) => ({
      type: "workspace" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      resourceName: m.workspace.title,
    })),
    ...suspendedProj.map((m) => ({
      type: "project" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      resourceName: m.project.name,
    })),
  ];

  // Oldest first
  const toRestore = candidates
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, availableSlots);

  for (const item of toRestore) {
    if (item.type === "workspace") {
      await db.workspaceMember.update({
        where: { id: item.id },
        data: {
          suspendedAt: null,
          suspendedReason: null,
        },
      });
    } else {
      await db.projectMember.update({
        where: { id: item.id },
        data: {
          suspendedAt: null,
          suspendedReason: null,
        },
      });
    }

    await notify(item.userId, "MEMBER_RESTORED", {
      resourceName: item.resourceName,
    });
  }

  // Clean up grace record if within limit
  if (currentActive + toRestore.length <= limit) {
    await db.memberLimitGrace.deleteMany({
      where: { ownerId },
    });
  }

  return { restoredCount: toRestore.length };
}

/**
 * Toggle keepActive flag for a member.
 */
export async function setMemberKeepActive(
  actor: Actor,
  target: { workspaceId?: string; projectId?: string; targetUserId: string; keepActive: boolean }
) {
  const { workspaceId, projectId, targetUserId, keepActive } = target;

  if (workspaceId) {
    const ws = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!ws) throw Errors.notFound("Workspace");
    if (ws.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the owner can set member keep-active status");
    }

    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { keepActive },
    });
  } else if (projectId) {
    const p = await db.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!p) throw Errors.notFound("Project");
    if (p.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the owner can set member keep-active status");
    }

    await db.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { keepActive },
    });
  }

  return { success: true };
}
