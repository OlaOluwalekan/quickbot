import "server-only";
import { db } from "@/server/db/client";
import { getEntitlements } from "@/server/billing/entitlements";
import { notify } from "@/server/services/notify";
import { Errors } from "@/server/http/errors";
import { requireWorkspace, requireProject } from "@/server/authz/access";
import type { Actor } from "@/server/auth/session";
import type { Prisma } from "../db/generated/client";

// Over-limit suspension service (quick_implementation_fix_for_v2.md §2.5, Step F1.3).
// Built now, triggered later:
// TODO(8.3/8.4): call startOverLimitGrace on downgrade/expiry, enforceMemberLimit
// when the grace period ends, and restoreWithinLimit on (re-)subscription.
//
// The member limit counts **distinct people across all of the owner's
// workspaces and projects** (owner decided 2026-11-14, Step 8.1): someone who
// collaborates in three of the owner's workspaces is one collaborator. Pending,
// unexpired invitations hold a seat for the invitee. The invite check
// (`assertMemberCapacity` in invitation.ts), the dialog's gate and
// `checkTransferFits` all count with `getOwnerCollaborators`.

type DbClient = Prisma.TransactionClient | typeof db;

export interface OwnerCollaborators {
  /** One key per person: `u:<userId>`, or `e:<email>` for an invitee without an account. */
  keys: Set<string>;
  /** Lower-cased emails and usernames of the counted people (owner-only UI hint). */
  handles: Set<string>;
}

/**
 * The people who count toward `ownerId`'s collaborator limit: active
 * (non-suspended) members of the owner's non-deleted workspaces and projects,
 * plus invitees of live pending invitations to them. The owner is never counted.
 */
export async function getOwnerCollaborators(
  ownerId: string,
  opts: { client?: DbClient; excludeInvitationId?: string } = {}
): Promise<OwnerCollaborators> {
  const client = opts.client ?? db;
  const now = new Date();
  const userSelect = { select: { id: true, email: true, username: true } } as const;
  const [wsMembers, projMembers, invites] = await Promise.all([
    client.workspaceMember.findMany({
      where: { workspace: { ownerId, deletedAt: null }, userId: { not: ownerId }, suspendedAt: null },
      select: { user: userSelect },
    }),
    client.projectMember.findMany({
      where: { project: { ownerId, deletedAt: null }, userId: { not: ownerId }, suspendedAt: null },
      select: { user: userSelect },
    }),
    client.invitation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: now },
        OR: [
          { workspace: { ownerId, deletedAt: null } },
          { project: { ownerId, deletedAt: null } },
        ],
        ...(opts.excludeInvitationId ? { id: { not: opts.excludeInvitationId } } : {}),
      },
      select: { email: true, invitedUserId: true },
    }),
  ]);

  const keys = new Set<string>();
  const handles = new Set<string>();
  const addUser = (u: { id: string; email: string; username: string | null }) => {
    if (u.id === ownerId) return;
    keys.add(`u:${u.id}`);
    handles.add(u.email.toLowerCase());
    if (u.username) handles.add(u.username.toLowerCase());
  };
  for (const m of [...wsMembers, ...projMembers]) addUser(m.user);

  // An invitation may predate the invitee's account: match those by email.
  const unknownEmails = [
    ...new Set(
      invites.filter((i) => !i.invitedUserId).map((i) => i.email.toLowerCase())
    ),
  ];
  const usersByEmail = new Map<string, { id: string; email: string; username: string | null }>();
  if (unknownEmails.length > 0) {
    const users = await client.user.findMany({
      where: { email: { in: unknownEmails, mode: "insensitive" } },
      select: { id: true, email: true, username: true },
    });
    for (const u of users) usersByEmail.set(u.email.toLowerCase(), u);
  }
  for (const inv of invites) {
    const email = inv.email.toLowerCase();
    const userId = inv.invitedUserId ?? usersByEmail.get(email)?.id;
    if (userId === ownerId) continue;
    if (userId) keys.add(`u:${userId}`);
    else keys.add(`e:${email}`);
    handles.add(email);
    const u = usersByEmail.get(email);
    if (u?.username) handles.add(u.username.toLowerCase());
  }
  return { keys, handles };
}

