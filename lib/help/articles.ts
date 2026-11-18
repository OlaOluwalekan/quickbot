import fs from "fs";
import path from "path";
import { getSiteConfig } from "@/server/config/site";
import { PLANS, getDailyCapForPlan, type PlanKey } from "@/server/billing/plans";
import { GROUNDING_SURCHARGE_CREDITS, MODEL_CATALOG } from "@/lib/ai/model-catalog";
import { MAX_WORKSPACE_DOCUMENTS } from "@/lib/documents/workspace-document-types";
import {
  HelpArticle,
  HelpArticleMeta,
  HELP_CATEGORY_KEYS,
  HelpCategoryKey,
  foldText,
  matchesQuery,
  getCategoryKeys,
  toMeta,
} from "./shared";

export * from "./shared";

export const SUPPORTED_LOCALES = ["en", "fr", "es"] as const;
export type HelpLocale = (typeof SUPPORTED_LOCALES)[number];

export function toHelpLocale(locale?: string): HelpLocale {
  if (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale as HelpLocale;
  }
  return "en";
}

/**
 * Product numbers for help articles, read from the plan and model sources so
 * the articles can't drift from the app (F5.7). Written as `{{plan.LITE.credits}}`,
 * `{{credits.fast}}` etc.; numbers and prices are formatted for the article's locale.
 */
export function productTokens(locale: string = "en"): Record<string, string> {
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const usd = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(n);
  const tokens: Record<string, string> = {
    "{{credits.fast}}": num(MODEL_CATALOG["text-economy"].typicalCredits),
    "{{credits.standard}}": num(MODEL_CATALOG["text-standard"].typicalCredits),
    "{{credits.image}}": num(MODEL_CATALOG["image-standard"].typicalCredits),
    "{{credits.search}}": num(GROUNDING_SURCHARGE_CREDITS),
    "{{documents.max}}": num(MAX_WORKSPACE_DOCUMENTS),
  };
  for (const key of Object.keys(PLANS) as PlanKey[]) {
    const plan = PLANS[key];
    const p = `{{plan.${key}.`;
    tokens[`${p}price}}`] = usd(plan.priceMonthly);
    tokens[`${p}priceYearly}}`] = usd(plan.priceYearly);
    tokens[`${p}credits}}`] = num(plan.credits);
    tokens[`${p}dailyCap}}`] = num(getDailyCapForPlan(key));
    tokens[`${p}concurrent}}`] = num(plan.maxConcurrent);
    tokens[`${p}members}}`] = num(plan.limits.members);
    tokens[`${p}attachments}}`] = num(plan.limits.attachmentsPerWorkspace);
    tokens[`${p}maxFileMB}}`] = num(plan.limits.maxFileMB);
    tokens[`${p}searchesPerDay}}`] = num(plan.limits.searchesPerDay);
    tokens[`${p}voiceMinutesPerDay}}`] = num(Math.round(plan.limits.voiceSecondsPerDay / 60));
  }
  return tokens;
}

/**
 * Sections that depend on whether billing is live (rule 9): `{{#billing}}…{{/billing}}`
 * is kept only when BILLING_ENABLED is on, `{{^billing}}…{{/billing}}` only when it's off.
 */
