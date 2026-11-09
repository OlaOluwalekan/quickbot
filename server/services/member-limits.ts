import "server-only";
import { db } from "@/server/db/client";
import { getEntitlements } from "@/server/billing/entitlements";
import { notify } from "@/server/services/notify";
import { Errors } from "@/server/http/errors";
import { requireWorkspace, requireProject } from "@/server/authz/access";
import type { Actor } from "@/server/auth/session";

// Over-limit suspension service (quick_implementation_fix_for_v2.md §2.5, Step F1.3).
// Built now, triggered later:
// TODO(8.3/8.4): call startOverLimitGrace on downgrade/expiry, enforceMemberLimit
// when the grace period ends, and restoreWithinLimit on (re-)subscription.
//
// The member limit is per resource (as `assertMemberCapacity` in invitation.ts
// and `checkTransferFits` count it): each of the owner's workspaces and projects
// may have at most `limit` active members.

const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GracePeriodInfo {
  inGrace: boolean;
  limit: number;
  graceEndsAt: Date | null;
  daysRemaining: number;
}

export async function isOwnerInGrace(ownerId: string): Promise<boolean> {
  const grace = await db.memberLimitGrace.findUnique({
    where: { ownerId },
    select: { graceEndsAt: true },
  });
  return Boolean(grace && grace.graceEndsAt > new Date());
}

/** Active grace period for the Share & people banner. */
export async function getOwnerGraceInfo(ownerId: string): Promise<GracePeriodInfo> {
  const grace = await db.memberLimitGrace.findUnique({ where: { ownerId } });
  if (!grace || grace.graceEndsAt <= new Date()) {
    return { inGrace: false, limit: 0, graceEndsAt: null, daysRemaining: 0 };
  }
  return {
    inGrace: true,
    limit: grace.limit,
    graceEndsAt: grace.graceEndsAt,
    daysRemaining: Math.max(0, Math.ceil((grace.graceEndsAt.getTime() - Date.now()) / DAY_MS)),
  };
}

type MembershipRow = {
  kind: "workspace" | "project";
  id: string;
  userId: string;
  createdAt: Date;
  keepActive: boolean;
  resourceId: string;
  resourceName: string;
};

async function ownerMemberships(ownerId: string, suspended: boolean): Promise<MembershipRow[]> {
  const suspendedFilter = suspended ? { not: null } : null;
  const [ws, proj] = await Promise.all([
    db.workspaceMember.findMany({
      where: {
        workspace: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: suspendedFilter,
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        keepActive: true,
        workspaceId: true,
        workspace: { select: { title: true } },
      },
    }),
    db.projectMember.findMany({
      where: {
        project: { ownerId, deletedAt: null },
        userId: { not: ownerId },
        suspendedAt: suspendedFilter,
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        keepActive: true,
        projectId: true,
        project: { select: { name: true } },
      },
    }),
  ]);
  return [
    ...ws.map((m) => ({
      kind: "workspace" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      keepActive: m.keepActive,
      resourceId: m.workspaceId,
      resourceName: m.workspace.title,
    })),
    ...proj.map((m) => ({
      kind: "project" as const,
      id: m.id,
      userId: m.userId,
      createdAt: m.createdAt,
      keepActive: m.keepActive,
      resourceId: m.projectId,
      resourceName: m.project.name,
    })),
  ];
}

function groupByResource(rows: MembershipRow[]) {
  const map = new Map<string, MembershipRow[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.resourceId}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return map;
}

async function setSuspended(row: MembershipRow, suspendedAt: Date | null) {
  const data = { suspendedAt, suspendedReason: suspendedAt ? "PLAN_LIMIT" : null };
  if (row.kind === "workspace") {
    await db.workspaceMember.update({ where: { id: row.id }, data });
  } else {
    await db.projectMember.update({ where: { id: row.id }, data });
  }
}

function hrefFor(row: MembershipRow) {
  return row.kind === "workspace" ? `/workspaces/${row.resourceId}` : `/projects/${row.resourceId}`;
}

/**
 * Starts the 14-day grace period. Notifies the owner and every active member;
 * new invitations are blocked while it runs (invitation.ts).
 */
