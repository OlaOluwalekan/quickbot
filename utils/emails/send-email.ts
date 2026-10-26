import "server-only";
import { Resend } from "resend";
import { env } from "@/server/env";

const resend = new Resend(env.RESEND_API_KEY);

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
    const fromAddress = env.EMAIL_FROM;

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
