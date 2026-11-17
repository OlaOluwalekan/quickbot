import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { UpdateProfileInput } from "@/lib/schemas/user-profile";
import { refreshUserSessionCache } from "@/server/auth/refresh-user-sessions";

const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  emailVerified: true,
} as const;

export async function getUserProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  if (!user) throw Errors.notFound();
  return user;
}

export async function updateUserProfile(userId: string, input: UpdateProfileInput) {
  const user = await db.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: profileSelect,
  });
  await refreshUserSessionCache(userId);
  return user;
}

/**
 * The identity fields the app shell shows, read from the database. The
 * session's copy of the user can be stale (see refreshUserSessionCache), so
 * the shell doesn't rely on it for anything a person can change.
 */
export async function getShellIdentity(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, usernameClaimedAt: true },
  });
}
