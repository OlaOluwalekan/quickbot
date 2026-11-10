/**
 * @jest-environment node
 */
import {
  renderEmail,
  sendEmail,
  maskEmail,
  EmailTemplateName,
  EmailTemplateMap,
} from "@/server/email/send";
import {
  setSiteConfigForTesting,
  clearSiteConfigForTesting,
} from "@/server/config/site";
import { Resend } from "resend";

jest.mock("resend");

describe("Step 1.7 & F0.2 — Transactional Email Module", () => {
  const locales = ["en", "es", "fr"] as const;

  const sampleData: EmailTemplateMap = {
    "verify-email": {
      url: "https://klecx.vyraxity.com/auth/verify/verification?token=secret-token-123",
      name: "Alice",
    },
    "reset-password": {
      url: "https://klecx.vyraxity.com/auth/reset-password?token=reset-token-456",
      name: "Bob",
    },
    invitation: {
      inviterName: "Sarah Connor",
      teamOrProjectName: "Cyberdyne Research",
      inviteUrl: "https://klecx.vyraxity.com/invite/token-789",
      role: "Editor",
    },
    "new-sign-in": {
      time: "2026-10-28 09:30 UTC",
      device: "Chrome on macOS",
      ipAddress: "198.51.100.42",
      location: "San Francisco, CA",
    },
    "password-changed": {
      time: "2026-10-28 09:45 UTC",
    },
    "share-created": {
      title: "Quarterly AI Strategy Analysis",
      shareUrl: "https://klecx.vyraxity.com/workspaces/share/wksp-999",
    },
    "credits-low": {
      remainingCredits: 150,
      upgradeUrl: "https://klecx.vyraxity.com/settings/tokens",
    },
    "support-ack": {
      ticketId: "tk_12345678",
      topic: "Billing question",
      message: "How do I upgrade my plan?",
      name: "Dave",
    },
    "support-notification": {
      ticketId: "tk_12345678",
      senderEmail: "dave@example.com",
      topic: "Billing question",
      message: "How do I upgrade my plan?",
      diagnostics: '{"browser": "Chrome"}',
      userId: "user_abc123",
    },
    "payment-failed": {
      reason: "Card expired",
      retryUrl: "https://klecx.vyraxity.com/settings/billing",
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

  afterEach(() => {
    clearSiteConfigForTesting();
  });

  describe("Localization & Template Rendering", () => {
    for (const locale of locales) {
      describe(`Locale: ${locale}`, () => {
        for (const template of allTemplates) {
          it(`renders '${template}' in ${locale} without missing keys`, async () => {
            const data = sampleData[template];
            const rendered = await renderEmail(template, "user@example.com", data, {
              locale,
            });

            // 1. Verify subject is present, non-empty, and does not contain unresolved fallback
            expect(rendered.subject).toBeTruthy();
            expect(rendered.subject).not.toContain("Email.");
            expect(rendered.subject).not.toContain("{");

            // 2. Verify HTML shell
            expect(rendered.html).toBeTruthy();
            expect(rendered.html).toContain("<!DOCTYPE html>");
            expect(rendered.html).toContain("Klecx"); // Brand in header
            expect(rendered.html).toContain("role=\"presentation\""); // Table-based layout
            expect(rendered.html).toContain("Vyraxity"); // Company legal name from site config
            expect(rendered.html).toContain("Lagos, Nigeria"); // Company address from site config
            expect(rendered.html).toContain("support@example.test"); // Support email from site config
            expect(rendered.html).not.toContain("123 Innovation Way");

            // 3. Verify plaintext version
            expect(rendered.text).toBeTruthy();
            expect(rendered.text).toContain("KLECX AI");
            expect(rendered.text).toContain("support@example.test");
            expect(rendered.text).toContain("Vyraxity");
            expect(rendered.text).not.toContain("<table"); // Plain text should not contain HTML
          });
        }
      });
    }

    it("falls back gracefully to English when an unsupported locale is requested", async () => {
      const rendered = await renderEmail(
        "verify-email",
        "user@example.com",
        sampleData["verify-email"],
        { locale: "de" }
      );

      expect(rendered.subject).toBe("Verify your Klecx email address");
      expect(rendered.html).toContain("Verify Email");
    });
  });

  describe("Layout and Visual Requirements", () => {
    it("includes inline CSS styles and action button table in verification email", async () => {
      const rendered = await renderEmail(
        "verify-email",
        "alice@example.com",
        sampleData["verify-email"],
        { locale: "en" }
      );

      expect(rendered.html).toContain("background-color: #4f46e5;");
      expect(rendered.html).toContain("https://klecx.vyraxity.com/auth/verify/verification?token=secret-token-123");
      expect(rendered.text).toContain("https://klecx.vyraxity.com/auth/verify/verification?token=secret-token-123");
    });

    it("shows Merchant of Record compliance line for Creem only when billingEnabled is true", async () => {
      const disabledRendered = await renderEmail(
        "reset-password",
        "bob@example.com",
        sampleData["reset-password"],
        { locale: "en" }
      );
      expect(disabledRendered.html).not.toContain("Merchant of Record services provided by Creem");

      setSiteConfigForTesting({ billingEnabled: true });
      const enabledRendered = await renderEmail(
        "reset-password",
        "bob@example.com",
        sampleData["reset-password"],
        { locale: "en" }
      );
      expect(enabledRendered.html).toContain("Klecx is a product of Vyraxity · Lagos, Nigeria");
      expect(enabledRendered.html).toContain("Merchant of Record services provided by Creem");
      expect(enabledRendered.text).toContain("Merchant of Record services provided by Creem");
    });
  });

  describe("Email Masking & Security", () => {
    it("escapes user-controlled names in the HTML but keeps the plain text as typed", async () => {
      const evil = '<img src=x onerror="alert(1)">';
      const cases = [
        renderEmail("invitation", "u@example.com", {
          ...sampleData.invitation,
          inviterName: evil,
          teamOrProjectName: evil,
        }),
        renderEmail("share-created", "u@example.com", { ...sampleData["share-created"], title: evil }),
        renderEmail("ownership-transfer-requested", "u@example.com", {
          ...sampleData["ownership-transfer-requested"],
          fromUserName: evil,
          resourceName: evil,
        }),
        renderEmail("member-suspended", "u@example.com", { resourceName: evil }),
      ];
      for (const rendered of await Promise.all(cases)) {
        expect(rendered.html).not.toContain("<img");
        expect(rendered.html).toContain("&lt;img");
        expect(rendered.text).toContain(evil);
      }
    });

    it("masks email addresses correctly in logs without leaking full identity", () => {
      expect(maskEmail("user@example.com")).toBe("u***r@example.com");
      expect(maskEmail("a@example.com")).toBe("a*@example.com");
      expect(maskEmail("john.doe@company.org")).toBe("j***e@company.org");
      expect(maskEmail("invalid-email")).toBe("***");
    });
  });

  describe("Email Dispatcher (sendEmail)", () => {
    let mockSend: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      mockSend = jest.fn().mockResolvedValue({
        data: { id: "resend_msg_123" },
        error: null,
      });
      (Resend as unknown as jest.Mock).mockImplementation(() => ({
        emails: { send: mockSend },
      }));
    });

    it("sends email via Resend and returns message id", async () => {
      const result = await sendEmail(
        "verify-email",
        "recipient@example.com",
        sampleData["verify-email"],
        { locale: "en" }
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });

    it("handles Resend API error gracefully without throwing uncaught exceptions", async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: { message: "Domain not verified" },
      });

      const result = await sendEmail(
        "reset-password",
        "user@example.com",
        sampleData["reset-password"]
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Domain not verified");
    });

    it("handles network rejection from Resend gracefully", async () => {
      mockSend.mockRejectedValueOnce(new Error("Connection reset"));

      const result = await sendEmail(
        "reset-password",
        "user@example.com",
        sampleData["reset-password"]
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection reset");
    });
  });
});
