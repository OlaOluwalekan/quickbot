import { z } from "zod";

export const noteStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

export const listNotesQuerySchema = z.object({
  status: noteStatusSchema.optional(),
});

export const patchNoteSchema = z
  .object({
    status: noteStatusSchema,
  })
  .strict();

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type PatchNoteInput = z.infer<typeof patchNoteSchema>;
