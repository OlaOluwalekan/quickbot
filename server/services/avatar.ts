import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { type Actor } from "@/server/auth/session";
import { resolveAvatarUrl } from "@/lib/avatar";
import { getStorageProvider } from "@/server/storage";

export async function getUserAvatar(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      avatarAttachment: true,
    },
  });

  if (!user) {
    throw Errors.notFound("User");
  }

  const avatarUrl = resolveAvatarUrl(user);
  return {
    avatarUrl,
    isCustom: Boolean(user.avatarAttachmentId && user.avatarAttachment?.status !== "DELETED"),
    providerImage: user.image ?? null,
  };
}

export async function setAvatar(
  actor: Actor,
  attachmentId: string
): Promise<{ avatarUrl: string | null }> {
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.deletedAt) {
    throw Errors.notFound("Attachment");
  }

  if (attachment.ownerId !== actor.userId) {
    throw Errors.forbidden("You do not own this attachment");
  }

  if (attachment.kind !== "AVATAR") {
    throw Errors.badRequest("Attachment is not an avatar image");
  }

  if (attachment.status !== "READY") {
    throw Errors.badRequest("Attachment is not ready");
  }

  const user = await db.user.findUnique({
    where: { id: actor.userId },
    include: { avatarAttachment: true },
  });

  if (!user) {
    throw Errors.notFound("User");
  }

  const oldAttachment = user.avatarAttachment;

  // Swap avatarAttachmentId
  await db.user.update({
    where: { id: actor.userId },
    data: { avatarAttachmentId: attachmentId },
  });

  // If previous avatar exists and is different, delete old asset and mark attachment DELETED
  if (oldAttachment && oldAttachment.id !== attachmentId) {
    const storage = getStorageProvider();
    try {
      await storage.delete(oldAttachment.providerId, { isPublic: true });
    } catch {
      // Continue even if remote storage deletion fails
    }
    await db.attachment.update({
      where: { id: oldAttachment.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });
  }

  const avatarUrl = resolveAvatarUrl({
    avatarAttachment: attachment,
    image: user.image,
  });

  return { avatarUrl };
}

export async function removeAvatar(
  actor: Actor
): Promise<{ avatarUrl: string | null }> {
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    include: { avatarAttachment: true },
  });

  if (!user) {
    throw Errors.notFound("User");
  }

  if (user.avatarAttachment) {
    const storage = getStorageProvider();
    try {
      await storage.delete(user.avatarAttachment.providerId, { isPublic: true });
    } catch {
      // Ignore
    }
    await db.attachment.update({
      where: { id: user.avatarAttachment.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });
    await db.user.update({
      where: { id: actor.userId },
      data: { avatarAttachmentId: null },
    });
  }

  // Reverts to provider image (Google/GitHub) or null
  const avatarUrl = user.image ?? null;
  return { avatarUrl };
}
