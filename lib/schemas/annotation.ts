import { z } from "zod";

export const createAnnotationSchema = z.object({
  kind: z.enum(["COMMENT", "QUESTION"]),
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
  text: z
    .string()
    .min(1, "Annotation text cannot be empty")
    .max(2000, "Annotation text cannot exceed 2000 characters"),
});

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;

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

export const replyAnnotationSchema = z.object({
  idempotencyKey: z.string().min(1).max(255).optional(),
  prompt: z.string().min(1).max(20000).optional(),
  content: z.string().min(1).max(20000).optional(),
  anchor: z
    .object({
      exact: z.string().min(3).max(1000),
      prefix: z.string().default(""),
      suffix: z.string().default(""),
      start: z.number().int().nonnegative().optional(),
      end: z.number().int().nonnegative().optional(),
    })
    .optional(),
  versionId: z.string().optional(),
  contentSource: z.enum(["ORIGINAL", "EDIT"]).optional(),
  editRevision: z.number().int().positive().optional(),
  modelKey: z.string().optional(),
});

export type ReplyAnnotationInput = z.infer<typeof replyAnnotationSchema>;

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
