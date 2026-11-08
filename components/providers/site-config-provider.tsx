"use client";

import * as React from "react";

export interface PublicSiteConfig {
  appName: "Klecx";
  appUrl: string;
  billingEnabled: boolean;
  emails: {
    support: string;
    privacy: string;
    abuse: string;
    legal: string;
    billing: string;
  };
  company: {
    legalName: string;
    address: string;
    country: string;
    regNumber?: string;
    website: string;
  };
  social: {
    x?: string;
    github?: string;
  };
}

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
  appName: "Klecx",
  appUrl: "http://localhost:3000",
  billingEnabled: false,
  emails: {
    support: "support@example.test",
    privacy: "privacy@example.test",
    abuse: "abuse@example.test",
    legal: "support@example.test",
    billing: "support@example.test",
  },
  company: {
    legalName: "Vyraxity",
    address: "Lagos, Nigeria",
    country: "NG",
    website: "https://vyraxity.com",
  },
  social: {},
};

const SiteConfigContext = React.createContext<PublicSiteConfig>(
  DEFAULT_PUBLIC_SITE_CONFIG
);

export function SiteConfigProvider({
  value,
  children,
}: {
  value: PublicSiteConfig;
  children: React.ReactNode;
}) {
  return (
    <SiteConfigContext.Provider value={value}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig(): PublicSiteConfig {
  return React.useContext(SiteConfigContext);
}
