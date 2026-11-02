import * as React from "react";
import { PLANS, BILLING_FAQ } from "@/server/billing/plans";

export function JsonLd({ data }: { data: Record<string, any> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd({ siteUrl }: { siteUrl: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Klecx",
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    sameAs: ["https://github.com/klecx", "https://x.com/klecx"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "support@mail.klecx.vyraxity.com",
      contactType: "customer support",
    },
  };
  return <JsonLd data={data} />;
}

export function WebSiteJsonLd({ siteUrl }: { siteUrl: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Klecx",
    url: siteUrl,
    description:
      "Collaborative AI workspace for research, writing, and knowledge organization.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/help?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return <JsonLd data={data} />;
}

export function SoftwareApplicationJsonLd({ siteUrl }: { siteUrl: string }) {
  const offers = Object.values(PLANS).map((plan) => ({
    "@type": "Offer",
    name: `${plan.name} Plan`,
    price: plan.priceMonthly,
    priceCurrency: "USD",
    category: "Subscription",
    description: plan.tagline,
    url: `${siteUrl}/pricing`,
  }));

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Klecx",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
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
