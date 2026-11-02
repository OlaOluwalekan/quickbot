import { route } from "@/server/http/route";
import { getClientIp } from "@/server/http/rate-limit";
import { supportTicketSchema } from "@/lib/schemas/support";
import { createSupportTicket } from "@/server/services/support";

export const POST = route({
  auth: "optional",
  body: supportTicketSchema,
  rateLimit: {
    policy: "support:send",
    key: (c) => c.actor?.userId ?? getClientIp(c.req) ?? "anonymous",
  },
  handler: async ({ actor, body }) => createSupportTicket(actor, body),
});
