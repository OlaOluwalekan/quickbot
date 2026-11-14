import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import type { UpdateProfileInput } from "@/lib/schemas/user-profile";

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
  return db.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: profileSelect,
  });
}
