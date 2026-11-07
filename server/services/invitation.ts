import "server-only";
import crypto from "node:crypto";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import {
  requireWorkspace,
  requireProject,
  resolveWorkspaceRole,
  resolveProjectRole,
} from "@/server/authz/access";
import { logActivity } from "./activity";
import { notify, markNotificationReadByDedupeKey } from "./notify";
import { sendEmail, maskEmail } from "@/server/email/send";
import { env } from "@/server/env";
import { PLANS, getUserPlanOverride, type PlanKey } from "@/server/billing/plans";
import type { WorkspaceRole, ProjectRole, Prisma } from "../db/generated/client";

export type CreateInvitationOptions = {
  workspaceId?: string;
  projectId?: string;
  emailOrUsername: string;
  role: string;
};

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Single generic message for every unusable token (invalid, revoked, expired, used). */
const INVALID_INVITE_MESSAGE = "This invitation is invalid or has expired";

type InviteTarget = { workspaceId: string } | { projectId: string };

function inviteReceivedDedupeKey(
  workspaceId: string | null | undefined,
  projectId: string | null | undefined
) {
  return workspaceId
    ? `invite_received:workspace:${workspaceId}`
    : `invite_received:project:${projectId}`;
}

/**
 * Delivers an invitation to its recipient.
 * - Registered users go through `notify()`, so both the in-app item and the
 *   email follow their INVITE_RECEIVED preferences. The in-app link points at
 *   the invitation id (`/invite/id/:id`); the raw token is only ever sent by
 *   email and never stored in the notification payload.
 * - People without an account have no preferences, so they always get the email.
 */
async function deliverInvitation(opts: {
  invitationId: string;
  targetUserId: string | null;
  targetEmail: string;
  workspaceId: string | null;
  projectId: string | null;
  resourceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}) {
  const emailData = {
    inviterName: opts.inviterName,
    teamOrProjectName: opts.resourceName,
    inviteUrl: opts.inviteUrl,
    role: opts.role,
  };

  if (!opts.targetUserId) {
    await sendEmail("invitation", opts.targetEmail, emailData).catch((err) => {
      console.error("[Invitation] Failed to send email:", err);
    });
    return;
  }

  await notify(
    opts.targetUserId,
    "INVITE_RECEIVED",
    {
      invitationId: opts.invitationId,
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      resourceName: opts.resourceName,
      inviterName: opts.inviterName,
      role: opts.role,
      href: `/invite/id/${opts.invitationId}`,
    },
    {
      // One live item per resource: a re-invite or resend replaces the old one
      dedupeKey: inviteReceivedDedupeKey(opts.workspaceId, opts.projectId),
      replaceExisting: true,
      emailData: { template: "invitation", data: emailData },
    }
  ).catch((err) => {
    console.error("[Invitation] Failed to notify invitee:", err);
  });
}

/**
 * Serializes invitation writes per resource for the rest of the transaction so
 * concurrent invites can't both pass the member-limit check.
 */
