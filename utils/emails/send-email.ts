"use server";

import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface SendMailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends a transactional email using Resend.
 *
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject line of the email.
 * @param {string} message - The HTML content of the email.
 * @returns {Promise<SendMailResult>} - Result object indicating delivery status.
 */
const sendMail = async (
  email: string,
  subject: string,
  message: string
): Promise<SendMailResult> => {
  try {
    if (!resend) {
      console.warn(
        `[Resend] Missing RESEND_API_KEY. Skipping email delivery to ${email} (${subject}).`
      );
      return {
        success: false,
        error: "Email service is not configured (missing RESEND_API_KEY).",
      };
    }

    const fromAddress =
      process.env.EMAIL_FROM || "Klecx <onboarding@resend.dev>";

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject,
      html: message,
    });

    if (error) {
      console.error("[Resend] Error sending email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      id: data?.id,
    };
  } catch (error) {
    console.error("[Resend] Unexpected error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
};

export default sendMail;
