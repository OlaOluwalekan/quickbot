import { z } from "zod";

export const regenerateResponseSchema = z.object({
  idempotencyKey: z.string().min(1, "Idempotency key is required").max(255),
  modelKey: z.string().optional().default("text-economy"),
  think: z.boolean().optional(),
  language: z.string().optional().default("en"),
});

export type RegenerateResponseInput = z.input<typeof regenerateResponseSchema>;

export const setActiveVersionSchema = z.object({
  versionId: z.string().min(1, "versionId is required"),
});

export type SetActiveVersionInput = z.infer<typeof setActiveVersionSchema>;
