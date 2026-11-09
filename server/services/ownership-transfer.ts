import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { getEntitlements } from "@/server/billing/entitlements";
import { requireWorkspace, requireProject } from "@/server/authz/access";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notify";
import type { Actor } from "@/server/auth/session";
import { Prisma, type TransferStatus } from "@/server/db/generated/client";

export type PreviousOwnerAction = "STAY_ADMIN" | "LEAVE";

type Scope = { workspaceId?: string; projectId?: string };

const TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assertOneScope(scope: Scope) {
  if (!scope.workspaceId && !scope.projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be provided");
  }
  if (scope.workspaceId && scope.projectId) {
    throw Errors.badRequest("Cannot provide both workspaceId and projectId");
  }
}

export interface CheckTransferFitsInput extends Scope {
  toUserId: string;
  previousOwnerAction: PreviousOwnerAction;
}

/**
 * Does the resource fit the recipient's plan after the transfer?
 * Pure check — callers must authorize first (see `checkTransferFitsForOwner`).
 */
export async function checkTransferFits(t: CheckTransferFitsInput) {
  const { workspaceId, projectId, toUserId, previousOwnerAction } = t;
  assertOneScope(t);

  // 1. A running generation would be billed to the wrong owner mid-flight.
  const running = await db.generation.findFirst({
    where: workspaceId
      ? { workspaceId, status: "RUNNING" }
      : { workspace: { projectId, deletedAt: null }, status: "RUNNING" },
    select: { id: true },
  });
  if (running) {
    throw Errors.conflict("A generation is currently running", "transfer_busy");
  }

  // 2. collaboratorsAfter = distinct userIds of explicit, non-suspended members
  //    (project: project members ∪ members of all its non-deleted workspaces)
  //    minus toUserId, plus fromUserId when STAY_ADMIN.
  let ownerId: string;
  const collaboratorUserIds = new Set<string>();

  if (workspaceId) {
    const ws = await db.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!ws) throw Errors.notFound("Workspace");
    ownerId = ws.ownerId;

    const members = await db.workspaceMember.findMany({
      where: { workspaceId, suspendedAt: null },
      select: { userId: true },
    });
    for (const m of members) collaboratorUserIds.add(m.userId);
  } else {
    const p = await db.project.findFirst({
      where: { id: projectId!, deletedAt: null },
      select: { ownerId: true },
    });
    if (!p) throw Errors.notFound("Project");
    ownerId = p.ownerId;

    const [projMembers, wsMembers] = await Promise.all([
      db.projectMember.findMany({
        where: { projectId: projectId!, suspendedAt: null },
        select: { userId: true },
      }),
      db.workspaceMember.findMany({
        where: {
          workspace: { projectId: projectId!, deletedAt: null },
          suspendedAt: null,
        },
        select: { userId: true },
      }),
    ]);
    for (const m of projMembers) collaboratorUserIds.add(m.userId);
    for (const m of wsMembers) collaboratorUserIds.add(m.userId);
  }

  collaboratorUserIds.delete(toUserId);
  if (previousOwnerAction === "STAY_ADMIN") {
    collaboratorUserIds.add(ownerId);
  } else {
    collaboratorUserIds.delete(ownerId);
  }

  const collaboratorsAfter = collaboratorUserIds.size;
  const limit = (await getEntitlements(toUserId)).limits.members;

  if (collaboratorsAfter > limit) {
    throw Errors.conflict(
      "Transfer would exceed the recipient's plan collaborator limit",
      "transfer_member_limit",
      { limit, collaboratorsAfter }
    );
  }

  return { ok: true as const, limit, collaboratorsAfter };
}

/**
 * Loads the resource, 404s for anyone who can't see it and 403s for members
 * who aren't the owner. Returns the resource name.
 */
