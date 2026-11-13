import { z } from "zod";

export const regenerateResponseSchema = z.object({
  idempotencyKey: z.string().min(1, "Idempotency key is required").max(255),
  modelKey: z.string().optional().default("text-economy"),
  think: z.boolean().optional(),
  grounding: z.boolean().optional(),
  language: z.string().optional(),
});

export type RegenerateResponseInput = z.input<typeof regenerateResponseSchema>;

export const setActiveVersionSchema = z.object({
  versionId: z.string().min(1, "versionId is required"),
});

export type SetActiveVersionInput = z.infer<typeof setActiveVersionSchema>;

/**
 * Longest text an edit may hold. Same as the longest text kept from an
 * uploaded document (MAX_EXTRACTED_CHARS), so every document can be edited.
 */
export const MAX_EDIT_CHARS = 200_000;

export const createResponseEditSchema = z.object({
  content: z
    .string()
    .min(1, "Content cannot be empty")
    .max(MAX_EDIT_CHARS, "Content cannot exceed 200,000 characters"),
  // Revision the edit was made on (null = the original text). When given, the
  // server refuses the edit if a newer revision exists.
  baseRevision: z.number().int().min(0).nullable().optional(),
  acceptedSuggestionIds: z.array(z.string().min(1)).max(200).optional(),
});

export type CreateResponseEditInput = z.infer<typeof createResponseEditSchema>;

export const responseViewQuerySchema = z.object({
  view: z.enum(["original", "edited"]).optional().default("edited"),
});

export type ResponseViewQuery = z.infer<typeof responseViewQuerySchema>;
