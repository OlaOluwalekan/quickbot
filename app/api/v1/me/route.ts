import { revalidatePath } from "next/cache";
import { route } from "@/server/http/route";
import { updateProfileSchema } from "@/lib/schemas/user-profile";
import { getUserProfile, updateUserProfile } from "@/server/services/user-profile";

export const GET = route({
  handler: async ({ actor }) => getUserProfile(actor.userId),
});

export const PATCH = route({
  body: updateProfileSchema,
  handler: async ({ actor, body }) => {
    const user = await updateUserProfile(actor.userId, body);
    try {
      revalidatePath("/settings");
    } catch {
      // revalidatePath throws outside a Next.js request (tests); the client refreshes anyway.
    }
    return user;
  },
});
