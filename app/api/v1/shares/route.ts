import { route } from "@/server/http/route";
import { createShareLinkSchema } from "@/lib/schemas/share";
import { createShareLink } from "@/server/services/share";

export const POST = route({
  body: createShareLinkSchema,
  rateLimit: {
    policy: "share:create",
    key: ({ actor }) => actor.userId,
  },
  handler: async ({ actor, body }) => {
    return createShareLink(actor, body);
  },
});
