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
import { Resend } from "resend";

jest.mock("resend");

describe("Step 1.7 — Transactional Email Module", () => {
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
    "payment-failed": {
      reason: "Card expired",
      retryUrl: "https://klecx.vyraxity.com/settings/billing",
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
  ];

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
            expect(rendered.html).toContain("Creem"); // Legal/postal Creem compliance
            expect(rendered.html).toContain("support@mail.klecx.vyraxity.com"); // Branded support email

            // 3. Verify plaintext version
            expect(rendered.text).toBeTruthy();
            expect(rendered.text).toContain("KLECX AI");
            expect(rendered.text).toContain("support@mail.klecx.vyraxity.com");
            expect(rendered.text).toContain("Creem");
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

    it("includes postal and Merchant of Record compliance line for Creem", async () => {
      const rendered = await renderEmail(
        "reset-password",
        "bob@example.com",
        sampleData["reset-password"],
        { locale: "en" }
      );

      expect(rendered.html).toContain("123 Innovation Way, Suite 400");
      expect(rendered.html).toContain("Merchant of Record services provided by Creem");
      expect(rendered.text).toContain("Merchant of Record services provided by Creem");
    });
  });

  describe("Email Masking & Security", () => {
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

      expect(result.success).toBe(false);
      expect(result.error).toBe("Domain not verified");
    });
  });
});
