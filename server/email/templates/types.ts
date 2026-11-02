import "server-only";

export type EmailTranslator = (
  key: string,
  values?: Record<string, unknown>
) => string;

export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

export interface VerifyEmailData {
  url: string;
  name?: string;
}

export interface ResetPasswordData {
  url: string;
  name?: string;
}

export interface InvitationData {
  inviterName: string;
  teamOrProjectName: string;
  inviteUrl: string;
  role?: string;
}

export interface NewSignInData {
  time: string;
  device?: string;
  ipAddress?: string;
  location?: string;
}

export interface PasswordChangedData {
  time: string;
}

export interface ShareCreatedData {
  title: string;
  shareUrl: string;
}

export interface CreditsLowData {
  remainingCredits: number;
  upgradeUrl: string;
}

export interface PaymentFailedData {
  reason?: string;
  retryUrl: string;
}

export interface EmailTemplateMap {
  "verify-email": VerifyEmailData;
  "reset-password": ResetPasswordData;
  invitation: InvitationData;
  "new-sign-in": NewSignInData;
  "password-changed": PasswordChangedData;
  "share-created": ShareCreatedData;
  "credits-low": CreditsLowData;
  "payment-failed": PaymentFailedData;
}

export type EmailTemplateName = keyof EmailTemplateMap;
