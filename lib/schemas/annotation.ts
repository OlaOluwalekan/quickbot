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
});

export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>;
