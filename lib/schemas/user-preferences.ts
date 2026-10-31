import { z } from "zod";
import { UI_LOCALES, AI_LANGUAGES } from "@/lib/locale";

export const updatePreferencesSchema = z.object({
  uiLocale: z.enum(UI_LOCALES).nullable().optional(),
  aiLanguage: z.enum(AI_LANGUAGES).nullable().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
