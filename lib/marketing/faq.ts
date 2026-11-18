/**
 * The questions on the pricing page's FAQ, in display order. The visible FAQ
 * (`components/marketing/faq.tsx`) and its FAQPage JSON-LD
 * (`components/seo/json-ld.tsx`) both read this list, so they always match.
 */
export const FAQ_KEYS = [
  "creditDef",
  "rollover",
  "cancel",
  "refund",
  "models",
  "privacy",
  "free",
  "collaboration",
  "search",
] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];

/** Answers that describe billing have a "launching soon" variant (rule 9). */
const BILLING_ANSWERS: ReadonlySet<FaqKey> = new Set(["cancel", "refund"]);

/** Message key (under `Marketing.faq`) of the answer shown for `key`. */
export function faqAnswerKey(key: FaqKey, billingEnabled: boolean): string {
  return !billingEnabled && BILLING_ANSWERS.has(key)
    ? `items.${key}.aLaunchingSoon`
    : `items.${key}.a`;
}
