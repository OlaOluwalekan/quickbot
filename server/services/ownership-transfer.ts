import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { getEntitlements } from "@/server/billing/entitlements";
import { resolveWorkspaceRole, resolveProjectRole } from "@/server/authz/access";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notify";
import type { Actor } from "@/server/auth/session";
import type { TransferStatus } from "@/server/db/generated/client";

export interface CheckTransferFitsInput {
  workspaceId?: string;
  projectId?: string;
  toUserId: string;
  previousOwnerAction: "STAY_ADMIN" | "LEAVE";
}

export async function checkTransferFits(t: CheckTransferFitsInput) {
  const { workspaceId, projectId, toUserId, previousOwnerAction } = t;

  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be provided");
  }
  if (workspaceId && projectId) {
    throw Errors.badRequest("Cannot provide both workspaceId and projectId");
  }

  // 1. Check if a Generation with status RUNNING exists in scope -> 409 "transfer_busy"
  if (workspaceId) {
    const running = await db.generation.findFirst({
      where: { workspaceId, status: "RUNNING" },
      select: { id: true },
    });
    if (running) {
      throw Errors.conflict(
        "A generation is currently running in this workspace",
        "transfer_busy"
      );
    }
  } else if (projectId) {
    const running = await db.generation.findFirst({
      where: {
        workspace: { projectId, deletedAt: null },
        status: "RUNNING",
      },
      select: { id: true },
    });
    if (running) {
      throw Errors.conflict(
        "A generation is currently running in a workspace of this project",
        "transfer_busy"
      );
    }
  }

  // 2. Count collaboratorsAfter = distinct userIds of explicit, non-suspended members
  //    (project: project members ∪ members of all its non-deleted workspaces)
  //    minus toUserId, plus fromUserId when STAY_ADMIN
  let ownerId: string;
  const collaboratorUserIds = new Set<string>();

  if (workspaceId) {
    const ws = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerId: true },
    });
    if (!ws) throw Errors.notFound("Workspace");
    ownerId = ws.ownerId;

    const members = await db.workspaceMember.findMany({
      where: { workspaceId, suspendedAt: null },
      select: { userId: true },
    });
    for (const m of members) {
      collaboratorUserIds.add(m.userId);
    }
  } else {
    const p = await db.project.findUnique({
      where: { id: projectId! },
      select: { id: true, ownerId: true },
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

  // Minus toUserId (the recipient will be the owner, not a collaborator)
  collaboratorUserIds.delete(toUserId);

  // Plus fromUserId when STAY_ADMIN
  if (previousOwnerAction === "STAY_ADMIN") {
    collaboratorUserIds.add(ownerId);
  } else {
    collaboratorUserIds.delete(ownerId);
  }

  const collaboratorsAfter = collaboratorUserIds.size;

  // 3. limit = (await getEntitlements(toUserId)).limits.members
  const recipientEntitlements = await getEntitlements(toUserId);
  const limit = recipientEntitlements.limits.members;

  if (collaboratorsAfter > limit) {
    throw Errors.conflict(
      `Transfer would exceed recipient's plan collaborator limit (${collaboratorsAfter} collaborators after transfer, plan limit is ${limit})`,
      "transfer_member_limit",
      { limit, collaboratorsAfter }
    );
  }

  return {
    ok: true,
    limit,
    collaboratorsAfter,
  };
}

export interface RequestOwnershipTransferInput {
  toUserId?: string;
  newOwnerId?: string;
  previousOwnerAction?: "STAY_ADMIN" | "LEAVE";
  confirm?: string;
  confirmation?: string;
}

export async function requestOwnershipTransfer(
  actor: Actor,
  target: { workspaceId?: string; projectId?: string },
  input: RequestOwnershipTransferInput
) {
  const { workspaceId, projectId } = target;
  if (!workspaceId && !projectId) {
    throw Errors.badRequest("Either workspaceId or projectId must be provided");
  }
  if (workspaceId && projectId) {
    throw Errors.badRequest("Cannot provide both workspaceId and projectId");
  }

  const toUserId = input.toUserId || input.newOwnerId;
  if (!toUserId) {
    throw Errors.badRequest("Recipient (toUserId) is required");
  }
  const confirmationText = input.confirm || input.confirmation;
  if (!confirmationText) {
    throw Errors.badRequest("Confirmation text is required");
  }
  const previousOwnerAction = input.previousOwnerAction ?? "STAY_ADMIN";

  if (toUserId === actor.userId) {
    throw Errors.badRequest("You are already the owner");
  }

  // 1. Verify owner & typed confirmation
  let resourceName = "";
  if (workspaceId) {
    const ws = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, title: true, ownerId: true },
    });
    if (!ws) throw Errors.notFound("Workspace");
    if (ws.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the workspace owner can transfer ownership");
    }
    resourceName = ws.title;
    const cleanConf = confirmationText.trim();
    if (cleanConf !== "TRANSFER" && cleanConf !== ws.title.trim()) {
      throw Errors.badRequest("Invalid confirmation text. Type 'TRANSFER' or the workspace title.");
    }
  } else {
    const proj = await db.project.findUnique({
      where: { id: projectId! },
      select: { id: true, name: true, ownerId: true },
    });
    if (!proj) throw Errors.notFound("Project");
    if (proj.ownerId !== actor.userId) {
      throw Errors.forbidden("Only the project owner can transfer ownership");
    }
    resourceName = proj.name;
    const cleanConf = confirmationText.trim();
    if (cleanConf !== "TRANSFER" && cleanConf !== proj.name.trim()) {
      throw Errors.badRequest("Invalid confirmation text. Type 'TRANSFER' or the project name.");
    }
  }

  // 2. Recipient validation: existing, non-suspended, email-verified
  const recipient = await db.user.findUnique({
    where: { id: toUserId },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  if (!recipient) {
    throw Errors.notFound("Recipient user");
  }
  if (!recipient.emailVerified) {
    throw Errors.badRequest("Recipient must have a verified email address", "email_not_verified");
  }

  if (workspaceId) {
    const wsRole = await resolveWorkspaceRole(toUserId, workspaceId);
    if (!wsRole) {
      throw Errors.badRequest("Recipient must be an existing member of this workspace", "recipient_not_member");
    }
    const memberRow = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: toUserId } },
      select: { suspendedAt: true },
    });
    if (memberRow?.suspendedAt) {
      throw Errors.badRequest("Cannot transfer ownership to a suspended member", "recipient_suspended");
    }
  } else {
    const projRole = await resolveProjectRole(toUserId, projectId!);
    if (!projRole) {
      throw Errors.badRequest("Recipient must be an existing member of this project", "recipient_not_member");
    }
    const memberRow = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectId!, userId: toUserId } },
      select: { suspendedAt: true },
    });
    if (memberRow?.suspendedAt) {
      throw Errors.badRequest("Cannot transfer ownership to a suspended member", "recipient_suspended");
    }
  }

  // 3. Check for existing PENDING transfers (expire lazily if past expiresAt)
  const existing = await db.ownershipTransfer.findFirst({
    where: {
      ...(workspaceId ? { workspaceId } : { projectId }),
      status: "PENDING",
    },
  });
  if (existing) {
    if (existing.expiresAt < new Date()) {
      await db.ownershipTransfer.update({
        where: { id: existing.id },
        data: { status: "EXPIRED" },
      });
    } else {
      throw Errors.conflict("An ownership transfer request is already pending", "transfer_already_pending");
    }
  }

  // 4. Run checkTransferFits()
  await checkTransferFits({
    workspaceId,
    projectId,
    toUserId,
    previousOwnerAction,
  });

  // 5. Create PENDING transfer (expires in 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const transfer = await db.ownershipTransfer.create({
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

  // 6. Notify recipient
  const actorUser = await db.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, email: true },
  });

  await notify(toUserId, "OWNERSHIP_TRANSFER_REQUESTED", {
    transferId: transfer.id,
    fromUserId: actor.userId,
    fromUserName: actorUser?.name || actorUser?.email || "Workspace owner",
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
  const now = new Date();

  // Lazily expire stale requests for this user
  await db.ownershipTransfer.updateMany({
    where: {
      toUserId: userId,
      status: "PENDING",
      expiresAt: { lt: now },
    },
    data: {
      status: "EXPIRED",
    },
  });

  return db.ownershipTransfer.findMany({
    where: {
      toUserId: userId,
      status,
    },
    include: {
      workspace: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
      fromUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function acceptOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await db.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: {
      workspace: { select: { id: true, title: true, ownerId: true, projectId: true } },
      project: { select: { id: true, name: true, ownerId: true } },
    },
  });

  if (!transfer) throw Errors.notFound("Ownership transfer request");

  // Lazy expiration check
  if (transfer.status === "PENDING" && transfer.expiresAt < new Date()) {
    await db.ownershipTransfer.update({
      where: { id: transfer.id },
      data: { status: "EXPIRED" },
    });
    throw Errors.badRequest("Ownership transfer request has expired", "transfer_expired");
  }

  if (transfer.status !== "PENDING") {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  if (transfer.toUserId !== actor.userId) {
    throw Errors.forbidden("Only the designated recipient can accept this transfer");
  }

  // Re-run checkTransferFits() with recipient's CURRENT entitlements
  await checkTransferFits({
    workspaceId: transfer.workspaceId ?? undefined,
    projectId: transfer.projectId ?? undefined,
    toUserId: actor.userId,
    previousOwnerAction: transfer.previousOwnerAction as "STAY_ADMIN" | "LEAVE",
  });

  return await db.$transaction(async (tx) => {
    // Atomic update: status = 'ACCEPTED' where status = 'PENDING'
    const updated = await tx.ownershipTransfer.updateMany({
      where: { id: transfer.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw Errors.conflict("Ownership transfer has already been processed", "transfer_not_pending");
    }

    if (transfer.workspaceId) {
      const wsId = transfer.workspaceId;

      // For workspaces in someone else's project, set projectId = null
      let detachProject = false;
      if (transfer.workspace?.projectId) {
        const proj = await tx.project.findUnique({
          where: { id: transfer.workspace.projectId },
          select: { ownerId: true },
        });
        if (proj && proj.ownerId !== actor.userId) {
          detachProject = true;
        }
      }

      await tx.workspace.update({
        where: { id: wsId },
        data: {
          ownerId: actor.userId,
          ...(detachProject ? { projectId: null } : {}),
        },
      });

      // Remove recipient from workspaceMember table
      await tx.workspaceMember.deleteMany({
        where: { workspaceId: wsId, userId: actor.userId },
      });

      // Previous owner action
      if (transfer.previousOwnerAction === "STAY_ADMIN") {
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: wsId, userId: transfer.fromUserId } },
          update: { role: "ADMIN", suspendedAt: null, suspendedReason: null },
          create: {
            workspaceId: wsId,
            userId: transfer.fromUserId,
            role: "ADMIN",
            invitedById: actor.userId,
          },
        });
      } else {
        await tx.workspaceMember.deleteMany({
          where: { workspaceId: wsId, userId: transfer.fromUserId },
        });
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
          previousOwnerAction: transfer.previousOwnerAction,
          detachedFromProject: detachProject,
        },
      });

      await notify(transfer.fromUserId, "OWNERSHIP_TRANSFER_ACCEPTED", {
        transferId: transfer.id,
        toUserId: actor.userId,
        toUserName: actor.email,
        workspaceId: wsId,
        resourceName: transfer.workspace?.title || "Workspace",
        resourceType: "workspace",
      });
    } else if (transfer.projectId) {
      const pId = transfer.projectId;

      await tx.project.update({
        where: { id: pId },
        data: { ownerId: actor.userId },
      });

      await tx.projectMember.deleteMany({
        where: { projectId: pId, userId: actor.userId },
      });

      if (transfer.previousOwnerAction === "STAY_ADMIN") {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: pId, userId: transfer.fromUserId } },
          update: { role: "ADMIN", suspendedAt: null, suspendedReason: null },
          create: {
            projectId: pId,
            userId: transfer.fromUserId,
            role: "ADMIN",
            invitedById: actor.userId,
          },
        });
      } else {
        await tx.projectMember.deleteMany({
          where: { projectId: pId, userId: transfer.fromUserId },
        });
      }

      await logActivity(tx, {
        projectId: pId,
        actorId: actor.userId,
        action: "ownership.transferred",
        targetType: "user",
        targetId: actor.userId,
        meta: {
          previousOwnerId: transfer.fromUserId,
          newOwnerId: actor.userId,
          previousOwnerAction: transfer.previousOwnerAction,
        },
      });

      await notify(transfer.fromUserId, "OWNERSHIP_TRANSFER_ACCEPTED", {
        transferId: transfer.id,
        toUserId: actor.userId,
        toUserName: actor.email,
        projectId: pId,
        resourceName: transfer.project?.name || "Project",
        resourceType: "project",
      });
    }

    return { success: true };
  });
}

