import {
  LOCALES,
  LOCALE_CODES,
  DEFAULT_LOCALE,
  getLocaleDefinition,
  isValidLocaleCode,
  getAlternateOgLocales,
} from "@/i18n/locales";
import { STATIC_MARKETING_ROUTES, getAllMarketingRoutes } from "@/lib/seo/routes";
import { buildAlternates } from "@/lib/seo/alternates";
import {
  OrganizationJsonLd,
  WebSiteJsonLd,
  SoftwareApplicationJsonLd,
  PricingFaqJsonLd,
} from "@/components/seo/json-ld";
import robots from "@/app/robots";
import manifest from "@/app/manifest";
import sitemap from "@/app/sitemap";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";
import { getSiteConfig, setSiteConfigForTesting } from "@/server/config/site";
import React from "react";

describe("Step F5.9 — SEO files localized", () => {
  beforeEach(() => {
    delete process.env.NEXT_LOCALE;
    delete process.env.MARKETING_LOCALE_URLS;
    setSiteConfigForTesting({ billingEnabled: true });
  });

  describe("1. Locale Registry (i18n/locales.ts)", () => {
    it("exports registry with all supported locales", () => {
      expect(LOCALE_CODES).toEqual(["en", "es", "fr"]);
      expect(DEFAULT_LOCALE).toBe("en");
      expect(LOCALES).toHaveLength(3);
    });

    it("retrieves locale definitions correctly", () => {
      const en = getLocaleDefinition("en");
      expect(en).toBeDefined();
      expect(en?.hreflang).toBe("en");
      expect(en?.ogLocale).toBe("en_US");
      expect(en?.dir).toBe("ltr");

      const es = getLocaleDefinition("es");
      expect(es?.ogLocale).toBe("es_ES");

      const fr = getLocaleDefinition("fr");
      expect(fr?.ogLocale).toBe("fr_FR");

      expect(isValidLocaleCode("en")).toBe(true);
      expect(isValidLocaleCode("es")).toBe(true);
      expect(isValidLocaleCode("fr")).toBe(true);
      expect(isValidLocaleCode("de")).toBe(false);
    });

    it("computes alternate OG locales correctly", () => {
      expect(getAlternateOgLocales("en")).toEqual(["es_ES", "fr_FR"]);
      expect(getAlternateOgLocales("es")).toEqual(["en_US", "fr_FR"]);
      expect(getAlternateOgLocales("fr")).toEqual(["en_US", "es_ES"]);
    });
  });

  describe("2. Routes and Alternates", () => {
    it("STATIC_MARKETING_ROUTES contains core marketing URLs", () => {
      expect(STATIC_MARKETING_ROUTES).toContain("");
      expect(STATIC_MARKETING_ROUTES).toContain("/features");
      expect(STATIC_MARKETING_ROUTES).toContain("/pricing");
      expect(STATIC_MARKETING_ROUTES).toContain("/about");
      expect(STATIC_MARKETING_ROUTES).toContain("/status");
      expect(STATIC_MARKETING_ROUTES).toContain("/support");
      expect(STATIC_MARKETING_ROUTES).toContain("/help");
    });

    it("getAllMarketingRoutes includes static routes and help slugs", () => {
      const routes = getAllMarketingRoutes();
      expect(routes).toEqual(expect.arrayContaining(STATIC_MARKETING_ROUTES));
      expect(routes.some((r) => r.startsWith("/help/"))).toBe(true);
    });

    it("buildAlternates produces canonical path with MARKETING_LOCALE_URLS unset", () => {
      const alt = buildAlternates("/pricing");
      expect(alt).toEqual({
        canonical: "/pricing",
      });
      const rootAlt = buildAlternates("/");
      expect(rootAlt).toEqual({
        canonical: "/",
      });
    });

    it("buildAlternates generates per-language alternates when MARKETING_LOCALE_URLS=true", () => {
      process.env.MARKETING_LOCALE_URLS = "true";
      const siteUrl = getSiteConfig().appUrl.replace(/\/$/, "");
      const alt = buildAlternates("/pricing");
      expect(alt.canonical).toBe(`${siteUrl}/pricing`);
      expect(alt.languages).toBeDefined();
      expect(alt.languages?.en).toBe(`${siteUrl}/en/pricing`);
      expect(alt.languages?.es).toBe(`${siteUrl}/es/pricing`);
      expect(alt.languages?.fr).toBe(`${siteUrl}/fr/pricing`);
      expect(alt.languages?.["x-default"]).toBe(`${siteUrl}/pricing`);
    });
  });

  describe("3. Robots and Manifest", () => {
    it("robots.ts disallows invite, dev, maintenance, offline, etc.", () => {
      const siteUrl = getSiteConfig().appUrl.replace(/\/$/, "");
      const rob = robots();
      expect(rob.rules).toBeDefined();
      const rule = Array.isArray(rob.rules) ? rob.rules[0] : rob.rules;
      expect(rule?.disallow).toEqual(
        expect.arrayContaining([
          "/invite/",
          "/dev/",
          "/maintenance",
          "/offline",
          "/api/",
          "/settings",
          "/workspaces",
          "/projects",
          "/s/",
          "/auth/",
        ])
      );
      expect(rob.sitemap).toBe(`${siteUrl}/sitemap.xml`);
    });

    it("manifest.ts generates valid manifest with localized metadata and brand colors", async () => {
      const m = await manifest();
      expect(m.name).toContain("Klecx");
      expect(m.short_name).toBe("Klecx");
      expect(m.display).toBe("standalone");
      expect(m.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(m.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(m.icons?.length).toBeGreaterThan(0);
    });

    it("manifest.ts generates localized manifest when NEXT_LOCALE=fr", async () => {
      process.env.NEXT_LOCALE = "fr";
      const m = await manifest();
      expect(m.name).toBe(frMessages.Metadata.manifest.name);
      expect(m.description).toBe(frMessages.Metadata.manifest.description);
      expect(m.lang).toBe("fr");
    });

    it("sitemap.ts returns all marketing entries with help article timestamps", () => {
      const siteUrl = getSiteConfig().appUrl.replace(/\/$/, "");
      const sm = sitemap();
      expect(sm.length).toBeGreaterThan(STATIC_MARKETING_ROUTES.length);
      const pricingEntry = sm.find((e) => e.url === `${siteUrl}/pricing`);
      expect(pricingEntry).toBeDefined();
      expect(pricingEntry?.changeFrequency).toBe("weekly");
      expect(pricingEntry?.priority).toBe(0.9);
    });
  });

  describe("4. JSON-LD Localization & FAQ Parity", () => {
    it("OrganizationJsonLd includes inLanguage and site company info", () => {
      const el = OrganizationJsonLd({ locale: "en" }) as React.ReactElement<{
        data: Record<string, unknown>;
      }>;
      const data = el.props.data;
      expect(data["@type"]).toBe("Organization");
      expect(data.inLanguage).toBe("en");
      expect(data.name).toBe("Vyraxity");
    });

    it("WebSiteJsonLd includes inLanguage and localized description", () => {
      const enEl = WebSiteJsonLd({ locale: "en" }) as React.ReactElement<{
        data: Record<string, unknown>;
      }>;
      expect(enEl.props.data.inLanguage).toBe("en");
      expect(enEl.props.data.description).toBe(enMessages.Metadata.root.description);

      const esEl = WebSiteJsonLd({ locale: "es" }) as React.ReactElement<{
        data: Record<string, unknown>;
      }>;
      expect(esEl.props.data.inLanguage).toBe("es");
      expect(esEl.props.data.description).toBe(esMessages.Metadata.root.description);
    });

    it("SoftwareApplicationJsonLd includes inLanguage and localized offers", () => {
      const enEl = SoftwareApplicationJsonLd({ locale: "en" }) as React.ReactElement<{
        data: { inLanguage: string; offers: Array<{ name: string; description: string }> };
      }>;
      expect(enEl.props.data.inLanguage).toBe("en");
      expect(enEl.props.data.offers[0]?.name).toBe("Free Plan");

      const esEl = SoftwareApplicationJsonLd({ locale: "es" }) as React.ReactElement<{
        data: { inLanguage: string; offers: Array<{ name: string; description: string }> };
      }>;
      expect(esEl.props.data.inLanguage).toBe("es");
      expect(esEl.props.data.offers[0]?.name).toBe("Gratis Plan");
    });

    it("PricingFaqJsonLd matches active locale messages for questions and answers", () => {
      const enFaq = (PricingFaqJsonLd({ locale: "en" }) as React.ReactElement<{
        data: { inLanguage: string; mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
      }>).props.data;
      expect(enFaq.inLanguage).toBe("en");
      expect(enFaq.mainEntity[0]?.name).toBe(enMessages.Marketing.faq.items.creditDef.q);
      expect(enFaq.mainEntity[0]?.acceptedAnswer.text).toBe(enMessages.Marketing.faq.items.creditDef.a);

      const frFaq = (PricingFaqJsonLd({ locale: "fr" }) as React.ReactElement<{
        data: { inLanguage: string; mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
      }>).props.data;
      expect(frFaq.inLanguage).toBe("fr");
      expect(frFaq.mainEntity[0]?.name).toBe(frMessages.Marketing.faq.items.creditDef.q);
      expect(frFaq.mainEntity[0]?.acceptedAnswer.text).toBe(frMessages.Marketing.faq.items.creditDef.a);
    });

    it("PricingFaqJsonLd respects billingEnabled toggle", () => {
      setSiteConfigForTesting({ billingEnabled: false });
      const offData = (PricingFaqJsonLd({ locale: "en" }) as React.ReactElement<{
        data: unknown;
      }>).props.data;
      const offStr = JSON.stringify(offData);
      expect(offStr).toContain(enMessages.Marketing.faq.items.cancel.aLaunchingSoon);
      expect(offStr).not.toContain(enMessages.Marketing.faq.items.cancel.a);

      setSiteConfigForTesting({ billingEnabled: true });
      const onData = (PricingFaqJsonLd({ locale: "en" }) as React.ReactElement<{
        data: unknown;
      }>).props.data;
      const onStr = JSON.stringify(onData);
      expect(onStr).toContain(enMessages.Marketing.faq.items.cancel.a);
    });

    it("PricingFaqJsonLd responds to NEXT_LOCALE environment fallback", () => {
      process.env.NEXT_LOCALE = "es";
      const esFaq = (PricingFaqJsonLd() as React.ReactElement<{
        data: { inLanguage: string; mainEntity: Array<{ name: string }> };
      }>).props.data;
      expect(esFaq.inLanguage).toBe("es");
      expect(esFaq.mainEntity[0]?.name).toBe(esMessages.Marketing.faq.items.creditDef.q);
    });
  });
});
