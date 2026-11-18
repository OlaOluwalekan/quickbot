import * as React from "react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";
import { getLocale } from "next-intl/server";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg text-fg">
      <OrganizationJsonLd locale={locale} />
      <WebSiteJsonLd locale={locale} />
      <SoftwareApplicationJsonLd locale={locale} />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