export async function declineOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await db.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: {
      workspace: { select: { title: true } },
      project: { select: { name: true } },
    },
  });

  if (!transfer) throw Errors.notFound("Ownership transfer request");

  if (transfer.toUserId !== actor.userId) {
    throw Errors.forbidden("Only the designated recipient can decline this transfer");
  }

  if (transfer.status !== "PENDING") {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  await db.ownershipTransfer.update({
    where: { id: transferId },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  await notify(transfer.fromUserId, "OWNERSHIP_TRANSFER_DECLINED", {
    transferId: transfer.id,
    toUserId: actor.userId,
    resourceName: transfer.workspace?.title || transfer.project?.name || "Resource",
    resourceType: transfer.workspaceId ? "workspace" : "project",
  });

  return { success: true };
}

export async function cancelOwnershipTransfer(actor: Actor, transferId: string) {
  const transfer = await db.ownershipTransfer.findUnique({
    where: { id: transferId },
  });

  if (!transfer) throw Errors.notFound("Ownership transfer request");

  if (transfer.fromUserId !== actor.userId) {
    throw Errors.forbidden("Only the sender can cancel this transfer");
  }

  if (transfer.status !== "PENDING") {
    throw Errors.conflict("Ownership transfer is no longer pending", "transfer_not_pending");
  }

  await db.ownershipTransfer.update({
    where: { id: transferId },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });

  return { success: true };
}
