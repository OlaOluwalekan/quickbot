import { z } from "zod";
import { route } from "@/server/http/route";
import { checkUsernameAvailability } from "@/server/services/username";

export const GET = route({
  auth: "optional",
  query: z.object({
    u: z.string().default(""),
  }),
  rateLimit: {
    policy: "username:check",
    key: (c) =>
      c.actor?.userId ||
      c.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anon",
  },
  handler: async (c) => {
    const raw = c.query.u;
    if (!raw) {
      return { available: false };
    }
    const result = await checkUsernameAvailability(raw, c.actor?.userId);
    return result;
  },
});
