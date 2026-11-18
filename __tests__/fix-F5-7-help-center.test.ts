/**
 * @jest-environment node
 *
 * F5.7 — help center: every product number comes from the plan and model
 * sources, billing-only text shows only when billing is live, and no article
 * describes features that don't exist.
 */
import fs from "node:fs";
import path from "node:path";
import {
  applyBillingSections,
  getArticles,
  parseFrontmatter,
  productTokens,
  replaceHelpTokens,
} from "@/lib/help/articles";
import { PLANS, getDailyCapForPlan } from "@/server/billing/plans";
import { GROUNDING_SURCHARGE_CREDITS, MODEL_CATALOG } from "@/lib/ai/model-catalog";
import {
  setSiteConfigForTesting,
  clearSiteConfigForTesting,
  getSiteConfig,
} from "@/server/config/site";

const HELP_DIR = path.join(process.cwd(), "content", "help");
const LOCALES = ["en", "es", "fr"] as const;

function rawArticles() {
  const out: { locale: string; file: string; body: string }[] = [];
  for (const locale of LOCALES) {
    for (const file of fs.readdirSync(path.join(HELP_DIR, locale))) {
      const raw = fs.readFileSync(path.join(HELP_DIR, locale, file), "utf8");
      out.push({ locale, file, body: parseFrontmatter(raw).content });
    }
  }
  return out;
}

function withBilling(enabled: boolean, fn: () => void) {
  setSiteConfigForTesting({ ...getSiteConfig(), billingEnabled: enabled });
  try {
    fn();
  } finally {
    clearSiteConfigForTesting();
  }
}

describe("F5.7 — help center", () => {
  it("every {{token}} and %%TOKEN%% in every article resolves, in both billing states", () => {
    for (const enabled of [true, false]) {
      withBilling(enabled, () => {
        for (const { locale, file, body } of rawArticles()) {
          const out = replaceHelpTokens(body, locale);
          const leftovers = out.match(/\{\{[^}]*\}\}|%%[A-Z_]+%%/g);
          expect({ file: `${locale}/${file}`, leftovers }).toEqual({
            file: `${locale}/${file}`,
            leftovers: null,
          });
        }
      });
    }
  });

  it("billing sections are balanced and identical in structure across locales", () => {
    const shape = (body: string) => body.match(/\{\{[#^/]billing\}\}/g) ?? [];
    const byFile = new Map<string, string[][]>();
    for (const { file, body } of rawArticles()) {
      const s = shape(body);
      // Each opening tag is followed by its closing tag.
      for (let i = 0; i < s.length; i += 2) {
        expect(["{{#billing}}", "{{^billing}}"]).toContain(s[i]);
        expect(s[i + 1]).toBe("{{/billing}}");
      }
      byFile.set(file, [...(byFile.get(file) ?? []), s]);
    }
    for (const [file, shapes] of byFile) {
      expect({ file, shapes }).toEqual({ file, shapes: [shapes[0], shapes[0], shapes[0]] });
    }
  });

  it("applyBillingSections keeps only the matching branch", () => {
    const raw = "a\n{{#billing}}\nON\n{{/billing}}\n{{^billing}}\nOFF\n{{/billing}}\nb\n";
    expect(applyBillingSections(raw, true)).toBe("a\nON\nb\n");
    expect(applyBillingSections(raw, false)).toBe("a\nOFF\nb\n");
  });

  it("product numbers come from PLANS and the model catalog, formatted per locale", () => {
    const en = productTokens("en");
    expect(en["{{credits.fast}}"]).toBe(String(MODEL_CATALOG["text-economy"].typicalCredits));
    expect(en["{{credits.standard}}"]).toBe(String(MODEL_CATALOG["text-standard"].typicalCredits));
    expect(en["{{credits.image}}"]).toBe(String(MODEL_CATALOG["image-standard"].typicalCredits));
    expect(en["{{credits.search}}"]).toBe(String(GROUNDING_SURCHARGE_CREDITS));
    expect(en["{{plan.STANDARD.credits}}"]).toBe(PLANS.STANDARD.credits.toLocaleString("en"));
    expect(en["{{plan.LITE.dailyCap}}"]).toBe(String(getDailyCapForPlan("LITE")));
    expect(en["{{plan.LITE.price}}"]).toBe("$4.99");
    // French groups thousands with a (narrow) no-break space and puts the symbol after.
    expect(productTokens("fr")["{{plan.STANDARD.credits}}"]).toMatch(/^1\s800$/u);
    expect(productTokens("fr")["{{plan.LITE.price}}"]).toMatch(/^4,99\s\$/u);
  });

  it("while billing is off, no article talks about prices, cancelling or refunds as if they exist", () => {
    withBilling(false, () => {
      for (const locale of LOCALES) {
        for (const a of getArticles(locale)) {
          expect({ slug: a.slug, text: a.content }).not.toEqual(
            expect.objectContaining({ text: expect.stringMatching(/\$\s?\d|\d\s?\$|\bper month\b|\bal mes\b|\bpar mois\b/) })
          );
        }
      }
    });
  });

  it("no article describes features that don't exist", () => {
    const forbidden = [
      /\.json\b|JSON export/i, // no JSON export
      /top-?up|credit pack/i,
      /snapshot/i, // no snapshot vs live sharing
      /pin (your )?favorites/i,
      /edit (your|previous) prompts?/i,
      /Max \$49|Pro \$19/,
      /Settings → Profile.*delet/i,
      /\b30 days.*trash|trash.*30 days/i,
    ];
    for (const { locale, file, body } of rawArticles().filter((a) => a.locale === "en")) {
      for (const re of forbidden) {
        expect({ file: `${locale}/${file}`, match: body.match(re)?.[0] ?? null }).toEqual({
          file: `${locale}/${file}`,
          match: null,
        });
      }
    }
  });

  it("the new articles exist in all locales: documents, voice-and-web-search", () => {
    for (const locale of LOCALES) {
      const slugs = getArticles(locale).map((a) => a.slug);
      expect(slugs).toEqual(expect.arrayContaining(["documents", "voice-and-web-search"]));
      expect(getArticles(locale).every((a) => !a.isFallback || locale === "en")).toBe(true);
    }
  });
});
