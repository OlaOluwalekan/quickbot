import { NextResponse } from "next/server";
import { route } from "@/server/http/route";
import { updatePreferencesSchema } from "@/lib/schemas/user-preferences";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/services/user-preferences";
import { LOCALE_COOKIE } from "@/lib/locale";

export const GET = route({
  handler: async ({ actor }) => {
    return getUserPreferences(actor.userId);
  },
});

export const PATCH = route({
  body: updatePreferencesSchema,
  handler: async ({ actor, body }) => {
    const result = await updateUserPreferences(actor.userId, body);

    const res = NextResponse.json({ data: result });

    if (body.uiLocale) {
      res.cookies.set(LOCALE_COOKIE, body.uiLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
    }

    return res;
  },
});
