import { route } from "@/server/http/route";
import { z } from "zod";
import { getInvitationInfoByToken } from "@/server/services/invitation";

const infoQuerySchema = z.object({
  token: z.string().min(1),
});

export const GET = route({
  auth: "optional",
  query: infoQuerySchema,
  handler: async ({ actor, query }) => getInvitationInfoByToken(query.token, actor),
});
