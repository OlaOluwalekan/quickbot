import * as React from "react";
import { PLANS } from "@/server/billing/plans";
import { getSiteConfig } from "@/server/config/site";
import { DEFAULT_LOCALE, LOCALE_CODES, type LocaleCode } from "@/i18n/locales";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";

const messagesMap: Record<string, Record<string, any>> = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
};

function resolveLocale(explicitLocale?: string): LocaleCode {
  if (explicitLocale && LOCALE_CODES.includes(explicitLocale as LocaleCode)) {
    return explicitLocale as LocaleCode;
  }
  if (
    typeof process !== "undefined" &&
    process.env?.NEXT_LOCALE &&
    LOCALE_CODES.includes(process.env.NEXT_LOCALE as LocaleCode)
  ) {
    return process.env.NEXT_LOCALE as LocaleCode;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies } = require("next/headers");
    const cookieStore = cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieLocale && LOCALE_CODES.includes(cookieLocale as LocaleCode)) {
      return cookieLocale as LocaleCode;
    }
  } catch {
    // Outside request context
  }
  return DEFAULT_LOCALE;
}

function getMessages(locale: string): Record<string, any> {
  return messagesMap[locale] || messagesMap[DEFAULT_LOCALE] || enMessages;
}

function resolveMessageKey(keyPath: string, messages: Record<string, any>): string {
  const parts = keyPath.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      let fallbackCur: unknown = enMessages;
      for (const fp of parts) {
        if (fallbackCur && typeof fallbackCur === "object" && fp in (fallbackCur as Record<string, unknown>)) {
          fallbackCur = (fallbackCur as Record<string, unknown>)[fp];
        } else {
          return keyPath;
        }
      }
      return typeof fallbackCur === "string" ? fallbackCur : keyPath;
    }
  }
  return typeof cur === "string" ? cur : keyPath;
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd({
  siteUrl,
  locale,
}: {
  siteUrl?: string;
  locale?: string;
} = {}) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
  const activeLocale = resolveLocale(locale);
  const sameAs = [site.social.github, site.social.x].filter(
    (v): v is string => Boolean(v)
  );
  const addressLocality =
    site.company.address.split(",")[0]?.trim() || site.company.address;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.company.legalName,
    url: site.company.website,
    logo: `${resolvedSiteUrl}/icon.svg`,
    inLanguage: activeLocale,
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

export function WebSiteJsonLd({
  siteUrl,
  locale,
}: {
  siteUrl?: string;
  locale?: string;
} = {}) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
  const activeLocale = resolveLocale(locale);
  const messages = getMessages(activeLocale);
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.appName,
    url: resolvedSiteUrl,
    inLanguage: activeLocale,
    description:
      messages.Metadata?.root?.description ||
      messages.Metadata?.description ||
      "Collaborative AI workspace for research, writing, and knowledge organization.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${resolvedSiteUrl}/help?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return <JsonLd data={data} />;
}

export function SoftwareApplicationJsonLd({
  siteUrl,
  locale,
}: {
  siteUrl?: string;
  locale?: string;
} = {}) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
  const activeLocale = resolveLocale(locale);
  const messages = getMessages(activeLocale);

  const offers = Object.values(PLANS).map((plan) => ({
    "@type": "Offer",
    name: `${resolveMessageKey(plan.name, messages)} Plan`,
    price: plan.priceMonthly,
    priceCurrency: "USD",
    category: "Subscription",
    description: resolveMessageKey(plan.tagline, messages),
    url: `${resolvedSiteUrl}/pricing`,
  }));

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.appName,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    inLanguage: activeLocale,
    publisher: {
      "@type": "Organization",
      name: site.company.legalName,
      url: site.company.website,
    },
    offers,
    description:
      messages.Metadata?.root?.description ||
      messages.Metadata?.description ||
      "Collaborative AI workspace for research, writing, and knowledge organization with response versioning and passage-level reasoning.",
  };
  return <JsonLd data={data} />;
}

export function PricingFaqJsonLd({ locale }: { locale?: string } = {}) {
  const { billingEnabled } = getSiteConfig();
  const activeLocale = resolveLocale(locale);
  const messages = getMessages(activeLocale);
  // Same answers as the FAQ on the page: billing answers only once billing is live (rule 9).
  const faqItems = Object.values(messages.Marketing.faq.items).map((faq: any) => ({
    q: faq.q,
    a: !billingEnabled && "aLaunchingSoon" in faq ? faq.aLaunchingSoon : faq.a,
  }));
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: activeLocale,
    mainEntity: faqItems.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
  return <JsonLd data={data} />;
}
