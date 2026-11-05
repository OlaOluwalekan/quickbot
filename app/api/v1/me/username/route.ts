import { z } from "zod";
import { route } from "@/server/http/route";
import { claimUsername } from "@/server/services/username";

export const PUT = route({
  auth: "required",
  body: z.object({
    username: z.string().min(1),
  }),
  handler: async (c) => {
    const result = await claimUsername(c.actor.userId, c.body.username);
    return result;
  },
});
