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
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ_KEYS, faqAnswerKey } from "@/lib/marketing/faq";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { getHelpSlugs } from "@/lib/help/articles";
import { PLANS } from "@/server/billing/plans";
import { BRAND } from "@/lib/brand/mark";

let requestLocale = "en";
jest.mock("server-only", () => ({}));
jest.mock("next-intl/server", () =>
  jest.requireActual("../test-utils/next-intl").serverIntlMock(() => requestLocale)
);

describe("Step F5.9 — SEO files localized", () => {
  beforeEach(() => {
    requestLocale = "en";
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
      expect(m.name).toBe(enMessages.Metadata.manifest.name);
      expect(m.short_name).toBe("Klecx");
      expect(m.display).toBe("standalone");
      expect(m.theme_color).toBe(BRAND.accentDark);
      expect(m.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(m.lang).toBe("en");
      expect(m.icons?.map((i) => i.src)).toEqual(["/icon/192", "/icon/512", "/apple-icon"]);
    });

    it("manifest.ts follows the request locale (fr)", async () => {
      requestLocale = "fr";
      const m = await manifest();
      expect(m.name).toBe(frMessages.Metadata.manifest.name);
      expect(m.description).toBe(frMessages.Metadata.manifest.description);
      expect(m.lang).toBe("fr");
    });

    it("one manifest: no static copies left in public/", () => {
      for (const f of ["manifest.webmanifest", "site.webmanifest"]) {
        expect(fs.existsSync(path.join(process.cwd(), "public", f))).toBe(false);
      }
    });

    it("sitemap.ts lists every page and help article, with real dates only", () => {
      const siteUrl = getSiteConfig().appUrl.replace(/\/$/, "");
      const sm = sitemap();
      const pricingEntry = sm.find((e) => e.url === `${siteUrl}/pricing`);
      expect(pricingEntry?.changeFrequency).toBe("weekly");
      expect(pricingEntry?.priority).toBe(0.9);
      expect(pricingEntry?.lastModified).toBeUndefined();
      expect(sm.find((e) => e.url === `${siteUrl}/terms`)?.lastModified).toBe(enMessages.Legal.updatedAt);
      const help = sm.filter((e) => e.url.includes("/help/"));
      expect(help.map((e) => e.url.split("/help/")[1]).sort()).toEqual(getHelpSlugs().sort());
      for (const e of help) expect(e.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("4. JSON-LD Localization & FAQ Parity", () => {
    const data = (el: React.ReactElement) => (el as React.ReactElement<{ data: any }>).props.data;

    it("OrganizationJsonLd includes inLanguage and site company info", () => {
      const d = data(OrganizationJsonLd({ locale: "en" }));
      expect(d["@type"]).toBe("Organization");
      expect(d.inLanguage).toBe("en");
      expect(d.name).toBe("Vyraxity");
      expect(d.logo).toMatch(/\/icon\/512$/);
    });

    it("WebSiteJsonLd describes the site in the page's language", () => {
      expect(data(WebSiteJsonLd({ locale: "en" })).description).toBe(enMessages.Metadata.root.description);
      const es = data(WebSiteJsonLd({ locale: "es" }));
      expect(es.inLanguage).toBe("es");
      expect(es.description).toBe(esMessages.Metadata.root.description);
    });

    it("SoftwareApplicationJsonLd names offers with the translated plan names", () => {
      const en = data(SoftwareApplicationJsonLd({ locale: "en" }));
      expect(en.offers.map((o: { name: string }) => o.name)).toEqual(
        Object.values(PLANS).map((p) => p.name.split(".").reduce((m: any, k) => m[k], enMessages))
      );
      const es = data(SoftwareApplicationJsonLd({ locale: "es" }));
      expect(es.inLanguage).toBe("es");
      expect(es.offers[0].name).toBe(esMessages.Plans.FREE.name);
    });

    it("SoftwareApplicationJsonLd offers only the Free plan while billing is off", () => {
      setSiteConfigForTesting({ billingEnabled: false });
      const d = data(SoftwareApplicationJsonLd({ locale: "en" }));
      expect(d.offers).toHaveLength(1);
      expect(d.offers[0].price).toBe(0);
    });

    it("PricingFaqJsonLd equals the visible FAQ, in each locale and billing state", () => {
      for (const billingEnabled of [true, false]) {
        setSiteConfigForTesting({ billingEnabled });
        for (const [locale, messages] of Object.entries({ en: enMessages, es: esMessages, fr: frMessages })) {
          const faq = messages.Marketing.faq as unknown as Record<string, any>;
          const d = data(PricingFaqJsonLd({ locale }));
          expect(d.inLanguage).toBe(locale);
          expect(d.mainEntity).toEqual(
            FAQ_KEYS.map((key) => ({
              "@type": "Question",
              name: faq.items[key].q,
              acceptedAnswer: {
                "@type": "Answer",
                text: faqAnswerKey(key, billingEnabled).split(".").reduce((m, k) => m[k], faq),
              },
            }))
          );
        }
      }
    });

    it("the visible FAQ renders exactly FAQ_KEYS (the list JSON-LD reads)", () => {
      const src = fs.readFileSync(path.join(process.cwd(), "components/marketing/faq.tsx"), "utf8");
      expect(src).toContain("FAQ_KEYS.map(");
      expect(src).toContain("faqAnswerKey(key, billingEnabled)");
    });

    it("JSON-LD can't be closed early by message text", () => {
      const el = JsonLd({ data: { x: "</script><script>alert(1)</script>" } }) as React.ReactElement<{
        dangerouslySetInnerHTML: { __html: string };
      }>;
      expect(el.props.dangerouslySetInnerHTML.__html).not.toContain("</script>");
    });
  });

  describe("5. Page metadata", () => {
    it("public pages carry the request locale in Open Graph, with alternates", async () => {
      requestLocale = "fr";
      const md = await publicPageMetadata({ path: "/pricing", title: "Tarifs", description: "d" });
      expect(md.title).toBe("Tarifs");
      expect(md.alternates).toEqual({ canonical: "/pricing" });
      expect(md.openGraph).toEqual(
        expect.objectContaining({ locale: "fr_FR", alternateLocale: ["en_US", "es_ES"], title: "Tarifs · Klecx" })
      );
    });

    it("every marketing page builds its metadata with publicPageMetadata (buildAlternates)", () => {
      const dir = path.join(process.cwd(), "app", "(marketing)");
      const pages: string[] = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name));
          else if (e.name === "page.tsx") pages.push(path.join(d, e.name));
        }
      };
      walk(dir);
      expect(pages.length).toBeGreaterThanOrEqual(12);
      for (const p of pages) {
        expect({ p, ok: fs.readFileSync(p, "utf8").includes("publicPageMetadata(") }).toEqual({ p, ok: true });
      }
    });

    it("page titles don't repeat the app name the root template adds", () => {
      const offenders = execSync(`grep -rlE '(·|\\|) Klecx\`' app || true`, { encoding: "utf8" }).trim();
      expect(offenders).toBe("");
      for (const m of [enMessages, esMessages, frMessages]) {
        expect(m.Help.metaTitle).not.toMatch(/Klecx/);
        expect(m.Help.articleTitleSuffix).not.toMatch(/Klecx/);
        expect(m.Status.title).not.toMatch(/Klecx/);
      }
    });
  });
});
