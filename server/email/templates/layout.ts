import "server-only";
import { env } from "@/server/env";

export interface EmailLayoutOptions {
  title: string;
  heading: string;
  greeting?: string;
  bodyHtml: string;
  bodyText: string;
  actionUrl?: string;
  actionLabel?: string;
  disclaimerHtml?: string;
  disclaimerText?: string;
  toEmail: string;
  supportEmail?: string;
  copyUrlNotice?: string;
  supportNotice?: string;
  legalNotice?: string;
  transactionalDisclaimer?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmailLayout(options: EmailLayoutOptions): RenderedEmail {
  const currentYear = new Date().getFullYear();
  const supportEmail = options.supportEmail || env.SUPPORT_EMAIL || "support@mail.klecx.vyraxity.com";

  const copyUrlNotice =
    options.copyUrlNotice ||
    "If the button above does not work, copy and paste this link into your web browser:";

  const supportNotice =
    options.supportNotice ||
    `Questions or need help? Contact our support team at ${supportEmail}`;

  const legalNotice =
    options.legalNotice ||
    `© ${currentYear} Klecx AI. All rights reserved. 123 Innovation Way, Suite 400. Merchant of Record services provided by Creem.`;

  const transactionalDisclaimer =
    options.transactionalDisclaimer ||
    `This is an automated transactional message sent to ${options.toEmail}. You are receiving this because an account event or security action occurred.`;

  const actionBlockHtml = options.actionUrl && options.actionLabel
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 24px 0;">
        <tr>
          <td align="center" style="border-radius: 8px; background: #4f46e5;">
            <a href="${options.actionUrl}" target="_blank" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; display: inline-block; background-color: #4f46e5;">
              ${options.actionLabel}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
        ${copyUrlNotice}
      </p>
      <p style="margin: 6px 0 0 0; font-size: 12px; line-height: 1.4; color: #818cf8; word-break: break-all;">
        <a href="${options.actionUrl}" style="color: #818cf8; text-decoration: underline;">${options.actionUrl}</a>
      </p>
    `
    : "";

  const disclaimerBlockHtml = options.disclaimerHtml
    ? `
      <div style="margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 13px; line-height: 1.5; color: #94a3b8;">
        ${options.disclaimerHtml}
      </div>
    `
    : "";

  const greetingHtml = options.greeting
    ? `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #f1f5f9; font-weight: 500;">${options.greeting}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #020617; width: 100%; table-layout: fixed; padding: 40px 16px;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header / Brand -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left">
                    <span style="display: inline-block; font-size: 24px; font-weight: 800; letter-spacing: -0.03em; color: #818cf8;">
                      Klecx
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.01em;">
                ${options.heading}
              </h1>

              ${greetingHtml}

              <div style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                ${options.bodyHtml}
              </div>

              ${actionBlockHtml}

              ${disclaimerBlockHtml}
            </td>
          </tr>

          <!-- Footer (Support & Creem Legal Info) -->
          <tr>
            <td style="padding: 28px 32px; background-color: #090d16; border-top: 1px solid #1e293b; font-size: 12px; line-height: 1.5; color: #64748b;">
              <p style="margin: 0 0 10px 0;">
                ${supportNotice.replace(
                  supportEmail,
                  `<a href="mailto:${supportEmail}" style="color: #94a3b8; text-decoration: underline;">${supportEmail}</a>`
                )}
              </p>
              <p style="margin: 0 0 10px 0;">
                ${legalNotice}
              </p>
              <p style="margin: 0; color: #475569;">
                ${transactionalDisclaimer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [
    "KLECX AI",
    "========================================",
    options.heading.toUpperCase(),
    "",
  ];

  if (options.greeting) {
    textLines.push(options.greeting);
    textLines.push("");
  }

  textLines.push(options.bodyText);
  textLines.push("");

  if (options.actionUrl && options.actionLabel) {
    textLines.push(`${options.actionLabel}:`);
    textLines.push(options.actionUrl);
    textLines.push("");
  }

  if (options.disclaimerText) {
    textLines.push(options.disclaimerText);
    textLines.push("");
  }

  textLines.push("----------------------------------------");
  textLines.push(supportNotice);
  textLines.push(legalNotice);
  textLines.push(transactionalDisclaimer);

  const text = textLines.join("\n");

  return { html, text };
}
