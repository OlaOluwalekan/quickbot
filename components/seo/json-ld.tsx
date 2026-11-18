import * as React from "react";
import { PLANS } from "@/server/billing/plans";
import { getSiteConfig } from "@/server/config/site";
import enMessages from "@/messages/en.json";

function resolveMessageKey(keyPath: string): string {
  const parts = keyPath.split(".");
  let cur: unknown = enMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return keyPath;
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

export function OrganizationJsonLd({ siteUrl }: { siteUrl?: string }) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
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

export function WebSiteJsonLd({ siteUrl }: { siteUrl?: string }) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.appName,
    url: resolvedSiteUrl,
    description:
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

export function SoftwareApplicationJsonLd({ siteUrl }: { siteUrl?: string }) {
  const site = getSiteConfig();
  const resolvedSiteUrl = siteUrl || site.appUrl;
  const offers = Object.values(PLANS).map((plan) => ({
    "@type": "Offer",
    name: `${resolveMessageKey(plan.name)} Plan`,
    price: plan.priceMonthly,
    priceCurrency: "USD",
    category: "Subscription",
    description: resolveMessageKey(plan.tagline),
    url: `${resolvedSiteUrl}/pricing`,
  }));

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.appName,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    publisher: {
      "@type": "Organization",
      name: site.company.legalName,
      url: site.company.website,
    },
    offers,
    description:
      "Collaborative AI workspace for research, writing, and knowledge organization with response versioning and passage-level reasoning.",
  };
  return <JsonLd data={data} />;
}

export function PricingFaqJsonLd() {
  const { billingEnabled } = getSiteConfig();
  // Same answers as the FAQ on the page: billing answers only once billing is live (rule 9).
  const faqItems = Object.values(enMessages.Marketing.faq.items).map((faq) => ({
    q: faq.q,
    a: !billingEnabled && "aLaunchingSoon" in faq ? faq.aLaunchingSoon : faq.a,
  }));
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
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
