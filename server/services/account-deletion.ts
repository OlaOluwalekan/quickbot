import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";

/**
 * Marks an account as deleted. Nothing is removed from the database: the
 * `users` row stays with `deletedAt` set, and the Klecx notes the person
 * wrote are soft-deleted with the same timestamp, so they are no longer
 * listed, shown as a mark on annotations, or sent with prompts.
 *
 * Calling it again for an account that is already deleted keeps the first
 * date (and still covers notes that were missed).
 *
 * This is only the data part. There is no route or screen for it yet:
 * main-guide Step 9.5 (account deletion) builds the flow around it (fresh
 * login, session revocation, sign-in block, ownership transfer, grace period).
 */
export async function softDeleteUser(
  userId: string
): Promise<{ deletedAt: Date; notesDeleted: number }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user) {
      throw Errors.notFound("User");
    }

    const deletedAt = user.deletedAt ?? new Date();
    if (!user.deletedAt) {
      await tx.user.update({ where: { id: userId }, data: { deletedAt } });
    }

    const notes = await tx.workspaceNote.updateMany({
      where: { createdById: userId, deletedAt: null },
      data: { deletedAt },
    });

    return { deletedAt, notesDeleted: notes.count };
  });
}
