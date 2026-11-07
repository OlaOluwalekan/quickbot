import { z } from "zod";
import { idSchema } from "./common";

export const shareScopeSchema = z.enum(["WORKSPACE", "RESPONSE"]);
export const shareViewSchema = z.enum(["EDITED_IF_AVAILABLE", "ORIGINAL"]);

export const createShareLinkSchema = z
  .object({
    workspaceId: idSchema,
    scope: shareScopeSchema,
    responseId: idSchema.optional().nullable(),
    view: shareViewSchema.default("EDITED_IF_AVAILABLE"),
    expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
    showAuthor: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.scope === "RESPONSE" && !data.responseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responseId"],
        message: "responseId is required when scope is RESPONSE",
      });
    }
    if (data.scope === "WORKSPACE" && data.responseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responseId"],
        message: "responseId must be omitted when scope is WORKSPACE",
      });
    }
  });

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