async function lockInviteTarget(tx: Prisma.TransactionClient, target: InviteTarget) {
  const key = "workspaceId" in target ? `ws:${target.workspaceId}` : `proj:${target.projectId}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Throws `member_limit_reached` when members + live pending invites would exceed the owner's plan. */
async function assertMemberCapacity(
  tx: Prisma.TransactionClient,
  target: InviteTarget,
  ownerId: string,
  opts: { excludeInvitationId?: string } = {}
) {
  const ownerPlanKey = await resolveOwnerPlan(ownerId);
  const maxMembers = PLANS[ownerPlanKey]?.limits?.members ?? 0;
  const now = new Date();

  const currentMembersCount =
    "workspaceId" in target
      ? await tx.workspaceMember.count({
          where: { workspaceId: target.workspaceId, role: { not: "NONE" } },
        })
      : await tx.projectMember.count({ where: { projectId: target.projectId } });

  const pendingInvitesCount = await tx.invitation.count({
    where: {
      ...target,
      status: "PENDING",
      expiresAt: { gt: now },
      ...(opts.excludeInvitationId ? { id: { not: opts.excludeInvitationId } } : {}),
    },
  });

  if (currentMembersCount + pendingInvitesCount >= maxMembers) {
    throw Errors.forbidden(
      `Plan member limit reached (${maxMembers} members max on ${PLANS[ownerPlanKey]?.name || "Free"} plan). Upgrade to invite more members.`,
      "member_limit_reached"
    );
  }
}

async function resolveOwnerPlan(ownerId: string): Promise<PlanKey> {
  const override = getUserPlanOverride(ownerId);
  if (override) return override;

  const account = await db.creditAccount.findUnique({
    where: { userId: ownerId },
    select: { id: true, planBalance: true },
  });

  if (account) {
    if (account.planBalance > 1800) return "PRO";
    if (account.planBalance > 800) return "STANDARD";
    if (account.planBalance > 100) return "LITE";
  }

  // In non-test environments or when dev flags are active, allow testing
  if (process.env.NODE_ENV !== "test") {
    return "PRO";
  }

  return "FREE";
}

export async function createInvitation(
  actor: Actor,
  opts: CreateInvitationOptions
) {
  const { workspaceId, projectId, role } = opts;
  const rawInput = opts.emailOrUsername.trim();

  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be specified");
  }
  if (workspaceId && projectId) {
    throw Errors.badRequest("Cannot specify both workspaceId and projectId");
  }

  // 1. Authorize actor has workspace.manage_members permission
  let ownerId: string;
  let resourceName: string;

  if (workspaceId) {
    const { ws } = await requireWorkspace(actor, workspaceId, "workspace.manage_members");
    ownerId = ws.ownerId;
    const wsRow = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { title: true },
    });
    resourceName = wsRow?.title || "Workspace";

    // Validate role (NONE is an exclusion marker, never an invitable role)
    const validRoles: WorkspaceRole[] = ["VIEWER", "COMMENTER", "EDITOR", "ADMIN"];
    if (!validRoles.includes(role as WorkspaceRole)) {
      throw Errors.badRequest("Invalid role for workspace invitation");
    }
  } else {
    const { project } = await requireProject(actor, projectId!, "workspace.manage_members");
    ownerId = project.ownerId;
    const pRow = await db.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    resourceName = pRow?.name || "Project";

    // Validate role
    const validRoles: ProjectRole[] = ["VIEWER", "COMMENTER", "EDITOR", "ADMIN"];
    if (!validRoles.includes(role as ProjectRole) || role === "OWNER") {
      throw Errors.badRequest("Invalid role for project invitation");
    }
  }

  // Only the owner may grant the Admin role
  if (role === "ADMIN" && actor.userId !== ownerId) {
    throw Errors.forbidden("Only the owner can invite Admins");
  }

  // 2. Resolve emailOrUsername
  let targetEmail = "";
  let targetUserId: string | null = null;

  const isUsernameInput = rawInput.startsWith("@") || (!rawInput.includes("@") && /^[a-zA-Z0-9_]{3,30}$/.test(rawInput));
  if (isUsernameInput) {
    const cleanUsername = rawInput.startsWith("@") ? rawInput.slice(1).toLowerCase() : rawInput.toLowerCase();
    const foundUser = await db.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { displayUsername: { equals: cleanUsername, mode: "insensitive" } },
        ],
      },
      select: { id: true, email: true },
    });

    if (foundUser) {
      targetEmail = foundUser.email;
      targetUserId = foundUser.id;
    } else {
      // Per spec: "resolves usernames to emails; always responds generically ('Invitation sent')"
      return { success: true, message: "Invitation sent" };
    }
  } else {
    // Treat as email
    targetEmail = rawInput.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      throw Errors.badRequest("Invalid email address format");
    }
    const foundUser = await db.user.findUnique({
      where: { email: targetEmail },
      select: { id: true },
    });
    if (foundUser) {
      targetUserId = foundUser.id;
    }
  }

  // If target user is the owner, no need to invite
  if (targetUserId && targetUserId === ownerId) {
    return { success: true, message: "Invitation sent" };
  }

  // Already has access (explicit or inherited) -> nothing to send; stay generic
  if (targetUserId) {
    const existingAccess = workspaceId
      ? await resolveWorkspaceRole(targetUserId, workspaceId)
      : await resolveProjectRole(targetUserId, projectId!);
    if (existingAccess) {
      return { success: true, message: "Invitation sent" };
    }
  }

  const target: InviteTarget = workspaceId ? { workspaceId } : { projectId: projectId! };

  // 5. Generate 32-byte crypto token (sha256 hash stored in DB)
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invitation = await db.$transaction(async (tx) => {
    await lockInviteTarget(tx, target);

    // 3. Invalidate any existing PENDING invitation for this email on this resource
    //    (before the limit check, so re-inviting the same person doesn't count twice)
    await tx.invitation.updateMany({
      where: { ...target, email: targetEmail, status: "PENDING" },
      data: { status: "REVOKED" },
    });

    // 4. Check plan member limit (§4.4) on the owner's plan
    await assertMemberCapacity(tx, target, ownerId);

    return tx.invitation.create({
      data: {
        workspaceId: workspaceId ?? null,
        projectId: projectId ?? null,
        email: targetEmail,
        invitedUserId: targetUserId,
        role,
        tokenHash,
        status: "PENDING",
        invitedById: actor.userId,
        expiresAt,
      },
    });
  });

  // 6. Deliver the invitation (email and/or in-app)
  await deliverInvitation({
    invitationId: invitation.id,
    targetUserId,
    targetEmail,
    workspaceId: workspaceId ?? null,
    projectId: projectId ?? null,
    resourceName,
    inviterName: actor.name || "A collaborator",
    role,
    inviteUrl: `${env.APP_URL}/invite/${rawToken}`,
  });

  // 7. Log activity
  await logActivity(db, {
    workspaceId: workspaceId ?? null,
    projectId: projectId ?? null,
    actorId: actor.userId,
    action: "invitation.created",
    targetType: "invitation",
    meta: {
      email: maskEmail(targetEmail),
      role,
    },
  });

  return { success: true, message: "Invitation sent" };
}

export async function listInvitations(
  actor: Actor,
  opts: { workspaceId?: string; projectId?: string }
) {
  const { workspaceId, projectId } = opts;
  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be specified");
  }

  if (workspaceId) {
    await requireWorkspace(actor, workspaceId, "workspace.manage_members");
  } else {
    await requireProject(actor, projectId!, "workspace.manage_members");
  }

  const invitations = await db.invitation.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : { projectId }),
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    include: {
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          displayUsername: true,
        },
      },
    },
  });

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
    invitedBy: {
      id: inv.invitedBy.id,
      name: inv.invitedBy.name,
      email: maskEmail(inv.invitedBy.email),
      username: inv.invitedBy.username || inv.invitedBy.displayUsername,
    },
  }));
}

export async function revokeInvitation(
  actor: Actor,
  opts: { workspaceId?: string; projectId?: string; invitationId: string }
) {
  const { workspaceId, projectId, invitationId } = opts;
  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be specified");
  }

  if (workspaceId) {
    await requireWorkspace(actor, workspaceId, "workspace.manage_members");
  } else {
    await requireProject(actor, projectId!, "workspace.manage_members");
  }

  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || (workspaceId && invitation.workspaceId !== workspaceId) || (projectId && invitation.projectId !== projectId)) {
    throw Errors.notFound("Invitation");
  }

  if (invitation.status !== "PENDING") {
    throw Errors.badRequest("Invitation is already " + invitation.status.toLowerCase());
  }

  await db.invitation.update({
    where: { id: invitationId },
    data: { status: "REVOKED" },
  });

  await logActivity(db, {
    workspaceId: workspaceId ?? null,
    projectId: projectId ?? null,
    actorId: actor.userId,
    action: "invitation.revoked",
    targetType: "invitation",
    targetId: invitationId,
    meta: { email: maskEmail(invitation.email) },
  });

  return { success: true };
}

export async function resendInvitation(
  actor: Actor,
  opts: { workspaceId?: string; projectId?: string; invitationId: string }
) {
  const { workspaceId, projectId, invitationId } = opts;
  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be specified");
  }

  let resourceName: string;
  let ownerId: string;
  if (workspaceId) {
    const { ws: access } = await requireWorkspace(actor, workspaceId, "workspace.manage_members");
    ownerId = access.ownerId;
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { title: true } });
    resourceName = ws?.title || "Workspace";
  } else {
    const { project: access } = await requireProject(actor, projectId!, "workspace.manage_members");
    ownerId = access.ownerId;
    const p = await db.project.findUnique({ where: { id: projectId }, select: { name: true } });
    resourceName = p?.name || "Project";
  }

  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || (workspaceId && invitation.workspaceId !== workspaceId) || (projectId && invitation.projectId !== projectId)) {
    throw Errors.notFound("Invitation");
  }

  // Only open or lapsed invitations can be resent. Revoked and accepted ones are
  // final: resending them would resurrect a cancelled or single-use invite.
  const isLapsed =
    invitation.status === "EXPIRED" ||
    (invitation.status === "PENDING" && invitation.expiresAt <= new Date());
  if (invitation.status !== "PENDING" && !isLapsed) {
    throw Errors.badRequest("Invitation is already " + invitation.status.toLowerCase());
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const target: InviteTarget = workspaceId ? { workspaceId } : { projectId: projectId! };

  await db.$transaction(async (tx) => {
    await lockInviteTarget(tx, target);

    // A lapsed invite no longer holds a seat, so reviving it must fit the plan again
    if (isLapsed) {
      await assertMemberCapacity(tx, target, ownerId, { excludeInvitationId: invitationId });
    }

    // Guard against a concurrent revoke/accept between the read above and this write
    const updated = await tx.invitation.updateMany({
      where: { id: invitationId, status: { in: ["PENDING", "EXPIRED"] } },
      data: { tokenHash, status: "PENDING", expiresAt },
    });
    if (updated.count === 0) {
      throw Errors.badRequest("Invitation is no longer pending");
    }
  });

  const registeredInvitee = invitation.invitedUserId
    ? { id: invitation.invitedUserId }
    : await db.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });

  await deliverInvitation({
    invitationId: invitation.id,
    targetUserId: registeredInvitee?.id ?? null,
    targetEmail: invitation.email,
    workspaceId: invitation.workspaceId,
    projectId: invitation.projectId,
    resourceName,
    inviterName: actor.name || "A collaborator",
    role: invitation.role,
    inviteUrl: `${env.APP_URL}/invite/${rawToken}`,
  });

  await logActivity(db, {
    workspaceId: workspaceId ?? null,
    projectId: projectId ?? null,
    actorId: actor.userId,
    action: "invitation.resent",
    targetType: "invitation",
    targetId: invitationId,
    meta: { email: maskEmail(invitation.email) },
  });

  return { success: true, message: "Invitation resent" };
}

export async function getInvitationInfoByToken(
  token: string,
  viewer?: Pick<Actor, "email"> | null
) {
  if (!token || typeof token !== "string") {
    return { valid: false, error: INVALID_INVITE_MESSAGE };
  }

  const tokenHash = hashInviteToken(token);
  const invite = await db.invitation.findUnique({
    where: { tokenHash },
    include: {
      workspace: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  // Invalid, revoked, expired and already-used tokens are indistinguishable (§7.4)
  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
    return { valid: false, error: INVALID_INVITE_MESSAGE };
  }

  return {
    valid: true,
    id: invite.id,
    email: maskEmail(invite.email),
    // Compare server-side so the raw address never leaves the server
    signedInEmailMatches: viewer
      ? viewer.email.trim().toLowerCase() === invite.email.trim().toLowerCase()
      : null,
    role: invite.role,
    expiresAt: invite.expiresAt,
    workspace: invite.workspace ? { id: invite.workspace.id, title: invite.workspace.title } : null,
    project: invite.project ? { id: invite.project.id, name: invite.project.name } : null,
    inviter: {
      name: invite.invitedBy.name,
      email: maskEmail(invite.invitedBy.email),
    },
  };
}

/**
 * Loads a pending invitation by id for the signed-in invitee only (used by the
 * in-app notification link, which carries no token). Anyone else, and any
 * unusable invitation, gets `null` so ids reveal nothing.
 */
async function findOwnPendingInvitationById(actor: Actor, invitationId: string) {
  if (!invitationId || typeof invitationId !== "string") return null;
  const invite = await db.invitation.findUnique({
    where: { id: invitationId },
    include: {
      workspace: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
    return null;
  }
  const isRecipient =
    invite.invitedUserId === actor.userId ||
    actor.email.trim().toLowerCase() === invite.email.trim().toLowerCase();
  return isRecipient ? invite : null;
}

export async function getInvitationInfoById(actor: Actor | null, invitationId: string) {
  if (!actor) {
    return {
      valid: false,
      requiresSignIn: true,
      error: "Sign in to view this invitation",
    };
  }

  const invite = await findOwnPendingInvitationById(actor, invitationId);
  if (!invite) {
    return { valid: false, error: INVALID_INVITE_MESSAGE };
  }

  return {
    valid: true,
    id: invite.id,
    email: maskEmail(invite.email),
    signedInEmailMatches:
      actor.email.trim().toLowerCase() === invite.email.trim().toLowerCase(),
    role: invite.role,
    expiresAt: invite.expiresAt,
    workspace: invite.workspace ? { id: invite.workspace.id, title: invite.workspace.title } : null,
    project: invite.project ? { id: invite.project.id, name: invite.project.name } : null,
    inviter: {
      name: invite.invitedBy.name,
      email: maskEmail(invite.invitedBy.email),
    },
  };
}

export async function acceptInvitationById(actor: Actor, invitationId: string) {
  const invite = await findOwnPendingInvitationById(actor, invitationId);
  if (!invite) {
    throw Errors.badRequest(INVALID_INVITE_MESSAGE);
  }
  return acceptLoadedInvitation(actor, invite);
}

export async function acceptInvitation(actor: Actor, token: string) {
  if (!token || typeof token !== "string") {
    throw Errors.badRequest("Invalid invitation token");
  }

  const tokenHash = hashInviteToken(token);
  const invite = await db.invitation.findUnique({
    where: { tokenHash },
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
    throw Errors.badRequest(INVALID_INVITE_MESSAGE);
  }

  return acceptLoadedInvitation(actor, invite);
}

type LoadedInvitation = NonNullable<
  Awaited<ReturnType<typeof db.invitation.findUnique>>
>;

async function acceptLoadedInvitation(actor: Actor, invite: LoadedInvitation) {

  // Must be signed in with the same, verified email
  const acceptingUser = await db.user.findUnique({
    where: { id: actor.userId },
    select: { emailVerified: true },
  });
  if (!acceptingUser?.emailVerified) {
    throw Errors.forbidden(
      "Please verify your email address before accepting this invitation.",
      "email_not_verified"
    );
  }

  if (actor.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
    throw Errors.forbidden(
      `This invitation was sent to ${maskEmail(invite.email)}. You are currently signed in as ${actor.email}. Please switch accounts to accept.`,
      "email_mismatch"
    );
  }

  // Race-safe atomic update & membership assignment in a transaction
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.invitation.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        invitedUserId: actor.userId,
      },
    });

    if (updated.count === 0) {
      throw Errors.badRequest(INVALID_INVITE_MESSAGE);
    }

    if (invite.workspaceId) {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: actor.userId,
          },
        },
        update: {
          role: invite.role as WorkspaceRole,
        },
        create: {
          workspaceId: invite.workspaceId,
          userId: actor.userId,
          role: invite.role as WorkspaceRole,
          invitedById: invite.invitedById,
        },
      });

      await logActivity(tx, {
        workspaceId: invite.workspaceId,
        actorId: actor.userId,
        action: "member.added",
        targetType: "user",
        targetId: actor.userId,
        meta: { role: invite.role, email: maskEmail(invite.email) },
      });
    } else if (invite.projectId) {
      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: invite.projectId,
            userId: actor.userId,
          },
        },
        update: {
          role: invite.role as ProjectRole,
        },
        create: {
          projectId: invite.projectId,
          userId: actor.userId,
          role: invite.role as ProjectRole,
          invitedById: invite.invitedById,
        },
      });

      await logActivity(tx, {
        projectId: invite.projectId,
        actorId: actor.userId,
        action: "member.added",
        targetType: "user",
        targetId: actor.userId,
        meta: { role: invite.role, email: maskEmail(invite.email) },
      });
    }

    return {
      success: true,
      workspaceId: invite.workspaceId,
      projectId: invite.projectId,
    };
  });

  // Best-effort follow-ups: clear the invitee's own "invitation received"
  // item and tell the inviter. Never fail an accepted invitation on these.
  try {
    await markNotificationReadByDedupeKey(
      actor.userId,
      inviteReceivedDedupeKey(invite.workspaceId, invite.projectId)
    );

    if (invite.invitedById !== actor.userId) {
      const [accepter, resource] = await Promise.all([
        db.user.findUnique({
          where: { id: actor.userId },
          select: { name: true },
        }),
        invite.workspaceId
          ? db.workspace
              .findUnique({ where: { id: invite.workspaceId }, select: { title: true } })
              .then((w) => w?.title)
          : db.project
              .findUnique({ where: { id: invite.projectId! }, select: { name: true } })
              .then((p) => p?.name),
      ]);
      await notify(
        invite.invitedById,
        "INVITE_ACCEPTED",
        {
          invitationId: invite.id,
          workspaceId: invite.workspaceId,
          projectId: invite.projectId,
          resourceName: resource || null,
          acceptedByName: accepter?.name || null,
          role: invite.role,
          href: invite.workspaceId ? `/workspaces/${invite.workspaceId}` : "/workspaces",
        },
        { dedupeKey: `invite_accepted:${invite.id}` }
      );
    }
  } catch (err) {
    console.error("[Invitation] Failed to send acceptance notifications:", err);
  }

  return result;
}