export async function startOverLimitGrace(ownerId: string, newLimit: number) {
  const graceEndsAt = new Date(Date.now() + GRACE_MS);

  const grace = await db.memberLimitGrace.upsert({
    where: { ownerId },
    update: { limit: newLimit, graceEndsAt },
    create: { ownerId, limit: newLimit, graceEndsAt },
  });

  const payload = { limit: newLimit, graceEndsAt: graceEndsAt.toISOString() };
  await notify(ownerId, "MEMBER_LIMIT_EXCEEDED", { ...payload, isOwner: true });

  const memberUserIds = new Set((await ownerMemberships(ownerId, false)).map((m) => m.userId));
  for (const userId of memberUserIds) {
    await notify(userId, "MEMBER_LIMIT_EXCEEDED", { ...payload, isOwner: false });
  }

  return grace;
}

/**
 * After the grace period: in each of the owner's workspaces/projects, suspends
 * the most recently added active members beyond the limit (read-only, nothing
 * is deleted). Members the owner marked "Keep active" are suspended last.
 * Does nothing while the grace period is still running.
 */
export async function enforceMemberLimit(ownerId: string) {
  const grace = await db.memberLimitGrace.findUnique({ where: { ownerId } });
  if (grace && grace.graceEndsAt > new Date()) {
    return { suspendedCount: 0, inGrace: true };
  }
  const limit = grace ? grace.limit : (await getEntitlements(ownerId)).limits.members;

  const now = new Date();
  const suspended: MembershipRow[] = [];
  for (const rows of groupByResource(await ownerMemberships(ownerId, false)).values()) {
    if (rows.length <= limit) continue;
    // Keep: keepActive first, then oldest. Everything after `limit` is suspended.
    const ordered = [...rows].sort(
      (a, b) =>
        Number(b.keepActive) - Number(a.keepActive) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
    for (const row of ordered.slice(limit)) {
      await setSuspended(row, now);
      suspended.push(row);
    }
  }

  for (const row of suspended) {
    await notify(row.userId, "MEMBER_SUSPENDED", {
      resourceName: row.resourceName,
      reason: "PLAN_LIMIT",
      href: hrefFor(row),
    });
  }

  return { suspendedCount: suspended.length, inGrace: false };
}

/**
 * Un-suspends plan-limit suspensions oldest-first, up to the owner's current
 * plan limit in each resource. Clears the grace record.
 */
export async function restoreWithinLimit(ownerId: string, limitOverride?: number) {
  const limit = limitOverride ?? (await getEntitlements(ownerId)).limits.members;

  const [active, suspended] = await Promise.all([
    ownerMemberships(ownerId, false),
    ownerMemberships(ownerId, true),
  ]);
  const activeByResource = groupByResource(active);

  const restored: MembershipRow[] = [];
  for (const [key, rows] of groupByResource(suspended)) {
    const slots = Math.max(0, limit - (activeByResource.get(key)?.length ?? 0));
    const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const row of ordered.slice(0, slots)) {
      await setSuspended(row, null);
      restored.push(row);
    }
  }

  for (const row of restored) {
    await notify(row.userId, "MEMBER_RESTORED", {
      resourceName: row.resourceName,
      href: hrefFor(row),
    });
  }

  await db.memberLimitGrace.deleteMany({ where: { ownerId } });

  return { restoredCount: restored.length };
}

/**
 * Owner-only "Keep active" toggle. On a workspace, a member inherited from the
 * project is stored on the project row (when the same person owns both).
 */
export async function setMemberKeepActive(
  actor: Actor,
  target: { workspaceId?: string; projectId?: string; targetUserId: string; keepActive: boolean }
) {
  const { workspaceId, projectId, targetUserId, keepActive } = target;

  if (workspaceId) {
    const { ws } = await requireWorkspace(actor, workspaceId, "workspace.read");
    if (ws.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the owner can choose who stays active");
    }
    const updated = await db.workspaceMember.updateMany({
      where: { workspaceId, userId: targetUserId },
      data: { keepActive },
    });
    if (updated.count > 0) return { success: true };

    if (ws.projectId) {
      const inherited = await db.projectMember.updateMany({
        where: { projectId: ws.projectId, userId: targetUserId, project: { ownerId: actor.userId } },
        data: { keepActive },
      });
      if (inherited.count > 0) return { success: true };
    }
    throw Errors.notFound("Member");
  }

  if (projectId) {
    const { project } = await requireProject(actor, projectId, "workspace.read");
    if (project.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the owner can choose who stays active");
    }
    const updated = await db.projectMember.updateMany({
      where: { projectId, userId: targetUserId },
      data: { keepActive },
    });
    if (updated.count === 0) throw Errors.notFound("Member");
    return { success: true };
  }

  throw Errors.badRequest("Either workspaceId or projectId must be provided");
}
