import { z } from "zod";

export const ATTACHMENT_KINDS = [
  "IMAGE",
  "DOCUMENT",
  "GENERATED_IMAGE",
  "GENERATED_DOCUMENT",
  "AVATAR",
  "AUDIO",
] as const;

export const ATTACHMENT_STATUSES = [
  "PENDING",
  "READY",
  "REJECTED",
  "DELETED",
] as const;

export const initAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  mime: z.string().min(1).max(100),
  bytes: z.number().int().positive(),
  kind: z.enum(ATTACHMENT_KINDS).default("DOCUMENT"),
});

export type InitAttachmentInput = z.infer<typeof initAttachmentSchema>;

export const completeAttachmentSchema = z.object({
  sha256: z.string().length(64).optional(),
});

export type CompleteAttachmentInput = z.infer<typeof completeAttachmentSchema>;
