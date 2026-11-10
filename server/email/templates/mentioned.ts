import "server-only";
import { renderSimpleEmail, appUrl } from "./simple";
import type {
  EmailTemplateResult,
  EmailTranslator,
  MentionedData,
} from "./types";

export function renderMentioned(
  data: MentionedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const values = {
    authorName: data.authorName,
    quote: data.quote ? `«${data.quote}»` : "",
    excerpt: data.excerpt,
  };

  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("mentioned.subject", values),
    heading: t("mentioned.heading", values),
    greeting: t("mentioned.greeting", values),
    body: t("mentioned.body", values),
    actionUrl: data.actionUrl ?? appUrl("/workspaces"),
    actionLabel: t("mentioned.button"),
    disclaimer: t("mentioned.disclaimer"),
  });
}
