import { route } from "@/server/http/route";
import { pageQuery } from "@/server/http/pagination";
import { listProjectActivity } from "@/server/services/activity";

export const GET = route({
  query: pageQuery,
  handler: async ({ actor, params, query }) =>
    listProjectActivity(actor, params.id as string, query),
});
