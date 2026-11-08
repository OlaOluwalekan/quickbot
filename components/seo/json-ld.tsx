import * as React from "react";
import { PLANS, BILLING_FAQ } from "@/server/billing/plans";
import { getSiteConfig } from "@/server/config/site";

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
    name: `${plan.name} Plan`,
    price: plan.priceMonthly,
    priceCurrency: "USD",
    category: "Subscription",
    description: plan.tagline,
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
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: BILLING_FAQ.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
  return <JsonLd data={data} />;
}