/** Does `invitee` already hold one of the owner's collaborator seats? */
export function isCountedCollaborator(
  collaborators: OwnerCollaborators,
  invitee: { userId?: string | null; email: string }
): boolean {
  return (
    (invitee.userId ? collaborators.keys.has(`u:${invitee.userId}`) : false) ||
    collaborators.keys.has(`e:${invitee.email.toLowerCase()}`)
  );
}

export interface InviteCapacity {
  /** Collaborators allowed by the owner's plan, across all their workspaces and projects. */
  limit: number;
  /** Distinct people counted now (members + live pending invitations). */
  used: number;
  /** The owner is over their limit: no new invitations until it ends. */
  inGrace: boolean;
}

/**
 * The owner's collaborator seats. The one source for the invite check
 * (`assertMemberCapacity`) and the dialog's gate (F4.4), so both count the
 * same people. Inviting someone who already holds a seat is always allowed.
 */
export async function getInviteCapacity(
  ownerId: string,
  opts: { client?: DbClient; excludeInvitationId?: string } = {}
): Promise<InviteCapacity & { collaborators: OwnerCollaborators }> {
  const [inGrace, entitlements, collaborators] = await Promise.all([
    isOwnerInGrace(ownerId),
    getEntitlements(ownerId),
    getOwnerCollaborators(ownerId, opts),
  ]);
  return {
    limit: entitlements.limits.members,
    used: collaborators.keys.size,
    inGrace,
    collaborators,
  };
}

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

/** Groups membership rows by person. */
function groupByPerson(rows: MembershipRow[]) {
  const map = new Map<string, MembershipRow[]>();
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push(r);
    map.set(r.userId, list);
  }
  return map;
}

/**
 * After the grace period: keeps `limit` people active across all the owner's
 * workspaces and projects and suspends every membership of the others
 * (read-only, nothing is deleted). People the owner marked "Keep active" (on
 * any of their memberships) stay first, then the earliest added.
 * Does nothing while the grace period is still running.
 */
export async function enforceMemberLimit(ownerId: string) {
  const grace = await db.memberLimitGrace.findUnique({ where: { ownerId } });
  if (grace && grace.graceEndsAt > new Date()) {
    return { suspendedCount: 0, inGrace: true };
  }
  const limit = grace ? grace.limit : (await getEntitlements(ownerId)).limits.members;

  const people = [...groupByPerson(await ownerMemberships(ownerId, false)).values()].map(
    (rows) => ({
      rows,
      keepActive: rows.some((r) => r.keepActive),
      firstAdded: Math.min(...rows.map((r) => r.createdAt.getTime())),
    })
  );
  people.sort(
    (a, b) => Number(b.keepActive) - Number(a.keepActive) || a.firstAdded - b.firstAdded
  );

  const now = new Date();
  const suspended: MembershipRow[] = [];
  for (const person of people.slice(Math.max(0, limit))) {
    for (const row of person.rows) {
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
 * Un-suspends plan-limit suspensions person by person, earliest added first,
 * while the owner's distinct active collaborators stay within the limit. A
 * person who is already active elsewhere takes no new seat, so all their
 * suspended memberships come back. Clears the grace record.
 */
export async function restoreWithinLimit(ownerId: string, limitOverride?: number) {
  const limit = limitOverride ?? (await getEntitlements(ownerId)).limits.members;

  const [active, suspended] = await Promise.all([
    ownerMemberships(ownerId, false),
    ownerMemberships(ownerId, true),
  ]);
  const activePeople = new Set(active.map((r) => r.userId));

  const candidates = [...groupByPerson(suspended).entries()]
    .map(([userId, rows]) => ({
      userId,
      rows,
      firstAdded: Math.min(...rows.map((r) => r.createdAt.getTime())),
    }))
    .sort(
      (a, b) =>
        Number(activePeople.has(b.userId)) - Number(activePeople.has(a.userId)) ||
        a.firstAdded - b.firstAdded
    );

  const restored: MembershipRow[] = [];
  for (const person of candidates) {
    if (!activePeople.has(person.userId)) {
      if (activePeople.size >= limit) continue;
      activePeople.add(person.userId);
    }
    for (const row of person.rows) {
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
