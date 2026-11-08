import { NextResponse } from "next/server";
import { route } from "@/server/http/route";
import { getEntitlements } from "@/server/billing/entitlements";

export const GET = route({
  auth: "required",
  handler: async ({ actor }) => {
    const entitlements = await getEntitlements(actor.userId);
    return NextResponse.json(
      { data: entitlements },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  },
});
