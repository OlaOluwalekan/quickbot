import { route } from "@/server/http/route";
import { getHomeData } from "@/server/services/home";

export const GET = route({
  handler: async ({ actor }) => getHomeData(actor),
});
