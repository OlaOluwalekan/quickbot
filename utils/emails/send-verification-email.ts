import "server-only";
import sendMail, { SendMailResult } from "./send-email";

/**
 * Sends a Klecx branded verification email to the specified email address using Resend.
 *
 * @param email - The recipient's email address.
 * @param token - The verification token to be included in the email.
 * @returns A promise that resolves with the email send result.
 */
export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<SendMailResult> => {
  const baseUrl = (process.env.DOMAIN || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  const verifyUrl = `${baseUrl}/auth/verify/verification?token=${encodeURIComponent(
    token
  )}`;

  console.log(`\n========================================`);
  console.log(`[Verification Email] To: ${email}`);
  console.log(`[Verification Link]: ${verifyUrl}`);
  console.log(`========================================\n`);

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your Klecx account</title>
  </head>
  <body style="margin:0;padding:0;background-color:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#090d16;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#111827;border:1px solid #1e293b;border-radius:16px;padding:36px 32px;box-shadow:0 20px 45px rgba(0,0,0,0.45);">
            <tr>
              <td align="left" style="padding-bottom:24px;">
                <span style="display:inline-block;font-size:24px;font-weight:800;letter-spacing:-0.03em;background:linear-gradient(135deg,#818cf8,#38bdf8);-webkit-background-clip:text;color:#818cf8;">
                  Klecx
                </span>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding-bottom:12px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.02em;">
                  Confirm your email address
                </h1>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding-bottom:28px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#94a3b8;">
                  Welcome to <strong style="color:#e2e8f0;">Klecx</strong>. Click the button below to verify your email address and activate your AI workspace. This verification link expires in 1 hour.
                </p>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding-bottom:28px;">
                <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#6366f1,#0ea5e9);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;box-shadow:0 8px 20px rgba(99,102,241,0.35);">
                  Verify Email Address
                </a>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding-bottom:24px;border-bottom:1px solid #1e293b;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">
                  Or copy and paste this URL into your browser:
                </p>
                <p style="margin:0;font-size:12px;word-break:break-all;color:#818cf8;">
                  <a href="${verifyUrl}" style="color:#818cf8;text-decoration:underline;">${verifyUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding-top:20px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                  If you didn't create a Klecx account, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return await sendMail(email, "Verify your Klecx account", html);
};
