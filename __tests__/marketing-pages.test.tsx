import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MarketingLandingPage from "@/app/(marketing)/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import FeaturesPage from "@/app/(marketing)/features/page";
import AboutPage from "@/app/(marketing)/about/page";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingPricingTable } from "@/components/marketing/pricing-table";
import { PLANS } from "@/server/billing/plans";
import enMessages from "@/messages/en.json";

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

// Mock next-intl translations and locale
jest.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, values?: Record<string, any>) => {
      let resolved: any;
      if (namespace) {
        resolved = getNestedValue(enMessages, `${namespace}.${key}`);
      }
      if (resolved === undefined) {
        resolved = getNestedValue(enMessages, key);
      }
      if (resolved === undefined) {
        resolved = getNestedValue(enMessages, `Common.${key}`);
      }
      if (resolved === undefined) {
        resolved = key;
      }
      if (typeof resolved === "string" && values) {
        Object.entries(values).forEach(([k, v]) => {
          resolved = resolved.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return resolved;
    };
  },
  useLocale: () => "en",
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock next-themes
jest.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: jest.fn(),
  }),
}));

describe("Marketing Pages & Components", () => {
  describe("MarketingHeader", () => {
    it("renders logo, navigation links, and auth CTAs", () => {
      render(<MarketingHeader />);

      expect(screen.getByText("Klecx")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "/features");
      expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
      expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
      expect(screen.getByRole("link", { name: /start free/i })).toHaveAttribute("href", "/auth/register");
    });
  });

  describe("MarketingFooter", () => {
    it("renders legal links, support email from site config, and mandatory AI model disclosure", () => {
      render(<MarketingFooter />);

      // Legal links
      expect(screen.getAllByRole("link", { name: "Terms of Service" })[0]).toHaveAttribute("href", "/terms");
      expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute("href", "/privacy");
      expect(screen.getAllByRole("link", { name: "Acceptable Use Policy" })[0]).toHaveAttribute("href", "/acceptable-use");
      expect(screen.getByRole("link", { name: "Cookie Policy" })).toHaveAttribute("href", "/cookies");

      // Support email from site config
      const supportLink = screen.getByRole("link", { name: "support@example.test" });
      expect(supportLink).toHaveAttribute("href", "mailto:support@example.test");

      // Required disclosure
      expect(
        screen.getByText(/Klecx is an independent interface built on third-party AI models \(currently Google Gemini\)/i)
      ).toBeInTheDocument();
    });
  });

  describe("PricingTable Component", () => {
    it("renders all 4 plans with exact pricing from server/billing/plans.ts", () => {
      render(<MarketingPricingTable />);

      expect(screen.getByText("Free")).toBeInTheDocument();
      expect(screen.getByText("Lite")).toBeInTheDocument();
      expect(screen.getByText("Standard")).toBeInTheDocument();
      expect(screen.getByText("Pro")).toBeInTheDocument();

      // Check monthly prices
      expect(screen.getByText(`$${PLANS.FREE.priceMonthly}`)).toBeInTheDocument();
      expect(screen.getByText(`$${PLANS.LITE.priceMonthly}`)).toBeInTheDocument();
      expect(screen.getByText(`$${PLANS.STANDARD.priceMonthly}`)).toBeInTheDocument();
      expect(screen.getByText(`$${PLANS.PRO.priceMonthly}`)).toBeInTheDocument();
    });

    it("switches to yearly prices when yearly toggle is clicked", () => {
      render(<MarketingPricingTable />);

      const yearlyBtn = screen.getByRole("button", { name: /yearly billing/i });
      fireEvent.click(yearlyBtn);

      // Verify yearly prices
      expect(screen.getByText(`$${PLANS.LITE.priceYearly}`)).toBeInTheDocument();
      expect(screen.getByText(`$${PLANS.STANDARD.priceYearly}`)).toBeInTheDocument();
      expect(screen.getByText(`$${PLANS.PRO.priceYearly}`)).toBeInTheDocument();
      expect(screen.getAllByText("/year").length).toBeGreaterThan(0);
    });

    it("displays honest credit metrics and no rollover notice", () => {
      render(<MarketingPricingTable />);

      expect(screen.getByText("100 Credits")).toBeInTheDocument();
      expect(screen.getByText("800 Credits")).toBeInTheDocument();
      expect(screen.getByText("1,800 Credits")).toBeInTheDocument();
      expect(screen.getByText("3,500 Credits")).toBeInTheDocument();

      expect(
        screen.getByText(/Monthly plan credits do not roll over to maintain transparent unit costs/i)
      ).toBeInTheDocument();
    });
  });

  describe("Landing Page (/)", () => {
    it("renders hero headline, feature rows, pricing teaser, FAQ, and CTA", () => {
      render(<MarketingLandingPage />);

      // Hero
      expect(
        screen.getByRole("heading", { level: 1, name: /think in workspaces, not threads/i })
      ).toBeInTheDocument();

      // Features
      expect(
        screen.getByText(/Workspaces and projects designed for real work/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Ask questions about any passage without thread derailment/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Versions and edits that preserve every attempt/i)
      ).toBeInTheDocument();

      // FAQ
      expect(screen.getByText("What is a credit and how does it work?")).toBeInTheDocument();

      // CTA
      expect(
        screen.getByRole("heading", { name: /ready to organize your ai thinking/i })
      ).toBeInTheDocument();
    });
  });

  describe("Pricing Page (/pricing)", () => {
    it("renders pricing page with plan comparison table", () => {
      render(<PricingPage />);

      expect(screen.getByRole("heading", { level: 1, name: /simple, honest pricing/i })).toBeInTheDocument();
      expect(screen.getByText("Detailed Plan Comparison")).toBeInTheDocument();
      expect(screen.getByText("Monthly Credits")).toBeInTheDocument();
      expect(screen.getByText("Daily Spend Cap")).toBeInTheDocument();
      expect(screen.getByText("Concurrent Generations")).toBeInTheDocument();
    });
  });

  describe("Features Page (/features)", () => {
    it("renders core capabilities and design principles", () => {
      render(<FeaturesPage />);

      expect(
        screen.getByRole("heading", { level: 1, name: /built for how knowledge work actually happens/i })
      ).toBeInTheDocument();
      expect(screen.getByText("Zero Destructive Overwrites")).toBeInTheDocument();
      expect(screen.getByText("Local Passage Reasoning")).toBeInTheDocument();
      expect(screen.getByText("Independent Architecture")).toBeInTheDocument();
    });
  });

  describe("About Page (/about)", () => {
    it("renders philosophy, third-party model disclosure, and support contact", () => {
      render(<AboutPage />);

      expect(screen.getByRole("heading", { level: 1, name: /why we built klecx/i })).toBeInTheDocument();
      expect(screen.getByText("The Thread Problem")).toBeInTheDocument();

      // Mandatory Architecture Disclosure
      expect(
        screen.getByText(/Klecx is an independent interface built on top of third-party AI models/i)
      ).toBeInTheDocument();

      // Support contact from site config
      expect(screen.getByText("support@example.test")).toBeInTheDocument();
    });
  });
});
