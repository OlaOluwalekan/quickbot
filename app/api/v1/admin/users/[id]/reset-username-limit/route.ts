import { route } from "@/server/http/route";
import { resetUsernameLimit } from "@/server/services/username";

export const POST = route({
  auth: "required",
  handler: async (c) => {
    const params = await (c.params as Promise<{ id: string }> | { id: string });
    const id = "then" in params ? (await params).id : params.id;
    const result = await resetUsernameLimit(c.actor, id);
    return result;
  },
});
