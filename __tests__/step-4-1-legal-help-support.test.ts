/**
 * @jest-environment node
 */
import { getAllArticles, getArticleBySlug, searchArticles, getCategories } from "@/lib/help/articles";
import { createSupportTicket } from "@/server/services/support";
import { db } from "@/server/db/client";
import { publicRoutes, authRoutes } from "@/utils/routes";

jest.mock("resend");

describe("Step 4.1 — Legal, Help Center, Support and Password-Recovery", () => {
  describe("Routes & Navigation Integrity", () => {
    it("includes all public legal, marketing, help, support, and status routes", () => {
      expect(publicRoutes).toContain("/privacy");
      expect(publicRoutes).toContain("/terms");
      expect(publicRoutes).toContain("/acceptable-use");
      expect(publicRoutes).toContain("/cookies");
      expect(publicRoutes).toContain("/help");
      expect(publicRoutes).toContain("/support");
      expect(publicRoutes).toContain("/status");
    });

    it("includes all password recovery and verification auth routes", () => {
      expect(authRoutes).toContain("/auth/forgot-password");
      expect(authRoutes).toContain("/auth/reset-password");
      expect(authRoutes).toContain("/auth/verify-email");
      expect(authRoutes).toContain("/forgot-password");
      expect(authRoutes).toContain("/reset-password");
      expect(authRoutes).toContain("/verify-email");
    });
  });

  describe("Help Center Articles & Search Engine", () => {
    it("loads all 12 specified static MDX articles", () => {
      const articles = getAllArticles();
      expect(articles.length).toBeGreaterThanOrEqual(12);

      const requiredSlugs = [
        "getting-started",
        "workspaces-vs-projects",
        "credits-and-plans",
        "regenerate-vs-edit",
        "highlight-and-ask",
        "sharing",
        "collaboration-roles",
        "exporting",
        "language-settings",
        "account-and-security",
        "billing-and-cancellation",
        "troubleshooting",
      ];

      for (const slug of requiredSlugs) {
        const found = getArticleBySlug(slug);
        expect(found).not.toBeNull();
        expect(found?.title).toBeTruthy();
        expect(found?.content).toBeTruthy();
        expect(found?.readTime).toBeTruthy();
        expect(found?.category).toBeTruthy();
      }
    });

    it("filters and searches articles by query keyword", () => {
      const results = searchArticles("credits");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((a) => a.slug === "credits-and-plans")).toBe(true);
    });

    it("retrieves distinct categories", () => {
      const categories = getCategories();
      expect(categories).toContain("Getting Started");
      expect(categories).toContain("Billing & Account");
      expect(categories).toContain("Features & Workflows");
    });
  });

  describe("Support Ticket Service", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("detects honeypot bots and returns mock success without creating a record", async () => {
      const createSpy = jest.spyOn(db.supportTicket, "create");

      const result = await createSupportTicket(null, {
        name: "Bot User",
        email: "bot@spammer.org",
        topic: "spam",
        message: "buy cheap sunglasses now!",
        website: "https://spamlink.com",
      });

      expect(result.success).toBe(true);
      expect(result.ticketId).toMatch(/^tk_/);
      expect(createSpy).not.toHaveBeenCalled();
      createSpy.mockRestore();
    });

    it("creates a support ticket and strips control characters from inputs", async () => {
      const mockTicket = {
        id: "ticket-uuid-1234",
        userId: null,
        email: "user@example.com",
        topic: "Billing Question",
        message: "Hello,\nI need help with my invoice.",
        diagnostics: { appVersion: "0.1.0" },
        status: "OPEN" as const,
        createdAt: new Date(),
      };

      const createSpy = jest.spyOn(db.supportTicket, "create").mockResolvedValue(mockTicket as any);

      const result = await createSupportTicket(null, {
        name: "Test\x00 User\x07",
        email: "user@example.com",
        topic: "Billing\x1B Question",
        message: "Hello,\nI need help with my invoice.",
        diagnostics: { appVersion: "0.1.0" },
      });

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe("ticket-uuid-1234");
      expect(createSpy).toHaveBeenCalledWith({
        data: {
          userId: null,
          email: "user@example.com",
          topic: "Billing Question",
          message: "Hello,\nI need help with my invoice.",
          diagnostics: { appVersion: "0.1.0" },
        },
      });

      createSpy.mockRestore();
    });
  });
});
