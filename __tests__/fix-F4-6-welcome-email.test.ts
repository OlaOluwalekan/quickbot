/**
 * @jest-environment node
 */
import { Resend } from "resend";
import { db } from "@/server/db/client";
import { getSiteConfig } from "@/server/config/site";
import { renderEmail } from "@/server/email/send";
import {
  sendWelcomeEmailOnce,
  welcomeOnUserCreated,
  welcomeOnUserUpdated,
} from "@/server/services/welcome";

jest.mock("resend");

const sendMock = jest.fn();

const IDS = {
  password: "user_welcome_test_password",
  oauth: "user_welcome_test_oauth",
  existing: "user_welcome_test_existing",
  es: "user_welcome_test_es",
  req: "user_welcome_test_request_locale",
};
const ALL_IDS = Object.values(IDS);

async function cleanup() {
  await db.userPreference.deleteMany({ where: { userId: { in: ALL_IDS } } });
  await db.user.deleteMany({ where: { id: { in: ALL_IDS } } });
}

function welcomeSends() {
  return sendMock.mock.calls.map(
    (c) => c[0] as { to: string[]; subject: string; html: string }
  );
}

describe("Step F4.6 — Welcome email", () => {
  const site = getSiteConfig();

  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "resend_mock_id_123" }, error: null });
    (Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: { send: sendMock },
    }));
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  describe("template", () => {
    it("greets by name, lists 3 points, links the app, help center and support address", async () => {
      const rendered = await renderEmail(
        "welcome",
        "ada@example.com",
        { name: "Ada Lovelace" },
        { locale: "en" }
      );

      expect(rendered.subject).toContain("Welcome to Klecx");
      expect(rendered.html).toContain("Hi Ada Lovelace,");
      expect(rendered.html).toContain("Create a workspace");
      expect(rendered.html).toContain("Highlight text to comment or ask");
      expect(rendered.html).toContain("Organize with projects");
      expect(rendered.html).toContain(`href="${site.appUrl}/workspaces"`);
      expect(rendered.html).toContain("Open Klecx");
      expect(rendered.html).toContain(`href="${site.appUrl}/help"`);
      expect(rendered.html).toContain(`href="mailto:${site.emails.support}"`);
      expect(rendered.html).not.toContain("%%");
      expect(rendered.text).toContain("1. Create a workspace");
      expect(rendered.text).toContain(`${site.appUrl}/help`);
      expect(rendered.text).toContain(site.emails.support);
    });

    it("uses the plain greeting without a name", async () => {
      const rendered = await renderEmail("welcome", "noname@example.com", {}, { locale: "en" });
      expect(rendered.html).toContain("Hi,");
      expect(rendered.html).not.toContain("undefined");
    });

    it("escapes the name", async () => {
      const rendered = await renderEmail(
        "welcome",
        "x@example.com",
        { name: "<b>Eve</b>" },
        { locale: "en" }
      );
      expect(rendered.html).not.toContain("<b>Eve</b>");
      expect(rendered.html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
    });

    it("is translated in Spanish and French", async () => {
      const es = await renderEmail("welcome", "c@example.com", { name: "Carlos" }, { locale: "es" });
      expect(es.subject).toContain("Bienvenido a Klecx");
      expect(es.html).toContain("Hola Carlos,");
      expect(es.html).toContain("Abrir Klecx");

      const fr = await renderEmail("welcome", "c@example.com", { name: "Claire" }, { locale: "fr" });
      expect(fr.subject).toContain("Bienvenue sur Klecx");
      expect(fr.html).toContain("Bonjour Claire,");
      expect(fr.html).toContain("Ouvrir Klecx");
    });
  });

  describe("sending once", () => {
    it("password sign-up: nothing until the email is verified, then exactly one", async () => {
      const created = await db.user.create({
        data: {
          id: IDS.password,
          email: "password_user@example.com",
          name: "Password User",
          emailVerified: false,
        },
      });

      await welcomeOnUserCreated(created);
      expect(sendMock).not.toHaveBeenCalled();
      expect((await sendWelcomeEmailOnce(IDS.password)).sent).toBe(false);
      expect(sendMock).not.toHaveBeenCalled();

      // Verification link clicked.
      const verified = await db.user.update({
        where: { id: IDS.password },
        data: { emailVerified: true },
      });
      await welcomeOnUserUpdated(verified);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(welcomeSends()[0]!.to).toEqual(["password_user@example.com"]);

      // Verifying again, or any later profile update: still one.
      const again = await db.user.update({
        where: { id: IDS.password },
        data: { emailVerified: true, name: "Renamed" },
      });
      await welcomeOnUserUpdated(again);
      await welcomeOnUserUpdated({ id: IDS.password, emailVerified: true });
      expect(sendMock).toHaveBeenCalledTimes(1);

      const row = await db.user.findUnique({ where: { id: IDS.password } });
      expect(row?.welcomeEmailSentAt).toBeInstanceOf(Date);
    });

    it("OAuth sign-up with a verified email: one email; linking another provider sends none", async () => {
      const created = await db.user.create({
        data: {
          id: IDS.oauth,
          email: "oauth_user@example.com",
          name: "OAuth User",
          emailVerified: true,
        },
      });

      await welcomeOnUserCreated(created);
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Linking a second provider updates the (already verified) user.
      const linked = await db.user.update({
        where: { id: IDS.oauth },
        data: { image: "https://example.com/a.png" },
      });
      await welcomeOnUserUpdated(linked);
      await welcomeOnUserCreated(created);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("concurrent calls send at most one email", async () => {
      await db.user.create({
        data: {
          id: IDS.password,
          email: "idempotent_user@example.com",
          name: "Idem",
          emailVerified: true,
        },
      });

      const results = await Promise.all([
        sendWelcomeEmailOnce(IDS.password),
        sendWelcomeEmailOnce(IDS.password),
        sendWelcomeEmailOnce(IDS.password),
      ]);

      expect(results.filter((r) => r.sent)).toHaveLength(1);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("existing users (welcome_email_sent_at already set by the migration) get nothing", async () => {
      const pastDate = new Date("2026-11-01T12:00:00Z");
      await db.user.create({
        data: {
          id: IDS.existing,
          email: "existing_user@example.com",
          name: "Existing",
          emailVerified: true,
          welcomeEmailSentAt: pastDate,
        },
      });

      expect((await sendWelcomeEmailOnce(IDS.existing)).sent).toBe(false);
      expect(sendMock).not.toHaveBeenCalled();
      const row = await db.user.findUnique({ where: { id: IDS.existing } });
      expect(row?.welcomeEmailSentAt).toEqual(pastDate);
    });

    it("a failed delivery is reported and does not throw", async () => {
      sendMock.mockResolvedValue({ data: null, error: { message: "boom" } });
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      await db.user.create({
        data: { id: IDS.oauth, email: "fail@example.com", name: "Fail", emailVerified: true },
      });

      await expect(sendWelcomeEmailOnce(IDS.oauth)).resolves.toEqual({ sent: false });
      errSpy.mockRestore();
    });
  });

  describe("locale", () => {
    it("uses the uiLocale preference first", async () => {
      await db.user.create({
        data: { id: IDS.es, email: "spanish_user@example.com", name: "Mateo", emailVerified: true },
      });
      await db.userPreference.create({ data: { userId: IDS.es, uiLocale: "es" } });

      // The request says French; the saved preference wins.
      await welcomeOnUserCreated(
        { id: IDS.es, emailVerified: true },
        { headers: new Headers({ cookie: "NEXT_LOCALE=fr" }) }
      );
      expect(welcomeSends()[0]!.subject).toContain("Bienvenido a Klecx");
    });

    it("falls back to the request locale (cookie or Accept-Language)", async () => {
      const user = await db.user.create({
        data: { id: IDS.req, email: "fr_user@example.com", name: "Claire", emailVerified: true },
      });

      await welcomeOnUserCreated(user, {
        headers: new Headers({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.5" }),
      });
      expect(welcomeSends()[0]!.subject).toContain("Bienvenue sur Klecx");
    });

    it("defaults to English without a preference or request", async () => {
      await db.user.create({
        data: { id: IDS.req, email: "en_user@example.com", name: "  ", emailVerified: true },
      });
      await sendWelcomeEmailOnce(IDS.req);
      expect(welcomeSends()[0]!.subject).toContain("Welcome to Klecx");
      // A blank name falls back to the plain greeting.
      expect(welcomeSends()[0]!.html).toContain("Hi,");
    });
  });
});
