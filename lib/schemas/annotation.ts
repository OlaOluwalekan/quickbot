import { z } from "zod";

export const createAnnotationSchema = z
  .object({
    kind: z.enum(["COMMENT", "ASK"]),
    mode: z.enum(["now", "queue"]).optional(),
    visibility: z.enum(["PRIVATE", "WORKSPACE"]).optional(),
    anchor: z.object({
      exact: z
        .string()
        .min(3, "Selected text must be at least 3 characters")
        .max(1000, "Selected text cannot exceed 1000 characters"),
      prefix: z.string().default(""),
      suffix: z.string().default(""),
      start: z.number().int().nonnegative().optional(),
      end: z.number().int().nonnegative().optional(),
    }),
    contentSource: z.enum(["ORIGINAL", "EDIT"]).optional().default("ORIGINAL"),
    editRevision: z.number().int().positive().optional(),
    text: z.string().min(1, "Annotation text cannot be empty"),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "COMMENT") {
      if (data.text.length > 2000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Comment text cannot exceed 2000 characters",
          path: ["text"],
        });
      }
      if (data.mode !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mode is only allowed for ASK annotations",
          path: ["mode"],
        });
      }
    } else if (data.kind === "ASK") {
      if (data.text.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ask question cannot exceed 500 characters",
          path: ["text"],
        });
      }
    }
  });

export type CreateAnnotationInput = z.input<typeof createAnnotationSchema>;

export const listAnnotationsQuerySchema = z.object({
  versionId: z.string().optional(),
});

export type ListAnnotationsQuery = z.infer<typeof listAnnotationsQuerySchema>;

export const updateAnnotationSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  resolved: z.boolean().optional(),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).optional(),
  questionState: z
    .enum(["NONE", "QUEUED", "ANSWERING", "ANSWERED", "CANCELLED", "FAILED"])
    .optional(),
});

export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>;

export const createAnnotationMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty").max(20000),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export type CreateAnnotationMessageInput = z.infer<
  typeof createAnnotationMessageSchema
>;

export const listQuestionsQuerySchema = z.object({
  state: z
    .enum(["NONE", "QUEUED", "ANSWERING", "ANSWERED", "CANCELLED", "FAILED"])
    .optional(),
});

export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

export const runQuestionBatchSchema = z.object({
  annotationIds: z.array(z.string()).max(10).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  modelKey: z.string().optional(),
});

export type RunQuestionBatchInput = z.infer<typeof runQuestionBatchSchema>;

export const promoteAnnotationSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
  target: z.enum(["TIMELINE", "NEW_WORKSPACE"]),
});

export type PromoteAnnotationInput = z.infer<typeof promoteAnnotationSchema>;
