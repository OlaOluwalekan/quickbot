import { z } from "zod";

export const idSchema = z.uuid();
export const titleSchema = z.string().trim().min(1).max(120);
export const localeSchema = z.enum(["en", "es", "fr"]);

export type Locale = z.infer<typeof localeSchema>;
