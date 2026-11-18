import * as React from "react";
import { createTranslator } from "use-intl/core";
import { PLANS } from "@/server/billing/plans";
import { getSiteConfig } from "@/server/config/site";
import { messagesFor, resolveLocaleCode } from "@/i18n/messages";
import { FAQ_KEYS, faqAnswerKey } from "@/lib/marketing/faq";

/**
 * Structured data for the marketing pages, in the page's language. Callers
 * pass the request locale (`await getLocale()`); text comes from that
 * locale's messages, with English for keys a beta locale lacks.
 */
type JsonLdProps = { locale: string; siteUrl?: string };

function translator(locale: string) {
  return createTranslator({
    locale: resolveLocaleCode(locale),
    messages: messagesFor(locale),
  }) as unknown as (key: string, values?: Record<string, unknown>) => string;
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // `<` is escaped so message text can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function OrganizationJsonLd({ locale, siteUrl }: JsonLdProps) {
  const site = getSiteConfig();
  const base = (siteUrl || site.appUrl).replace(/\/$/, "");
  // Only the social profiles that are configured (F0.2).
  const sameAs = [site.social.github, site.social.x].filter((v): v is string => Boolean(v));
  const addressLocality = site.company.address.split(",")[0]?.trim() || site.company.address;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.company.legalName,
    url: site.company.website,
    logo: `${base}/icon/512`,
    inLanguage: resolveLocaleCode(locale),
    address: {
      "@type": "PostalAddress",
      addressLocality,
      addressCountry: site.company.country,
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: site.emails.support,
      contactType: "customer support",
    },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
  return <JsonLd data={data} />;
}

export function WebSiteJsonLd({ locale, siteUrl }: JsonLdProps) {
  const site = getSiteConfig();
  const base = (siteUrl || site.appUrl).replace(/\/$/, "");
  const t = translator(locale);
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.appName,
    url: base,
    inLanguage: resolveLocaleCode(locale),
    description: t("Metadata.root.description"),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/help?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return <JsonLd data={data} />;
}

export function SoftwareApplicationJsonLd({ locale, siteUrl }: JsonLdProps) {
  const site = getSiteConfig();
  const base = (siteUrl || site.appUrl).replace(/\/$/, "");
  const t = translator(locale);

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.appName,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    inLanguage: resolveLocaleCode(locale),
    publisher: {
      "@type": "Organization",
      name: site.company.legalName,
      url: site.company.website,
    },
    description: t("Metadata.root.description"),
  };
  // Paid plans are offered only once billing is live (rule 9); Free always is.
  data.offers = Object.values(PLANS)
    .filter((plan) => site.billingEnabled || plan.priceMonthly === 0)
    .map((plan) => ({
      "@type": "Offer",
      name: t(plan.name),
      price: plan.priceMonthly,
      priceCurrency: "USD",
      category: "Subscription",
      description: t(plan.tagline),
      url: `${base}/pricing`,
    }));
  return <JsonLd data={data} />;
}

/** The FAQ on the pricing page, question for question (Google requires a match). */
export function PricingFaqJsonLd({ locale }: { locale: string }) {
  const { billingEnabled } = getSiteConfig();
  const t = translator(locale);
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: resolveLocaleCode(locale),
    mainEntity: FAQ_KEYS.map((key) => ({
      "@type": "Question",
      name: t(`Marketing.faq.items.${key}.q`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`Marketing.faq.${faqAnswerKey(key, billingEnabled)}`),
      },
    })),
  };
  return <JsonLd data={data} />;
}
