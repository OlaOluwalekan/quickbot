import { z } from "zod";

export const REVIEW_PRESETS = ["errors", "consistency", "clarity", "custom"] as const;

export const documentReviewSchema = z
  .object({
    preset: z.enum(REVIEW_PRESETS).default("errors"),
    instruction: z.string().trim().max(2000).optional(),
    visibility: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
    idempotencyKey: z.string().min(8).max(255),
  })
  .refine((v) => v.preset !== "custom" || !!v.instruction, {
    message: "An instruction is required for a custom review",
    path: ["instruction"],
  });

export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