async function requireOwnerOf(actor: Actor, scope: Scope): Promise<string> {
  if (scope.workspaceId) {
    const { ws } = await requireWorkspace(actor, scope.workspaceId, "workspace.read");
    if (ws.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the workspace owner can transfer ownership");
    }
    const row = await db.workspace.findUniqueOrThrow({
      where: { id: scope.workspaceId },
      select: { title: true },
    });
    return row.title;
  }
  const { project } = await requireProject(actor, scope.projectId!, "workspace.read");
  if (project.ownerId !== actor.userId) {
    throw Errors.forbidden("Only the project owner can transfer ownership");
  }
  const row = await db.project.findUniqueOrThrow({
    where: { id: scope.projectId! },
    select: { name: true },
  });
  return row.name;
}

/** Owner-only plan-fit preview for the transfer dialog. */
export async function checkTransferFitsForOwner(
  actor: Actor,
  scope: Scope,
  input: { toUserId: string; previousOwnerAction: PreviousOwnerAction }
) {
  assertOneScope(scope);
  await requireOwnerOf(actor, scope);
  return checkTransferFits({ ...scope, ...input });
}

export interface RequestOwnershipTransferInput {
  toUserId?: string;
  newOwnerId?: string;
  previousOwnerAction?: PreviousOwnerAction;
  confirm?: string;
  confirmation?: string;
}

async function assertRecipientIsActiveMember(scope: Scope, toUserId: string) {
  if (scope.workspaceId) {
    const ws = await db.workspace.findUniqueOrThrow({
      where: { id: scope.workspaceId },
      select: { projectId: true },
    });
    const [wm, pm] = await Promise.all([
      db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: scope.workspaceId, userId: toUserId } },
        select: { suspendedAt: true },
      }),
      ws.projectId
        ? db.projectMember.findUnique({
            where: { projectId_userId: { projectId: ws.projectId, userId: toUserId } },
            select: { suspendedAt: true },
          })
        : null,
    ]);
    if (!wm && !pm) {
      throw Errors.badRequest("Recipient must be a member", "recipient_not_member");
    }
    if (wm?.suspendedAt || pm?.suspendedAt) {
      throw Errors.badRequest("Recipient is suspended", "recipient_suspended");
    }
    return;
  }
  const pm = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId: scope.projectId!, userId: toUserId } },
    select: { suspendedAt: true },
  });
  if (!pm) throw Errors.badRequest("Recipient must be a member", "recipient_not_member");
  if (pm.suspendedAt) throw Errors.badRequest("Recipient is suspended", "recipient_suspended");
}

