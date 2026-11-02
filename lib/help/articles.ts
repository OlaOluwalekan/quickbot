import fs from "fs";
import path from "path";

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  description: string;
  readTime: string;
  keywords: string[];
  content: string;
}

const HELP_DIR = path.join(process.cwd(), "content", "help");

function parseFrontmatter(rawContent: string): { data: Record<string, any>; content: string } {
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
    } else if (val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ""));
    }
    data[key] = val;
  }

  return { data, content: body };
}

export function getAllArticles(): HelpArticle[] {
  try {
    if (!fs.existsSync(HELP_DIR)) {
      return [];
    }
    const filenames = fs.readdirSync(HELP_DIR).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
    const articles: HelpArticle[] = [];

    for (const file of filenames) {
      const fullPath = path.join(HELP_DIR, file);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data, content } = parseFrontmatter(fileContents);
      const slug: string = (data.slug as string) || file.replace(/\.mdx?$/, "");

      articles.push({
        slug,
        title: data.title || slug,
        category: data.category || "General",
        description: data.description || "",
        readTime: data.readTime || "2 min read",
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        content,
      });
    }

    return articles;
  } catch (err) {
    console.error("Error reading help articles:", err);
    return [];
  }
}

export function getArticleBySlug(slug: string): HelpArticle | null {
  const articles = getAllArticles();
  return articles.find((a) => a.slug === slug) ?? null;
}

export function getCategories(): string[] {
  const articles = getAllArticles();
  const set = new Set<string>();
  articles.forEach((a) => set.add(a.category));
  return Array.from(set);
}

export function searchArticles(query: string, articles = getAllArticles()): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;

  return articles.filter((a) => {
    return (
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.toLowerCase().includes(q)) ||
      a.category.toLowerCase().includes(q)
    );
  });
}
