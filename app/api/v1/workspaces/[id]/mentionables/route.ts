import { z } from "zod";
import { route } from "@/server/http/route";
import { listMentionables } from "@/server/services/members";

export const GET = route({
  query: z.object({
    q: z.string().optional().default(""),
  }),
  rateLimit: {
    policy: "mentionables:list",
    key: (c) => c.actor.userId,
  },
  handler: async ({ actor, params, query }) => {
    return listMentionables(actor, params.id as string, query.q);
  },
});
