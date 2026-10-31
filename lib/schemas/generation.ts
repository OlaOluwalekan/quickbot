import { z } from "zod";

export const createGenerationSchema = z.object({
  idempotencyKey: z.string().min(1, "Idempotency key is required").max(255),
  prompt: z.string().min(1, "Prompt cannot be empty").max(20000, "Prompt must be at most 20,000 characters"),
  modelKey: z.string().optional().default("text-economy"),
  kind: z.enum(["TEXT", "IMAGE"]).optional().default("TEXT"),
  attachmentIds: z.array(z.string()).optional(),
  regenerateResponseId: z.string().optional(),
  think: z.boolean().optional(),
  language: z.string().optional(),
});

export type CreateGenerationInput = z.input<typeof createGenerationSchema>;
export type ParsedGenerationInput = z.infer<typeof createGenerationSchema>;
