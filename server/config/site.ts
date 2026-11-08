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
  const support = process.env.SUPPORT_EMAIL || env.SUPPORT_EMAIL;
  const privacy = process.env.PRIVACY_EMAIL || env.PRIVACY_EMAIL;
  const abuse = process.env.ABUSE_EMAIL || env.ABUSE_EMAIL;
  const legal =
    process.env.LEGAL_EMAIL ||
    (process.env.SUPPORT_EMAIL ? process.env.SUPPORT_EMAIL : env.LEGAL_EMAIL);
  const billing =
    process.env.BILLING_EMAIL ||
    (process.env.SUPPORT_EMAIL ? process.env.SUPPORT_EMAIL : env.BILLING_EMAIL);

  const legalName = process.env.COMPANY_LEGAL_NAME || env.COMPANY_LEGAL_NAME;
  const address = process.env.COMPANY_ADDRESS || env.COMPANY_ADDRESS;
  const country = process.env.COMPANY_COUNTRY || env.COMPANY_COUNTRY;
  const regNumber =
    process.env.COMPANY_REG_NUMBER !== undefined
      ? process.env.COMPANY_REG_NUMBER || undefined
      : env.COMPANY_REG_NUMBER;
  const website = process.env.COMPANY_WEBSITE || env.COMPANY_WEBSITE;

  const x =
    process.env.SOCIAL_X_URL !== undefined
      ? process.env.SOCIAL_X_URL || undefined
      : env.SOCIAL_X_URL;
  const github =
    process.env.SOCIAL_GITHUB_URL !== undefined
      ? process.env.SOCIAL_GITHUB_URL || undefined
      : env.SOCIAL_GITHUB_URL;

  const billingEnabled =
    process.env.BILLING_ENABLED !== undefined
      ? process.env.BILLING_ENABLED === "true"
      : env.BILLING_ENABLED;

  const appUrl = (process.env.APP_URL || env.APP_URL).replace(/\/$/, "");

  const base: SiteConfig = {
    appName: "Klecx",
    appUrl,
    billingEnabled,
    emails: {
      support,
      privacy,
      abuse,
      legal,
      billing,
    },
    company: {
      legalName,
      address,
      country,
      ...(regNumber ? { regNumber } : {}),
      website,
    },
    social: {
      ...(x ? { x } : {}),
      ...(github ? { github } : {}),
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
