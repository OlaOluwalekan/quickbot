import { z } from "zod";

export const regenerateResponseSchema = z.object({
  idempotencyKey: z.string().min(1, "Idempotency key is required").max(255),
  modelKey: z.string().optional().default("text-economy"),
  think: z.boolean().optional(),
  language: z.string().optional(),
});

export type RegenerateResponseInput = z.input<typeof regenerateResponseSchema>;

export const setActiveVersionSchema = z.object({
  versionId: z.string().min(1, "versionId is required"),
});

export type SetActiveVersionInput = z.infer<typeof setActiveVersionSchema>;

export const createResponseEditSchema = z.object({
  content: z
    .string()
    .min(1, "Content cannot be empty")
    .max(100_000, "Content cannot exceed 100,000 characters"),
});

export type CreateResponseEditInput = z.infer<typeof createResponseEditSchema>;

export const responseViewQuerySchema = z.object({
  view: z.enum(["original", "edited"]).optional().default("edited"),
});

export type ResponseViewQuery = z.infer<typeof responseViewQuerySchema>;
