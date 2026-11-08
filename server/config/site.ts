import "server-only";
import { env } from "@/server/env";

export interface SiteConfig {
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

let testOverride: Partial<SiteConfig> | null = null;

export function setSiteConfigForTesting(override: Partial<SiteConfig> | null): void {
  testOverride = override;
}

export function clearSiteConfigForTesting(): void {
  testOverride = null;
}

export function getSiteConfig(): SiteConfig {
  const base: SiteConfig = {
    appName: "Klecx",
    appUrl: env.APP_URL.replace(/\/$/, ""),
    billingEnabled: env.BILLING_ENABLED,
    emails: {
      support: env.SUPPORT_EMAIL,
      privacy: env.PRIVACY_EMAIL,
      abuse: env.ABUSE_EMAIL,
      legal: env.LEGAL_EMAIL,
      billing: env.BILLING_EMAIL,
    },
    company: {
      legalName: env.COMPANY_LEGAL_NAME,
      address: env.COMPANY_ADDRESS,
      country: env.COMPANY_COUNTRY,
      ...(env.COMPANY_REG_NUMBER ? { regNumber: env.COMPANY_REG_NUMBER } : {}),
      website: env.COMPANY_WEBSITE,
    },
    social: {
      ...(env.SOCIAL_X_URL ? { x: env.SOCIAL_X_URL } : {}),
      ...(env.SOCIAL_GITHUB_URL ? { github: env.SOCIAL_GITHUB_URL } : {}),
    },
  };
  if (!testOverride) {
    return base;
  }

  return {
    ...base,
    ...testOverride,
    emails: {
      ...base.emails,
      ...(testOverride.emails ?? {}),
    },
    company: {
      ...base.company,
      ...(testOverride.company ?? {}),
    },
    social: {
      ...base.social,
      ...(testOverride.social ?? {}),
    },
  };
}
