import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import {
  getSiteConfig,
  setSiteConfigForTesting,
  clearSiteConfigForTesting,
} from "@/server/config/site";
import { env } from "@/server/env";
import {
  SiteConfigProvider,
  useSiteConfig,
} from "@/components/providers/site-config-provider";
import {
  renderEmail,
  EmailTemplateName,
  EmailTemplateMap,
} from "@/server/email/send";
import {
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";
import { MarketingFooter } from "@/components/marketing/footer";
import { AboutView } from "@/components/marketing/about-view";
import { getArticle } from "@/lib/help/articles";
import enMessages from "@/messages/en.json";

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

jest.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, values?: Record<string, unknown>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      let resolved = getNestedValue(
        enMessages as unknown as Record<string, unknown>,
        fullKey
      );
      if (typeof resolved !== "string") {
        resolved = key;
      }
      let str = resolved as string;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.split(`{${k}}`).join(String(v));
        }
      }
      return str;
    };
  },
}));

describe("Step F0.2 — Site configuration: emails, company identity, links from env", () => {
  afterEach(() => {
    clearSiteConfigForTesting();
  });

  describe("1. getSiteConfig()", () => {
    it("returns default non-routable .test emails and Vyraxity identity in test env", () => {
      const cfg = getSiteConfig();
      expect(cfg.appName).toBe("Klecx");
      expect(cfg.emails.support).toBe("support@example.test");
      expect(cfg.emails.privacy).toBe("privacy@example.test");
      expect(cfg.emails.abuse).toBe("abuse@example.test");
      expect(cfg.emails.legal).toBe("support@example.test");
      expect(cfg.emails.billing).toBe("support@example.test");
      expect(cfg.company.legalName).toBe("Vyraxity");
      expect(cfg.company.address).toBe("Lagos, Nigeria");
      expect(cfg.company.country).toBe("NG");
      expect(cfg.company.website).toBe("https://vyraxity.com");
      expect(cfg.billingEnabled).toBe(false);
    });

    it("is a pure read of the validated env (fallbacks are tested in unit/env.test.ts)", () => {
      const cfg = getSiteConfig();
      expect(cfg.emails.support).toBe(env.SUPPORT_EMAIL);
      expect(cfg.emails.legal).toBe(env.LEGAL_EMAIL);
      expect(cfg.emails.billing).toBe(env.BILLING_EMAIL);
      expect(cfg.company.legalName).toBe(env.COMPANY_LEGAL_NAME);
    });
  });

  describe("2. Email templates use getSiteConfig() and omit 123 Innovation Way", () => {
    const sampleData: EmailTemplateMap = {
      "verify-email": {
        url: "https://app.example.test/auth/verify?token=t1",
        name: "Ada",
      },
      "reset-password": {
        url: "https://app.example.test/auth/reset?token=t2",
        name: "Ada",
      },
      invitation: {
        inviterName: "Grace",
        teamOrProjectName: "Core Platform",
        inviteUrl: "https://app.example.test/invite/t3",
        role: "Editor",
      },
      "new-sign-in": {
        time: "2026-11-08 10:00 UTC",
        device: "Firefox on Linux",
        ipAddress: "198.51.100.10",
        location: "Lagos, NG",
      },
      "password-changed": {
        time: "2026-11-08 10:05 UTC",
      },
      "share-created": {
        title: "Architecture Spec",
        shareUrl: "https://app.example.test/s/t4",
      },
      "credits-low": {
        remainingCredits: 40,
        upgradeUrl: "https://app.example.test/pricing",
      },
      "payment-failed": {
        reason: "Insufficient funds",
        retryUrl: "https://app.example.test/settings/billing",
      },
      "support-ack": {
        ticketId: "tk_abcd1234",
        topic: "Account",
        message: "Need help with workspace",
        name: "Ada",
      },
      "support-notification": {
        ticketId: "tk_abcd1234",
        senderEmail: "ada@example.test",
        topic: "Account",
        message: "Need help with workspace",
        diagnostics: '{"os":"linux"}',
        userId: "user_1",
      },
      "ownership-transfer-requested": {
        fromUserName: "Sarah Connor",
        resourceName: "Cyberdyne Systems",
        acceptUrl: "https://klecx.vyraxity.com/transfers/accept?id=t-123",
        expiresInDays: 7,
      },
      "ownership-transfer-accepted": {
        toUserName: "John Connor",
        resourceName: "Cyberdyne Systems",
      },
      "member-limit-exceeded": {
        limit: 5,
        graceEndsAt: "2026-11-15T00:00:00.000Z",
        manageUrl: "https://klecx.vyraxity.com/settings/members",
      },
      "member-suspended": {
        resourceName: "Cyberdyne Systems",
        reason: "Member limit exceeded",
      },
      "member-restored": {
        resourceName: "Cyberdyne Systems",
      },
      mentioned: {
        authorName: "Sarah Connor",
        quote: "MongoDB database",
        excerpt: "use PostgreSQL instead",
        actionUrl: "https://klecx.vyraxity.com/workspaces/wksp-1#annotation-1",
      },
    };

    const allTemplates: EmailTemplateName[] = [
      "verify-email",
      "reset-password",
      "invitation",
      "new-sign-in",
      "password-changed",
      "share-created",
      "credits-low",
      "payment-failed",
      "support-ack",
      "support-notification",
    ];

    it("renders every email template with custom mocked site config", async () => {
      setSiteConfigForTesting({
        appUrl: "https://custom.klecx.test",
        billingEnabled: false,
        emails: {
          support: "custom-support@vyraxity.test",
          privacy: "custom-privacy@vyraxity.test",
          abuse: "custom-abuse@vyraxity.test",
          legal: "custom-legal@vyraxity.test",
          billing: "custom-billing@vyraxity.test",
        },
        company: {
          legalName: "Vyraxity Ltd",
          address: "Victoria Island, Lagos, Nigeria",
          country: "NG",
          website: "https://vyraxity.com",
        },
      });

      for (const template of allTemplates) {
        const rendered = await renderEmail(
          template,
          "recipient@example.test",
          sampleData[template],
          { locale: "en" }
        );

        expect(rendered.html).toContain("custom-support@vyraxity.test");
        expect(rendered.text).toContain("custom-support@vyraxity.test");
        expect(rendered.html).toContain(
          "Klecx is a product of Vyraxity Ltd · Victoria Island, Lagos, Nigeria"
        );
        expect(rendered.text).toContain(
          "Klecx is a product of Vyraxity Ltd · Victoria Island, Lagos, Nigeria"
        );
        expect(rendered.html).not.toContain("123 Innovation Way");
        expect(rendered.text).not.toContain("123 Innovation Way");
        expect(rendered.html).not.toContain("Merchant of Record services provided by Creem");
      }

      const signInEmail = await renderEmail(
        "new-sign-in",
        "recipient@example.test",
        sampleData["new-sign-in"],
        { locale: "en" }
      );
      expect(signInEmail.html).toContain("https://custom.klecx.test/settings");
    });
  });

  describe("3. JSON-LD, SiteConfigProvider, and Help MDX token replacement", () => {
    it("renders OrganizationJsonLd and SoftwareApplicationJsonLd from site config and drops unset social links", () => {
      setSiteConfigForTesting({
        company: {
          legalName: "Vyraxity",
          address: "Lagos, Nigeria",
          country: "NG",
          website: "https://vyraxity.com",
        },
        emails: {
          support: "support@vyraxity.com",
          privacy: "privacy@vyraxity.com",
          abuse: "abuse@vyraxity.com",
          legal: "support@vyraxity.com",
          billing: "support@vyraxity.com",
        },
        social: {},
      });

      const { container, rerender } = render(
        <>
          <OrganizationJsonLd siteUrl="https://klecx.com" />
          <SoftwareApplicationJsonLd siteUrl="https://klecx.com" />
        </>
      );

      const scripts = container.querySelectorAll('script[type="application/ld+json"]');
      expect(scripts).toHaveLength(2);

      const orgJson = JSON.parse(scripts[0]!.innerHTML);
      expect(orgJson.name).toBe("Vyraxity");
      expect(orgJson.url).toBe("https://vyraxity.com");
      expect(orgJson.address).toEqual({
        "@type": "PostalAddress",
        addressLocality: "Lagos",
        addressCountry: "NG",
      });
      expect(orgJson.contactPoint.email).toBe("support@vyraxity.com");
      expect(orgJson.sameAs).toBeUndefined();

      const appJson = JSON.parse(scripts[1]!.innerHTML);
      expect(appJson.name).toBe("Klecx");
      expect(appJson.publisher).toEqual({
        "@type": "Organization",
        name: "Vyraxity",
        url: "https://vyraxity.com",
      });

      // With social links configured
      setSiteConfigForTesting({
        social: {
          x: "https://x.com/vyraxity",
          github: "https://github.com/vyraxity",
        },
      });
      rerender(<OrganizationJsonLd siteUrl="https://klecx.com" />);
      const orgJsonWithSocial = JSON.parse(
        container.querySelector('script[type="application/ld+json"]')!.innerHTML
      );
      expect(orgJsonWithSocial.sameAs).toEqual([
        "https://github.com/vyraxity",
        "https://x.com/vyraxity",
      ]);
    });

    it("provides public site config via SiteConfigProvider to MarketingFooter and AboutView", () => {
      const customConfig = {
        ...getSiteConfig(),
        emails: {
          ...getSiteConfig().emails,
          support: "hello@vyraxity.com",
        },
        company: {
          ...getSiteConfig().company,
          legalName: "Vyraxity Ltd",
          address: "Lagos, Nigeria",
        },
      };

      function Probe() {
        const cfg = useSiteConfig();
        return <div data-testid="probe">{cfg.emails.support}</div>;
      }

      render(
        <SiteConfigProvider value={customConfig}>
          <Probe />
          <MarketingFooter />
          <AboutView />
        </SiteConfigProvider>
      );

      expect(screen.getByTestId("probe")).toHaveTextContent("hello@vyraxity.com");
      const links = screen.getAllByRole("link", { name: "hello@vyraxity.com" });
      expect(links.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/Vyraxity Ltd/)).toBeInTheDocument();
    });

    it("replaces %%SUPPORT_EMAIL%% tokens in Help MDX articles", () => {
      setSiteConfigForTesting({
        emails: {
          support: "helpdesk@vyraxity.com",
          privacy: "privacy@vyraxity.com",
          abuse: "abuse@vyraxity.com",
          legal: "helpdesk@vyraxity.com",
          billing: "helpdesk@vyraxity.com",
        },
      });

      const billingArticle = getArticle("en", "billing-and-cancellation");
      expect(billingArticle?.content).toContain("helpdesk@vyraxity.com");
      expect(billingArticle?.content).not.toContain("%%SUPPORT_EMAIL%%");

      const troubleshootingFr = getArticle("fr", "troubleshooting");
      expect(troubleshootingFr?.content).toContain("helpdesk@vyraxity.com");
      expect(troubleshootingFr?.content).not.toContain("%%SUPPORT_EMAIL%%");
    });
  });

  describe("4. Codebase hygiene: no hardcoded @klecx or @mail.klecx emails remain", () => {
    it("has zero matches for [A-Za-z0-9._%+-]+@(mail.)?klecx across app, components, server, lib, content, messages", () => {
      const rootDir = process.cwd();
      const targetDirs = ["app", "components", "server", "lib", "content", "messages"];
      const emailRegex = /[A-Za-z0-9._%+-]+@(mail\.)?klecx/;
      const matches: string[] = [];

      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (/\.(ts|tsx|js|jsx|json|mdx|md)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf8");
            if (emailRegex.test(content)) {
              matches.push(path.relative(rootDir, fullPath));
            }
          }
        }
      }

      for (const d of targetDirs) {
        const p = path.join(rootDir, d);
        if (fs.existsSync(p)) walk(p);
      }

      expect(matches).toEqual([]);
    });
  });
});
