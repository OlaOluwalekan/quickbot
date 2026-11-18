/**
 * @jest-environment node
 *
 * F5.5 — legal pages: complete, accurate, read identity/contacts from env and
 * fully translated.
 */
import fs from "node:fs";
import path from "node:path";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { STORAGE_ITEMS } from "@/lib/legal/cookies";
import {
  legalValues,
  visibleSections,
  type LegalSection,
} from "@/components/legal/legal-document";

const LOCALES = { en, es, fr } as const;
const DOCS = ["terms", "privacy", "acceptableUse", "cookies"] as const;
type Legal = typeof en.Legal;

const legal = (l: keyof typeof LOCALES) => LOCALES[l].Legal as unknown as Legal;
const sections = (l: keyof typeof LOCALES, doc: (typeof DOCS)[number]) =>
  (legal(l)[doc] as unknown as { sections: LegalSection[] }).sections;

/** Every string under Legal, flattened. */
function strings(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (obj && typeof obj === "object") Object.values(obj).forEach((v) => strings(v, out));
  return out;
}

describe("F5.5 — legal pages", () => {
  it("every document has the same sections, in the same order, in en/es/fr", () => {
    for (const doc of DOCS) {
      const shape = (l: keyof typeof LOCALES) =>
        sections(l, doc).map((s) => [
          s.id,
          s.when ?? null,
          s.paragraphs?.length ?? 0,
          s.bullets?.length ?? 0,
          s.afterTable?.length ?? 0,
        ]);
      expect(shape("es")).toEqual(shape("en"));
      expect(shape("fr")).toEqual(shape("en"));
    }
  });

  it("only uses placeholders that come from site config, and hard-codes no email or URL", () => {
    const allowed = new Set(Object.keys(legalValues()).concat(["date"]));
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      for (const s of strings(legal(l))) {
        for (const m of s.matchAll(/\{(\w+)\}/g)) expect(allowed).toContain(m[1]);
        expect(s).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // emails come from {…Email}
        expect(s).not.toMatch(/https?:\/\//);
      }
    }
  });

  it("with billing off, Terms show the 'not yet available' section; with billing on, the subscription terms", () => {
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      const all = sections(l, "terms");
      const off = visibleSections(all, false).map(({ section }) => section);
      const on = visibleSections(all, true).map(({ section }) => section);
      expect(off.filter((s) => s.id === "subscriptions").map((s) => s.when)).toEqual(["billingOff"]);
      expect(on.filter((s) => s.id === "subscriptions").map((s) => s.when)).toEqual(["billingOn"]);
      // No duplicate anchors in either state.
      expect(new Set(off.map((s) => s.id)).size).toBe(off.length);
      expect(new Set(on.map((s) => s.id)).size).toBe(on.length);
    }
  });

  it("the Terms refund policy says the same as the FAQ (14 days / 20 % / 7 days / errors)", () => {
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      const terms = sections(l, "terms").find((s) => s.when === "billingOn")!.paragraphs!.join(" ");
      const faq = (LOCALES[l].Marketing.faq.items as { refund: { a: string } }).refund.a;
      for (const fact of [/\b14\b/, /\b20\s?%/, /\b7\b/]) {
        expect(terms).toMatch(fact);
        expect(faq).toMatch(fact);
      }
    }
  });

  it("states the decided facts: Nigerian law, Lagos courts, NDPA, NDPC, 18+, named processors", () => {
    const termsEn = strings(sections("en", "terms")).join(" ");
    const privacyEn = strings(legal("en").privacy).join(" ");
    expect(termsEn).toMatch(/Federal Republic of Nigeria/);
    expect(termsEn).toMatch(/Lagos State/);
    expect(termsEn).toMatch(/at least 18/);
    expect(privacyEn).toMatch(/Nigeria Data Protection Act 2023/);
    expect(privacyEn).toMatch(/NDPC/);
    expect(privacyEn).toMatch(/aged 18/);
    expect(privacyEn).toMatch(/screenshots/i);
    expect(privacyEn).toMatch(/90 days/);
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      const names = (legal(l).privacy as { processors: { name: string }[] }).processors.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(["Google (Gemini API)", "Cloudinary", "Resend", "Creem"]));
    }
  });

  it("removed claims stay removed", () => {
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      const text = strings(legal(l)).join(" ");
      expect(text).not.toMatch(/Delaware/);
      expect(text).not.toMatch(/keyword filter|filtrado de palabras|filtrage par mots/i);
      expect(text).not.toMatch(/24 (hours|horas|heures)/);
      expect(text).not.toMatch(/top-?up|credit packs?|paquetes de créditos|packs de crédits/i);
      expect(text).not.toMatch(/CCPA/);
    }
    // The English-only banner is replaced by a clause in every document.
    expect((legal("en") as Record<string, unknown>).englishNotice).toBeUndefined();
  });

  it("every cookie and storage key in the policy is still used in the code", () => {
    const roots = ["app", "components", "lib", "server", "node_modules/next-themes/dist"];
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "generated") walk(p);
        } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !p.includes(path.join("lib", "legal"))) {
          files.push(p);
        }
      }
    };
    roots.forEach((r) => walk(path.join(process.cwd(), r)));
    const code = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
    // Better Auth builds its cookie names from these parts at runtime.
    const builtByLibrary = new Set(["better-auth.session_token", "__Secure-better-auth.session_token"]);
    for (const item of STORAGE_ITEMS) {
      for (const name of item.names) {
        if (builtByLibrary.has(name)) continue;
        expect({ name, used: code.includes(`"${name}"`) || code.includes(`'${name}'`) }).toEqual({
          name,
          used: true,
        });
      }
    }
  });

  it("every cookie row has its purpose, duration, type and category translated", () => {
    for (const l of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
      const c = legal(l).cookies as unknown as Record<"purposes" | "durations" | "types" | "categories", Record<string, string>>;
      for (const item of STORAGE_ITEMS) {
        expect(typeof c.purposes[item.purpose]).toBe("string");
        expect(typeof c.durations[item.duration]).toBe("string");
        expect(typeof c.types[item.kind]).toBe("string");
        expect(typeof c.categories[item.category]).toBe("string");
      }
    }
  });
});
