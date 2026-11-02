import fs from "fs";
import path from "path";

jest.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: jest.fn(),
  }),
}));

jest.mock("better-auth/client/plugins", () => ({
  inferAdditionalFields: () => ({}),
}));

jest.mock("next-intl/plugin", () => () => (config: any) => config);

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { metadata as appLayoutMetadata } from "@/app/(app)/layout";
import { metadata as settingsMetadata } from "@/app/settings/page";
import { PLANS, BILLING_FAQ } from "@/server/billing/plans";

describe("Step 4.2 — SEO and Security Headers", () => {
  describe("Favicon and Brand Icon Assets", () => {
    test("SVG favicon exists in app and public with the styled 'e' mark", () => {
      const appIconPath = path.join(process.cwd(), "app", "icon.svg");
      const publicIconPath = path.join(process.cwd(), "public", "icon.svg");

      expect(fs.existsSync(appIconPath)).toBe(true);
      expect(fs.existsSync(publicIconPath)).toBe(true);

      const svgContent = fs.readFileSync(appIconPath, "utf8");
      // Contains the square-spiral 'e' coordinates
      expect(svgContent).toContain("M 75 36 H 37 V 63.5 H 91.75 V 8.25 H 8.25 V 91.75 H 91.75");
    });

    test("favicon.ico and apple-icon exist", () => {
      expect(fs.existsSync(path.join(process.cwd(), "app", "favicon.ico"))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), "app", "apple-icon.png"))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), "public", "apple-touch-icon.png"))).toBe(true);
    });

    test("web manifest contains proper app details and brand icons", () => {
      const manifestPath = path.join(process.cwd(), "public", "manifest.webmanifest");
      expect(fs.existsSync(manifestPath)).toBe(true);

      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(m.name).toContain("Klecx");
      expect(m.short_name).toBe("Klecx");
      expect(m.display).toBe("standalone");
      expect(m.icons?.some((i: any) => i.src === "/icon.svg")).toBe(true);
      expect(m.icons?.some((i: any) => i.src === "/apple-touch-icon.png")).toBe(true);
    });
  });

  describe("Sitemap Generation (app/sitemap.ts)", () => {
    test("includes all public marketing and legal pages", async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls.some((u) => new URL(u).pathname === "/")).toBe(true);
      expect(urls.some((u) => u.endsWith("/pricing"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/features"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/about"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/help"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/support"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/status"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/terms"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/privacy"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/cookies"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/acceptable-use"))).toBe(true);
    });

    test("includes dynamic help article slugs", async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      expect(urls.some((u) => u.includes("/help/getting-started"))).toBe(true);
      expect(urls.some((u) => u.includes("/help/billing-and-cancellation"))).toBe(true);
    });

    test("NEVER includes private paths (workspaces, projects, settings, s, api)", async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);

      const forbiddenPrefixes = [
        "/workspaces",
        "/projects",
        "/settings",
        "/s/",
        "/api/",
        "/dev/",
      ];
      for (const url of urls) {
        const pathname = new URL(url).pathname;
        for (const f of forbiddenPrefixes) {
          const isForbidden =
            pathname === f ||
            pathname.startsWith(f.endsWith("/") ? f : `${f}/`);
          expect(isForbidden).toBe(false);
        }
      }
    });
  });

  describe("Robots Configuration (app/robots.ts)", () => {
    test("allows public root and points to sitemap.xml", () => {
      const r = robots();
      const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;

      expect(rules?.allow).toBe("/");
      expect(r.sitemap).toContain("/sitemap.xml");
    });

    test("disallows private and internal paths", () => {
      const r = robots();
      const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
      const disallow = Array.isArray(rules?.disallow)
        ? rules?.disallow
        : [rules?.disallow];

      expect(disallow).toContain("/api/");
      expect(disallow).toContain("/settings");
      expect(disallow).toContain("/workspaces");
      expect(disallow).toContain("/projects");
      expect(disallow).toContain("/s/");
    });
  });

  describe("Private Area Robots Metadata", () => {
    test("app layout explicitly disallows indexing and following", () => {
      expect(appLayoutMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    test("settings page explicitly disallows indexing and following", () => {
      expect(settingsMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });
  });

  describe("Security Headers (next.config.mjs)", () => {
    test("exports required security headers for all routes", async () => {
      // Import next.config.mjs directly
      const nextConfigModule = await import("../next.config.mjs");
      const nextConfig = nextConfigModule.default || nextConfigModule;

      expect(typeof nextConfig.headers).toBe("function");
      const headerRules = (await nextConfig.headers!()) as any[];

      const globalRule = headerRules.find((r: any) => r.source === "/:path*");
      expect(globalRule).toBeDefined();

      const headerMap = new Map<string, string>();
      for (const h of globalRule?.headers ?? []) {
        headerMap.set(h.key.toLowerCase(), h.value);
      }

      expect(headerMap.get("strict-transport-security")).toContain("max-age=63072000");
      expect(headerMap.get("x-content-type-options")).toBe("nosniff");
      expect(headerMap.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(headerMap.get("x-frame-options")).toBe("DENY");
      expect(headerMap.get("permissions-policy")).toContain("microphone=(self)");
      expect(headerMap.get("content-security-policy-report-only")).toBeDefined();
    });

    test("configures X-Robots-Tag: noindex, nofollow for private routes", async () => {
      const nextConfigModule = await import("../next.config.mjs");
      const nextConfig = nextConfigModule.default || nextConfigModule;

      const headerRules = (await nextConfig.headers!()) as any[];
      const privateRoutes = [
        "/workspaces/:path*",
        "/projects/:path*",
        "/settings/:path*",
        "/s/:path*",
        "/api/:path*",
      ];

      for (const route of privateRoutes) {
        const rule = headerRules.find((r: any) => r.source === route);
        expect(rule).toBeDefined();
        const robotsHeader = rule?.headers.find(
          (h: any) => h.key === "X-Robots-Tag"
        );
        expect(robotsHeader).toBeDefined();
        expect(robotsHeader?.value).toContain("noindex");
      }
    });
  });

  describe("JSON-LD Schemas", () => {
    test("plans source of truth maps to valid SoftwareApplication offers", () => {
      const plans = Object.values(PLANS);
      expect(plans.length).toBeGreaterThanOrEqual(4);

      for (const plan of plans) {
        expect(plan.name).toBeDefined();
        expect(typeof plan.priceMonthly).toBe("number");
        expect(plan.tagline).toBeDefined();
      }
    });

    test("FAQ items provide clear questions and answers", () => {
      expect(BILLING_FAQ.length).toBeGreaterThanOrEqual(5);
      for (const faq of BILLING_FAQ) {
        expect(faq.question.length).toBeGreaterThan(5);
        expect(faq.answer.length).toBeGreaterThan(10);
      }
    });
  });
});
