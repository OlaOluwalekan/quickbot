import "server-only";
import { db } from "@/server/db/client";
import type { UpdatePreferencesInput } from "@/lib/schemas/user-preferences";

export async function getUserPreferences(userId: string) {
  const pref = await db.userPreference.findUnique({
    where: { userId },
  });

  return {
    uiLocale: pref?.uiLocale ?? null,
    aiLanguage: pref?.aiLanguage ?? null,
    webSearchEnabled: pref?.webSearchEnabled ?? true,
    updatedAt: pref?.updatedAt ?? null,
  };
}

export async function updateUserPreferences(
  userId: string,
  input: UpdatePreferencesInput
) {
  const updated = await db.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      uiLocale: input.uiLocale,
      aiLanguage: input.aiLanguage,
      webSearchEnabled: input.webSearchEnabled ?? true,
    },
    update: {
      ...(input.uiLocale !== undefined && { uiLocale: input.uiLocale }),
      ...(input.aiLanguage !== undefined && { aiLanguage: input.aiLanguage }),
      ...(input.webSearchEnabled !== undefined && { webSearchEnabled: input.webSearchEnabled }),
    },
  });

  return {
    uiLocale: updated.uiLocale,
    aiLanguage: updated.aiLanguage,
    webSearchEnabled: updated.webSearchEnabled,
    updatedAt: updated.updatedAt,
  };
}
