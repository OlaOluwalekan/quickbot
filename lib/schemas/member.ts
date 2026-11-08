import { z } from "zod";

export const WorkspaceRoleEnum = z.enum([
  "VIEWER",
  "COMMENTER",
  "EDITOR",
  "ADMIN",
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

export const updateMemberRoleSchema = z
  .object({
    role: z.string().min(1).optional(),
    monthlyCreditCap: z.number().int().min(0).max(1_000_000).nullable().optional(),
  })
  // Exactly one: the two updates have different permission rules, so a
  // combined request could apply the role change and then fail on the cap.
  .refine((d) => (d.role !== undefined) !== (d.monthlyCreditCap !== undefined), {
    message: "Provide either role or monthlyCreditCap, not both",
  });

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().min(1),
  confirmation: z.string().min(1),
});

/** Accept by emailed token, or by invitation id (signed-in invitee only). */
export const acceptInvitationSchema = z.union([
  z.object({ token: z.string().min(1) }).strict(),
  z.object({ invitationId: z.string().min(1) }).strict(),
]);

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
