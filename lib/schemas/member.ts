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
    canComment: z.boolean().nullable().optional(),
    canAsk: z.boolean().nullable().optional(),
    keepActive: z.boolean().optional(),
    monthlyCreditCap: z.number().int().min(0).max(1_000_000).nullable().optional(),
  })
  // Exactly one focus: the updates have different permission rules (cap and
  // keepActive are owner-only, role/capabilities need manage_members), so a
  // combined request could apply one change and then fail on the other.
  .refine(
    (d) => {
      const hasCap = d.monthlyCreditCap !== undefined;
      const hasKeep = d.keepActive !== undefined;
      const hasRoleOrCaps =
        d.role !== undefined || d.canComment !== undefined || d.canAsk !== undefined;
      return [hasCap, hasKeep, hasRoleOrCaps].filter(Boolean).length === 1;
    },
    {
      message: "Provide exactly one of monthlyCreditCap, keepActive, or role/capabilities",
    }
  );

export const transferOwnershipSchema = z
  .object({
    toUserId: z.string().min(1).optional(),
    newOwnerId: z.string().min(1).optional(),
    previousOwnerAction: z.enum(["STAY_ADMIN", "LEAVE"]).default("STAY_ADMIN"),
    confirm: z.string().min(1).optional(),
    confirmation: z.string().min(1).optional(),
  })
  .refine(
    (d) => Boolean(d.toUserId || d.newOwnerId) && Boolean(d.confirm || d.confirmation),
    {
      message: "Recipient (toUserId) and confirmation (confirm) are required",
    }
  );

export const ownershipTransferStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
]);

/** Accept by emailed token, or by invitation id (signed-in invitee only). */
export const acceptInvitationSchema = z.union([
  z.object({ token: z.string().min(1) }).strict(),
  z.object({ invitationId: z.string().min(1) }).strict(),
]);

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
