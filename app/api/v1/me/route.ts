import { z } from "zod";
import { revalidatePath } from "next/cache";
import { route } from "@/server/http/route";
import { db } from "@/server/db/client";

const updateMeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  emailVerified: true,
  role: true,
} as const;

export const GET = route({
  handler: async ({ actor }) => {
    const user = await db.user.findUnique({
      where: { id: actor.userId },
      select: safeUserSelect,
    });
    return user;
  },
});

export const PATCH = route({
  body: updateMeSchema,
  handler: async ({ actor, body }) => {
    const updatedUser = await db.user.update({
      where: { id: actor.userId },
      data: { name: body.name },
      select: safeUserSelect,
    });
    try {
      revalidatePath("/settings");
    } catch {}
    return updatedUser;
  },
});