export function applyBillingSections(raw: string, billingEnabled: boolean): string {
  return raw
    .replace(/\{\{#billing\}\}\r?\n?([\s\S]*?)\{\{\/billing\}\}\r?\n?/g, (_, body: string) =>
      billingEnabled ? body : ""
    )
    .replace(/\{\{\^billing\}\}\r?\n?([\s\S]*?)\{\{\/billing\}\}\r?\n?/g, (_, body: string) =>
      billingEnabled ? "" : body
    );
}

export function replaceHelpTokens(raw: string, locale: string = "en"): string {
  const site = getSiteConfig();
  raw = applyBillingSections(raw, site.billingEnabled);
  const replacements: Record<string, string> = {
    "%%SUPPORT_EMAIL%%": site.emails.support,
    "{{supportEmail}}": site.emails.support,
    "%%PRIVACY_EMAIL%%": site.emails.privacy,
    "{{privacyEmail}}": site.emails.privacy,
    "%%ABUSE_EMAIL%%": site.emails.abuse,
    "{{abuseEmail}}": site.emails.abuse,
    "%%LEGAL_EMAIL%%": site.emails.legal,
    "{{legalEmail}}": site.emails.legal,
    "%%BILLING_EMAIL%%": site.emails.billing,
    "{{billingEmail}}": site.emails.billing,
    "%%COMPANY_LEGAL_NAME%%": site.company.legalName,
    "{{companyLegalName}}": site.company.legalName,
    "%%COMPANY_ADDRESS%%": site.company.address,
    "{{companyAddress}}": site.company.address,
    ...productTokens(locale),
  };

  let out = raw;
  for (const [token, val] of Object.entries(replacements)) {
    if (out.includes(token)) {
      out = out.split(token).join(val);
    }
  }
  return out;
}

export function parseFrontmatter(rawContent: string): {
  data: Record<string, any>;
  content: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(rawContent);
  if (!match) {
    return { data: {}, content: rawContent };
  }

  const rawYaml = match[1] || "";
  const body = match[2] || "";
  const data: Record<string, any> = {};

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val: any = trimmed.slice(colonIdx + 1).trim();

    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    } else if (val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ""));
    } else if (!isNaN(Number(val)) && val !== "") {
      val = Number(val);
    }
    data[key] = val;
  }

  return { data, content: body };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function computeReadMinutes(content: string): number {
  const words = countWords(content);
  return Math.max(1, Math.round(words / 200));
}

function getBaseHelpDir(): string {
  return (
    process.env.HELP_CONTENT_DIR || path.join(process.cwd(), "content", "help")
  );
}

export function getHelpSlugs(): string[] {
  const enDir = path.join(getBaseHelpDir(), "en");
  if (!fs.existsSync(enDir)) {
    return [];
  }
  return fs
    .readdirSync(enDir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((f) => f.replace(/\.mdx?$/, ""));
}

export function getArticles(locale?: string): HelpArticle[] {
  try {
    const baseDir = getBaseHelpDir();
    const targetLocale = toHelpLocale(locale);
    const enDir = path.join(baseDir, "en");
    const targetDir = path.join(/*turbopackIgnore: true*/ baseDir, targetLocale);

    if (!fs.existsSync(enDir)) {
      return [];
    }

    const enFiles = fs
      .readdirSync(enDir)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

    const articles: HelpArticle[] = [];

    for (const enFile of enFiles) {
      const slug = enFile.replace(/\.mdx?$/, "");
      let filePath = path.join(enDir, enFile);
      let isFallback = targetLocale !== "en";

      if (
        targetLocale !== "en" &&
        fs.existsSync(/*turbopackIgnore: true*/ targetDir)
      ) {
        // Look for matching file in target locale (.mdx or .md)
        const targetPathMdx = path.join(targetDir, `${slug}.mdx`);
        const targetPathMd = path.join(targetDir, `${slug}.md`);

        if (fs.existsSync(targetPathMdx)) {
          filePath = targetPathMdx;
          isFallback = false;
        } else if (fs.existsSync(targetPathMd)) {
          filePath = targetPathMd;
          isFallback = false;
        }
      }

      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data, content: rawBody } = parseFrontmatter(fileContents);
      const content = replaceHelpTokens(rawBody, isFallback ? "en" : targetLocale);

      articles.push({
        slug,
        title: data.title || slug,
        categoryKey: data.category || "getting-started",
        description: data.description || "",
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        readMinutes: computeReadMinutes(content),
        isFallback,
        content,
      });
    }

    return articles;
  } catch (err) {
    console.error("Error reading help articles:", err);
    return [];
  }
}

export function getArticle(
  locale: string | undefined,
  slug: string
): HelpArticle | null {
  const articles = getArticles(locale);
  return articles.find((a) => a.slug === slug) ?? null;
}

// Backward-compatible exports
export const getAllArticles = (locale?: string) => getArticles(locale);
export const getArticleBySlug = (slug: string, locale?: string) =>
  getArticle(locale, slug);
export const getCategories = () => HELP_CATEGORY_KEYS;
export const searchArticles = (query: string, articles = getArticles()) => {
  return articles.filter((a) => matchesQuery(a, query));
};
