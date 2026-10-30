import "server-only";
import { SendMailResult } from "./send-email";
import { env } from "@/server/env";
import { sendEmail } from "@/server/email/send";

/**
 * Sends a Klecx branded verification email using the central transactional email module.
 *
 * @param email - The recipient's email address.
 * @param token - The verification token to be included in the email.
 * @returns A promise that resolves with the email send result.
 */
export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<SendMailResult> => {
  const baseUrl = env.APP_URL.replace(/\/$/, "");
  const verifyUrl = `${baseUrl}/auth/verify/verification?token=${encodeURIComponent(
    token
  )}`;

  const result = await sendEmail("verify-email", email, { url: verifyUrl });

  return {
    success: result.success,
    id: result.id,
    error: result.error,
  };
};
