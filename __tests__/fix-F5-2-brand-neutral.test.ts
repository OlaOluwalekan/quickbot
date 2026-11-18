import fs from "node:fs";
import path from "node:path";

/**
 * Step F5.2 — Third-party brand neutrality test
 *
 * Verifies that no provider brand names (Gemini, Google, OpenAI, Anthropic, Claude, GPT)
 * appear in product copy across messages and help docs, ensuring Klecx presents itself
 * as an independent workspace built on third-party AI models.
 *
 * Explicit allow-list covers only:
 * - Standard OAuth provider button labels (e.g. "Google")
 * - Privacy sub-processor statutory disclosure (Legal.privacy.processors, F5.5)
 */
describe("Step F5.2 — Third-party brand neutrality", () => {
  const brandRegex = /gemini|google(?!\s+sign|\s+account)|openai|anthropic|claude|gpt/i;

  // Auth.google: the "Continue with Google" OAuth button label.
  // Legal.privacy.processors.*: the privacy policy's named sub-processor list (F5.5).
  const ALLOWED_MESSAGE_KEYS = new Set([
    "Auth.google",
  ]);
  const ALLOWED_PREFIXES = ["Legal.privacy.processors."];

  it("has no third-party brand names in messages/*.json (outside explicit allow-list)", () => {
    const messagesDir = path.resolve(process.cwd(), "messages");
    const violations: string[] = [];

    const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(messagesDir, file), "utf8")
      );

      function traverse(obj: Record<string, unknown>, prefix = "") {
        for (const [key, value] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === "object") {
            traverse(value as Record<string, unknown>, fullKey);
          } else if (typeof value === "string") {
            if (
              ALLOWED_MESSAGE_KEYS.has(fullKey) ||
              ALLOWED_PREFIXES.some((p) => fullKey.startsWith(p))
            ) {
              continue;
            }
            if (brandRegex.test(value)) {
              violations.push(`${file} -> ${fullKey}: "${value}"`);
            }
          }
        }
      }

      traverse(data);
    }

    expect(violations).toEqual([]);
  });

  it("has no third-party brand names in content/help/**", () => {
    const helpDir = path.resolve(process.cwd(), "content", "help");
    const violations: string[] = [];

    function walk(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
          const content = fs.readFileSync(fullPath, "utf8");
          const lines = content.split("\n");
          lines.forEach((line, index) => {
            if (brandRegex.test(line)) {
              const relPath = path.relative(process.cwd(), fullPath);
              violations.push(`${relPath}:${index + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }

    walk(helpDir);
    expect(violations).toEqual([]);
  });

  it("has no third-party brand names in email templates", () => {
    const dir = path.resolve(process.cwd(), "server", "email", "templates");
    const violations: string[] = [];
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const lines = fs.readFileSync(path.join(dir, name), "utf8").split("\n");
      lines.forEach((line, index) => {
        if (brandRegex.test(line)) {
          violations.push(`server/email/templates/${name}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("describes Klecx as an independent workspace built on third-party AI models", () => {
    const en = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "messages", "en.json"), "utf8")
    );

    expect(en.Marketing.aboutPage.disclosureText).toContain(
      "Klecx is an independent workspace built on third-party AI models."
    );
    expect(en.Marketing.aboutPage.disclosureText).toContain(
      "We don't own those models."
    );
    expect(en.Marketing.aboutPage.disclosureText).not.toContain("Gemini");
    expect(en.Marketing.aboutPage.disclosureText).not.toContain("Google");

    expect(en.Marketing.footer.trustDisclosure).toContain(
      "Klecx is an independent workspace built on third-party AI models."
    );
    expect(en.Marketing.footer.trustDisclosure).not.toContain("Gemini");
    expect(en.Marketing.footer.trustDisclosure).not.toContain("Google");
  });

  it("ensures status services use generic names and neutral descriptions", () => {
    const en = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "messages", "en.json"), "utf8")
    );

    const services = en.Status.services;
    expect(services.ai.name).toBe("AI generation");
    expect(services.auth.name).toBe("Sign-in & Accounts");
    expect(services.db.name).toBe("Database & Cache");
    expect(services.storage.name).toBe("File storage");
    expect(services.email.name).toBe("Email");

    for (const svc of Object.values(services)) {
      expect(brandRegex.test((svc as { desc: string }).desc)).toBe(false);
    }
  });
});
