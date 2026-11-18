/**
 * @jest-environment node
 *
 * F5.9 — a "beta" locale (registered in i18n/locales.ts, partly translated)
 * renders with English for what it lacks, and doesn't fail check:i18n.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createTranslator } from "use-intl/core";
import enMessages from "@/messages/en.json";

jest.mock("../i18n/locales", () => {
  const actual = jest.requireActual("../i18n/locales");
  const LOCALES = [
    ...actual.LOCALES,
    { code: "de", name: "German", nativeName: "Deutsch", hreflang: "de", ogLocale: "de_DE", dir: "ltr", status: "beta" },
  ];
  return { ...actual, LOCALES, LOCALE_CODES: LOCALES.map((l: { code: string }) => l.code) };
});

const ROOT = process.cwd();

function runCheck(deMessages: Record<string, unknown>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-beta-"));
  try {
    fs.cpSync(path.join(ROOT, "messages"), path.join(dir, "messages"), { recursive: true });
    fs.cpSync(path.join(ROOT, "content", "help"), path.join(dir, "content", "help"), { recursive: true });
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(
      path.join(ROOT, "scripts", "i18n-allow-identical.json"),
      path.join(dir, "scripts", "i18n-allow-identical.json")
    );
    fs.mkdirSync(path.join(dir, "i18n"));
    const registry = fs
      .readFileSync(path.join(ROOT, "i18n", "locales.ts"), "utf8")
      .replace(
        /\] as const;/,
        `  {\n    code: "de",\n    name: "German",\n    nativeName: "Deutsch",\n    hreflang: "de",\n    ogLocale: "de_DE",\n    dir: "ltr",\n    status: "beta",\n  },\n] as const;`
      );
    fs.writeFileSync(path.join(dir, "i18n", "locales.ts"), registry);
    fs.writeFileSync(path.join(dir, "messages", "de.json"), JSON.stringify(deMessages));
    return spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-i18n.mjs")], {
      cwd: ROOT,
      env: { ...process.env, I18N_CHECK_ROOT: dir },
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("F5.9 — beta locales", () => {
  it("a beta locale without its own messages renders in English", () => {
    // `messagesFor` reads the (mocked) registry; "de" has no bundle yet.
    const { messagesFor, resolveLocaleCode } = jest.requireActual("../i18n/messages");
    expect(resolveLocaleCode("de")).toBe("de");
    const t = createTranslator({ locale: "de", messages: messagesFor("de"), namespace: "Metadata.root" });
    expect(t("description")).toBe(enMessages.Metadata.root.description);
  });

  it("a partly translated beta locale keeps its own text and gets English for the rest", () => {
    const { deepMergeMessages } = jest.requireActual("../i18n/messages");
    const merged = deepMergeMessages(enMessages, { Metadata: { manifest: { shortName: "Klecx DE" } } });
    expect(merged.Metadata.manifest.shortName).toBe("Klecx DE");
    expect(merged.Metadata.manifest.name).toBe(enMessages.Metadata.manifest.name);
    expect(merged.Landing).toEqual(enMessages.Landing);
  });

  it("check:i18n passes with a partly translated beta locale", () => {
    const res = runCheck({ Common: { cancel: "Abbrechen" } });
    expect(res.stderr).not.toContain("❌");
    expect(res.status).toBe(0);
    // Its gaps are reported as a warning, not an error.
    expect(res.stderr).toMatch(/Beta locale 'de' lacks \d+ keys/);
  });

  it("check:i18n still checks what a beta locale does translate", () => {
    const placeholderKey = Object.entries(enMessages.Metadata as Record<string, unknown>).find(
      ([, v]) => typeof v === "string" && v.includes("{")
    );
    expect(placeholderKey).toBeDefined();
    const res = runCheck({ Metadata: { [placeholderKey![0]]: "kein Platzhalter" }, Nope: { x: "extra" } });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/ICU placeholder mismatch.*'de'/);
    expect(res.stderr).toMatch(/Extra key in 'de'/);
  });
});
