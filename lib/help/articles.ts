import fs from "fs";
import path from "path";
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

export function parseFrontmatter(rawContent: string): { data: Record<string, any>; content: string } {
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
  return process.env.HELP_CONTENT_DIR || path.join(process.cwd(), "content", "help");
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

      if (targetLocale !== "en" && fs.existsSync(/*turbopackIgnore: true*/ targetDir)) {
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
      const { data, content } = parseFrontmatter(fileContents);

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

export function getArticle(locale: string | undefined, slug: string): HelpArticle | null {
  const articles = getArticles(locale);
  return articles.find((a) => a.slug === slug) ?? null;
}

// Backward-compatible exports
export const getAllArticles = (locale?: string) => getArticles(locale);
export const getArticleBySlug = (slug: string, locale?: string) => getArticle(locale, slug);
export const getCategories = () => HELP_CATEGORY_KEYS;
export const searchArticles = (query: string, articles = getArticles()) => {
  return articles.filter((a) => matchesQuery(a, query));
};
