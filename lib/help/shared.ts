export interface HelpArticleMeta {
  slug: string;
  title: string;
  categoryKey: string;
  description: string;
  keywords: string[];
  readMinutes: number;
  isFallback: boolean;
}

export interface HelpArticle extends HelpArticleMeta {
  content: string;
}

export const HELP_CATEGORY_KEYS = [
  "getting-started",
  "features-workflows",
  "billing-account",
  "collaboration-sharing",
  "troubleshooting",
] as const;

export type HelpCategoryKey = (typeof HELP_CATEGORY_KEYS)[number];

/** Lower-cases and strips accents so "creditos" matches "créditos". */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesQuery(
  article: HelpArticleMeta,
  query: string,
  categoryLabel?: string
): boolean {
  const q = foldText(query);
  if (!q) return true;
  if (foldText(article.title).includes(q)) return true;
  if (foldText(article.description).includes(q)) return true;
  if (categoryLabel && foldText(categoryLabel).includes(q)) return true;
  return article.keywords.some((k) => foldText(k).includes(q));
}

export function getCategoryKeys(): readonly string[] {
  return HELP_CATEGORY_KEYS;
}

export function toMeta(article: HelpArticle): HelpArticleMeta {
  const { content: _content, ...meta } = article;
  return meta;
}
