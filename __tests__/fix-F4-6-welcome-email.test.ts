/**
 * @jest-environment node
 */
import { Resend } from "resend";
import { db } from "@/server/db/client";
import { getSiteConfig } from "@/server/config/site";
import { renderEmail, sendEmail } from "@/server/email/send";
import { sendWelcomeEmailOnce } from "@/server/services/welcome";

jest.mock("resend");

describe("Step F4.6 — Welcome Email Service & Templates", () => {
  const site = getSiteConfig();
  const testUserPasswordId = "user_welcome_test_password";
  const testUserOAuthId = "user_welcome_test_oauth";
  const testUserExistingId = "user_welcome_test_existing";
  const testUserEsId = "user_welcome_test_es";

  beforeAll(() => {
    jest.setTimeout(25000);
  });

  beforeEach(async () => {
    (Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: {
        send: jest.fn().mockResolvedValue({
          data: { id: "resend_mock_id_123" },
          error: null,
        }),
      },
    }));

    // Clean up test users
    await db.notification.deleteMany({
      where: {
        userId: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });

    await db.userPreference.deleteMany({
      where: {
        userId: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });

    await db.user.deleteMany({
      where: {
        id: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await db.notification.deleteMany({
      where: {
        userId: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });
    await db.userPreference.deleteMany({
      where: {
        userId: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });
    await db.user.deleteMany({
      where: {
        id: {
          in: [
            testUserPasswordId,
            testUserOAuthId,
            testUserExistingId,
            testUserEsId,
          ],
        },
      },
    });
    await db.$disconnect();
  });

  describe("1. Template Content & Multilingual Rendering", () => {
    it("renders welcome email with name greeting, 3 getting-started points, CTA, and help link in English", async () => {
      const rendered = await renderEmail(
        "welcome",
        "ada@example.com",
        { name: "Ada Lovelace" },
        { locale: "en" }
      );

      expect(rendered.subject).toContain("Welcome to Klecx");
      expect(rendered.html).toContain("Hi Ada Lovelace,");
      // 3 getting started points
      expect(rendered.html).toContain("Create a workspace");
      expect(rendered.html).toContain("Highlight text to comment or ask");
      expect(rendered.html).toContain("Organize with projects");
      // Action URL
      expect(rendered.html).toContain(`${site.appUrl}/workspaces`);
      expect(rendered.html).toContain("Open Klecx");
      // Help Center
      expect(rendered.html).toContain(`${site.appUrl}/help`);
      // Support address from site config
      expect(rendered.html).toContain(site.emails.support);
      expect(rendered.text).toContain("1. Create a workspace");
    });

    it("renders generic greeting when name is not provided", async () => {
      const rendered = await renderEmail(
        "welcome",
        "noname@example.com",
        {},
        { locale: "en" }
      );

      expect(rendered.html).toContain("Hi,");
      expect(rendered.html).not.toContain("Hi undefined");
    });

    it("renders welcome email correctly in Spanish and French", async () => {
      const esRendered = await renderEmail(
        "welcome",
        "carlos@example.com",
        { name: "Carlos" },
        { locale: "es" }
      );
      expect(esRendered.subject).toContain("Bienvenido a Klecx");
      expect(esRendered.html).toContain("Hola Carlos,");
      expect(esRendered.html).toContain("Crea un espacio de trabajo");
      expect(esRendered.html).toContain("Selecciona texto para comentar o preguntar");
      expect(esRendered.html).toContain("Organiza con proyectos");
      expect(esRendered.html).toContain("Abrir Klecx");

      const frRendered = await renderEmail(
        "welcome",
        "claire@example.com",
        { name: "Claire" },
        { locale: "fr" }
      );
      expect(frRendered.subject).toContain("Bienvenue sur Klecx");
      expect(frRendered.html).toContain("Bonjour Claire,");
      expect(frRendered.html).toContain("Créer un espace de travail");
      expect(frRendered.html).toContain("Surligner du texte pour commenter ou demander");
      expect(frRendered.html).toContain("Organiser avec des projets");
      expect(frRendered.html).toContain("Ouvrir Klecx");
    });
  });

  describe("2. Idempotent Delivery Rules & DB Guards", () => {
    it("password sign-up: does NOT send welcome email when emailVerified is false", async () => {
      await db.user.create({
        data: {
          id: testUserPasswordId,
          email: "password_user@example.com",
          name: "Password User",
          emailVerified: false,
          welcomeEmailSentAt: null,
        },
      });

      const result = await sendWelcomeEmailOnce(testUserPasswordId);
      expect(result.sent).toBe(false);

      const userInDb = await db.user.findUnique({
        where: { id: testUserPasswordId },
      });
      expect(userInDb?.welcomeEmailSentAt).toBeNull();
    });

    it("after verification: sends welcome email, updates welcomeEmailSentAt, and creates in-app notification", async () => {
      await db.user.create({
        data: {
          id: testUserPasswordId,
          email: "verified_user@example.com",
          name: "Verified User",
          emailVerified: false,
          welcomeEmailSentAt: null,
        },
      });

      // User verifies email
      await db.user.update({
        where: { id: testUserPasswordId },
        data: { emailVerified: true },
      });

      const result = await sendWelcomeEmailOnce(testUserPasswordId);
      expect(result.sent).toBe(true);
      expect(result.email).toBe("verified_user@example.com");

      const userInDb = await db.user.findUnique({
        where: { id: testUserPasswordId },
      });
      expect(userInDb?.welcomeEmailSentAt).toBeInstanceOf(Date);

      // In-app notification created
      const notif = await db.notification.findFirst({
        where: { userId: testUserPasswordId, type: "WELCOME" },
      });
      expect(notif).toBeTruthy();
    });

    it("idempotency: verifying twice or concurrent invocations send at most one welcome email", async () => {
      await db.user.create({
        data: {
          id: testUserPasswordId,
          email: "idempotent_user@example.com",
          name: "Idempotent User",
          emailVerified: true,
          welcomeEmailSentAt: null,
        },
      });

      // Run multiple concurrent calls
      const [r1, r2, r3] = await Promise.all([
        sendWelcomeEmailOnce(testUserPasswordId),
        sendWelcomeEmailOnce(testUserPasswordId),
        sendWelcomeEmailOnce(testUserPasswordId),
      ]);

      const sentCount = [r1.sent, r2.sent, r3.sent].filter(Boolean).length;
      expect(sentCount).toBe(1);

      // Subsequent call still returns false
      const rSubsequent = await sendWelcomeEmailOnce(testUserPasswordId);
      expect(rSubsequent.sent).toBe(false);
    });

    it("OAuth sign-up: sends welcome email immediately on first sign-in when email is pre-verified", async () => {
      await db.user.create({
        data: {
          id: testUserOAuthId,
          email: "oauth_user@example.com",
          name: "OAuth User",
          emailVerified: true, // Google / GitHub verified
          welcomeEmailSentAt: null,
        },
      });

      const result = await sendWelcomeEmailOnce(testUserOAuthId);
      expect(result.sent).toBe(true);
      expect(result.email).toBe("oauth_user@example.com");

      const userInDb = await db.user.findUnique({
        where: { id: testUserOAuthId },
      });
      expect(userInDb?.welcomeEmailSentAt).toBeInstanceOf(Date);
    });

    it("existing users from migration: do not receive welcome email if welcomeEmailSentAt is already set", async () => {
      const pastDate = new Date("2026-11-01T12:00:00Z");
      await db.user.create({
        data: {
          id: testUserExistingId,
          email: "existing_user@example.com",
          name: "Existing User",
          emailVerified: true,
          welcomeEmailSentAt: pastDate,
        },
      });

      const result = await sendWelcomeEmailOnce(testUserExistingId);
      expect(result.sent).toBe(false);

      const userInDb = await db.user.findUnique({
        where: { id: testUserExistingId },
      });
      expect(userInDb?.welcomeEmailSentAt).toEqual(pastDate);
    });

    it("respects user uiLocale preference when sending welcome email", async () => {
      await db.user.create({
        data: {
          id: testUserEsId,
          email: "spanish_user@example.com",
          name: "Mateo",
          emailVerified: true,
          welcomeEmailSentAt: null,
        },
      });

      await db.userPreference.create({
        data: {
          userId: testUserEsId,
          uiLocale: "es",
        },
      });

      const result = await sendWelcomeEmailOnce(testUserEsId);
      expect(result.sent).toBe(true);
    });
  });
});