export async function requestOwnershipTransfer(
  actor: Actor,
  scope: Scope,
  input: RequestOwnershipTransferInput
) {
  assertOneScope(scope);
  const { workspaceId, projectId } = scope;

  const toUserId = input.toUserId || input.newOwnerId;
  if (!toUserId) throw Errors.badRequest("Recipient (toUserId) is required");
  const confirmationText = (input.confirm || input.confirmation || "").trim();
  if (!confirmationText) throw Errors.badRequest("Confirmation text is required");
  const previousOwnerAction = input.previousOwnerAction ?? "STAY_ADMIN";

  if (toUserId === actor.userId) throw Errors.badRequest("You are already the owner");

  // 1. Owner + typed confirmation
  const resourceName = await requireOwnerOf(actor, scope);
  if (confirmationText !== "TRANSFER" && confirmationText !== resourceName.trim()) {
    throw Errors.badRequest("Invalid confirmation text", "invalid_confirmation");
  }

  // 2. Recipient: existing, verified, non-suspended member
  const recipient = await db.user.findUnique({
    where: { id: toUserId },
    select: { id: true, emailVerified: true },
  });
  if (!recipient) throw Errors.badRequest("Recipient must be a member", "recipient_not_member");
  if (!recipient.emailVerified) {
    throw Errors.badRequest("Recipient must have a verified email address", "email_not_verified");
  }
  await assertRecipientIsActiveMember(scope, toUserId);

  // 3. One PENDING transfer per resource (stale ones expire lazily)
  await db.ownershipTransfer.updateMany({
    where: { ...(workspaceId ? { workspaceId } : { projectId }), status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  // 4. Plan fit
  await checkTransferFits({ workspaceId, projectId, toUserId, previousOwnerAction });

  // 5. Create (the partial unique index makes concurrent requests race-safe)
  const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
  let transfer;
  try {
    transfer = await db.ownershipTransfer.create({
      data: {
        workspaceId,
        projectId,
        fromUserId: actor.userId,
        toUserId,
        previousOwnerAction,
        status: "PENDING",
        expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw Errors.conflict("An ownership transfer request is already pending", "transfer_already_pending");
    }
    throw err;
  }

  // 6. Notify recipient (in-app + email)
  await notify(toUserId, "OWNERSHIP_TRANSFER_REQUESTED", {
    transferId: transfer.id,
    fromUserId: actor.userId,
    fromUserName: actor.name || actor.email,
    resourceName,
    resourceType: workspaceId ? "workspace" : "project",
    workspaceId,
    projectId,
    expiresAt: expiresAt.toISOString(),
    href: workspaceId ? `/workspaces/${workspaceId}` : `/projects/${projectId}`,
  });

  return transfer;
}

export async function listMyPendingTransfers(
  userId: string,
  status: TransferStatus = "PENDING"
) {
  await db.ownershipTransfer.updateMany({
    where: { toUserId: userId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  return db.ownershipTransfer.findMany({
    where: { toUserId: userId, status },
    include: {
      workspace: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      fromUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** The owner's own pending outgoing request for a resource, if any (for Cancel). */
export async function getPendingOutgoingTransfer(fromUserId: string, scope: Scope) {
  return db.ownershipTransfer.findFirst({
    where: {
      ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : { projectId: scope.projectId }),
      fromUserId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      expiresAt: true,
      toUser: { select: { id: true, name: true } },
    },
  });
}

/** Non-participants get 404 so transfer ids don't leak. */
async function loadTransferFor(actor: Actor, transferId: string) {
  const transfer = await db.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: {
      workspace: { select: { id: true, title: true, ownerId: true, projectId: true } },
      project: { select: { id: true, name: true, ownerId: true } },
    },
  });
  if (!transfer || (transfer.toUserId !== actor.userId && transfer.fromUserId !== actor.userId)) {
    throw Errors.notFound("Ownership transfer request");
  }
  return transfer;
}

async function expireIfStale(transfer: { id: string; status: TransferStatus; expiresAt: Date }) {
  if (transfer.status === "PENDING" && transfer.expiresAt < new Date()) {
    await db.ownershipTransfer.updateMany({
      where: { id: transfer.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw Errors.conflict("Ownership transfer request has expired", "transfer_expired");
  }
}

export async function acceptOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await loadTransferFor(actor, transferId);
  if (transfer.toUserId !== actor.userId) {
    throw Errors.forbidden("Only the designated recipient can accept this transfer");
  }
  await expireIfStale(transfer);
  if (transfer.status !== "PENDING") {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  // The sender must still own the resource (it may have been deleted or moved).
  const currentOwnerId = transfer.workspace?.ownerId ?? transfer.project?.ownerId;
  if (currentOwnerId !== transfer.fromUserId) {
    await db.ownershipTransfer.updateMany({
      where: { id: transfer.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    throw Errors.conflict("Ownership transfer is no longer valid", "transfer_not_pending");
  }

  const previousOwnerAction = transfer.previousOwnerAction as PreviousOwnerAction;

  // Re-run with the recipient's CURRENT entitlements.
  await checkTransferFits({
    workspaceId: transfer.workspaceId ?? undefined,
    projectId: transfer.projectId ?? undefined,
    toUserId: actor.userId,
    previousOwnerAction,
  });

  const recipientName = actor.name || actor.email;

  const result = await db.$transaction(async (tx) => {
    // Race-safe: only one concurrent accept can flip PENDING -> ACCEPTED.
    const updated = await tx.ownershipTransfer.updateMany({
      where: { id: transfer.id, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    if (updated.count === 0) {
      throw Errors.conflict("Ownership transfer has already been processed", "transfer_not_pending");
    }

    if (transfer.workspaceId) {
      const wsId = transfer.workspaceId;

      // A workspace inside someone else's project leaves that project.
      let detachedFromProject = false;
      if (transfer.workspace?.projectId) {
        const proj = await tx.project.findUnique({
          where: { id: transfer.workspace.projectId },
          select: { ownerId: true },
        });
        detachedFromProject = !proj || proj.ownerId !== actor.userId;
      }

      await tx.workspace.update({
        where: { id: wsId },
        data: { ownerId: actor.userId, ...(detachedFromProject ? { projectId: null } : {}) },
      });
      await tx.workspaceMember.deleteMany({ where: { workspaceId: wsId, userId: actor.userId } });

      if (previousOwnerAction === "STAY_ADMIN") {
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: wsId, userId: transfer.fromUserId } },
          update: { role: "ADMIN", suspendedAt: null, suspendedReason: null },
          create: { workspaceId: wsId, userId: transfer.fromUserId, role: "ADMIN", invitedById: actor.userId },
        });
      } else {
        await tx.workspaceMember.deleteMany({ where: { workspaceId: wsId, userId: transfer.fromUserId } });
      }

      await logActivity(tx, {
        workspaceId: wsId,
        actorId: actor.userId,
        action: "ownership.transferred",
        targetType: "user",
        targetId: actor.userId,
        meta: {
          previousOwnerId: transfer.fromUserId,
          newOwnerId: actor.userId,
          previousOwnerAction,
          detachedFromProject,
        },
      });

      return {
        notifyPayload: {
          workspaceId: wsId,
          resourceName: transfer.workspace?.title ?? "",
          resourceType: "workspace",
          href: `/workspaces/${wsId}`,
        },
        detachedFromProject,
      };
    }

    const pId = transfer.projectId!;
    await tx.project.update({ where: { id: pId }, data: { ownerId: actor.userId } });
    await tx.projectMember.deleteMany({ where: { projectId: pId, userId: actor.userId } });

    if (previousOwnerAction === "STAY_ADMIN") {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: pId, userId: transfer.fromUserId } },
        update: { role: "ADMIN", suspendedAt: null, suspendedReason: null },
        create: { projectId: pId, userId: transfer.fromUserId, role: "ADMIN", invitedById: actor.userId },
      });
    } else {
      await tx.projectMember.deleteMany({ where: { projectId: pId, userId: transfer.fromUserId } });
    }

    await logActivity(tx, {
      projectId: pId,
      actorId: actor.userId,
      action: "ownership.transferred",
      targetType: "user",
      targetId: actor.userId,
      meta: { previousOwnerId: transfer.fromUserId, newOwnerId: actor.userId, previousOwnerAction },
    });

    return {
      notifyPayload: {
        projectId: pId,
        resourceName: transfer.project?.name ?? "",
        resourceType: "project",
        href: `/projects/${pId}`,
      },
      detachedFromProject: false,
    };
  });

  // Notify after commit so a rolled-back accept never sends an email.
  await notify(transfer.fromUserId, "OWNERSHIP_TRANSFER_ACCEPTED", {
    transferId: transfer.id,
    toUserId: actor.userId,
    toUserName: recipientName,
    previousOwnerAction,
    ...result.notifyPayload,
  });

  return { success: true, detachedFromProject: result.detachedFromProject };
}

export async function declineOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await loadTransferFor(actor, transferId);
  if (transfer.toUserId !== actor.userId) {
    throw Errors.forbidden("Only the designated recipient can decline this transfer");
  }
  await expireIfStale(transfer);

  const updated = await db.ownershipTransfer.updateMany({
    where: { id: transferId, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (updated.count === 0) {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  await notify(transfer.fromUserId, "OWNERSHIP_TRANSFER_DECLINED", {
    transferId: transfer.id,
    toUserId: actor.userId,
    toUserName: actor.name || actor.email,
    resourceName: transfer.workspace?.title ?? transfer.project?.name ?? "",
    resourceType: transfer.workspaceId ? "workspace" : "project",
    href: transfer.workspaceId ? `/workspaces/${transfer.workspaceId}` : `/projects/${transfer.projectId}`,
  });

  return { success: true };
}

export async function cancelOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await loadTransferFor(actor, transferId);
  if (transfer.fromUserId !== actor.userId) {
    throw Errors.forbidden("Only the sender can cancel this transfer");
  }

  const updated = await db.ownershipTransfer.updateMany({
    where: { id: transferId, status: "PENDING" },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });
  if (updated.count === 0) {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  return { success: true };
}
