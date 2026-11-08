import * as React from "react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";
import { getSiteConfig } from "@/server/config/site";

const siteUrl = getSiteConfig().appUrl;

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg text-fg">
      <OrganizationJsonLd siteUrl={siteUrl} />
      <WebSiteJsonLd siteUrl={siteUrl} />
      <SoftwareApplicationJsonLd siteUrl={siteUrl} />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
