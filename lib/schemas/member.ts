import { z } from "zod";

export const WorkspaceRoleEnum = z.enum([
  "VIEWER",
  "COMMENTER",
  "EDITOR",
  "ADMIN",
  "NONE",
]);

export const ProjectRoleEnum = z.enum([
  "VIEWER",
  "COMMENTER",
  "EDITOR",
  "ADMIN",
]);

export const createInvitationSchema = z.object({
  emailOrUsername: z.string().min(1).max(255),
  role: z.string().min(1),
});

export const updateMemberRoleSchema = z.object({
  role: z.string().min(1),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1),
  confirmation: z.string().min(1),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
