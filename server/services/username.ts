import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { type Actor } from "@/server/auth/session";
import {
  validateUsernameFormat,
  generateDefaultUsername,
  normalizeUsername,
} from "@/lib/username";
import { Prisma } from "@/server/db/generated/client";

export async function checkUsernameAvailability(
  rawUsername: string,
  currentUserId?: string
): Promise<{ available: boolean }> {
  const validation = validateUsernameFormat(rawUsername);
  if (!validation.valid) {
    return { available: false };
  }

  const normalized = validation.normalized;
  const existing = await db.user.findUnique({
    where: { username: normalized },
    select: { id: true },
  });

  if (existing && existing.id !== currentUserId) {
    return { available: false };
  }

  return { available: true };
}

export async function generateUniqueDefaultUsername(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateDefaultUsername();
    const existing = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  // Fallback with timestamp suffix
  return `user_${Date.now().toString(36)}`;
}

export async function claimUsername(
  userId: string,
  rawUsername: string
): Promise<{ username: string; displayUsername: string }> {
  const validation = validateUsernameFormat(rawUsername);
  if (!validation.valid) {
    throw Errors.badRequest(validation.reason);
  }

  const normalized = validation.normalized;

  try {
    const updatedUsers = await db.$queryRaw<
      Array<{
        id: string;
        username: string;
        display_username: string;
        username_change_count: number;
      }>
    >`
      UPDATE users
      SET username = ${normalized},
          display_username = ${normalized},
          username_change_count = username_change_count + 1,
          username_changed_at = NOW(),
          username_claimed_at = NOW()
      WHERE id = ${userId} AND username_change_count < 1
      RETURNING id, username, display_username, username_change_count;
    `;

    if (updatedUsers.length === 0) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, usernameChangeCount: true },
      });

      if (!user) {
        throw Errors.notFound("User");
      }

      if (user.usernameChangeCount >= 1) {
        throw Errors.conflict(
          "Username can only be changed once.",
          "username_already_changed"
        );
      }

      throw Errors.conflict(
        "Username could not be claimed.",
        "username_claim_failed"
      );
    }

    const claimed = updatedUsers[0];
    if (!claimed) {
      throw Errors.conflict(
        "Username could not be claimed.",
        "username_claim_failed"
      );
    }

    // Audit log entry
    await db.auditLog.create({
      data: {
        userId,
        action: "USER_USERNAME_CLAIMED",
        targetId: userId,
        metadata: {
          username: claimed.username,
        },
      },
    });

    return {
      username: claimed.username,
      displayUsername: claimed.display_username,
    };
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw Errors.conflict("Username is already taken.", "username_taken");
    }

    // Check Postgres 23505 unique violation error from raw query
    const errObj = err as { code?: string; message?: string };
    if (
      errObj?.code === "23505" ||
      (typeof errObj?.message === "string" &&
        errObj.message.includes("users_username_key"))
    ) {
      throw Errors.conflict("Username is already taken.", "username_taken");
    }

    throw err;
  }
}

export async function resetUsernameLimit(
  adminActor: Actor,
  targetUserId: string
): Promise<{ success: true }> {
  if (adminActor.role !== "ADMIN") {
    throw Errors.forbidden("Admin role required to reset username limit.");
  }

  const targetUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!targetUser) {
    throw Errors.notFound("User");
  }

  await db.$executeRaw`
    UPDATE users
    SET username_change_count = 0
    WHERE id = ${targetUserId};
  `;

  await db.auditLog.create({
    data: {
      userId: adminActor.userId,
      action: "ADMIN_RESET_USERNAME_LIMIT",
      targetId: targetUserId,
      metadata: {
        resetBy: adminActor.userId,
      },
    },
  });

  return { success: true };
}
