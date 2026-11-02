/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import os from "os";
import {
  getArticles,
  getArticle,
  getHelpSlugs,
  toHelpLocale,
  parseFrontmatter,
} from "@/lib/help/articles";
import {
  foldText,
  matchesQuery,
  toMeta,
  HELP_CATEGORY_KEYS,
  HelpArticle,
} from "@/lib/help/shared";

describe("Help Center Loader & Shared Utilities", () => {
  const originalEnvHelpDir = process.env.HELP_CONTENT_DIR;
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "help-test-"));
    process.env.HELP_CONTENT_DIR = tempDir;

    // Create en and fr directories
    const enDir = path.join(tempDir, "en");
    const frDir = path.join(tempDir, "fr");
    fs.mkdirSync(enDir, { recursive: true });
    fs.mkdirSync(frDir, { recursive: true });

    // en/article-one.mdx (translated in fr)
    fs.writeFileSync(
      path.join(enDir, "article-one.mdx"),
      `---
title: "Article One"
category: "getting-started"
description: "Description in English"
keywords: ["one", "guide"]
version: 1
---

# Article One

` + "word ".repeat(400),
      "utf8"
    );

    // fr/article-one.mdx
    fs.writeFileSync(
      path.join(frDir, "article-one.mdx"),
      `---
title: "Article Un"
category: "getting-started"
description: "Description en français"
keywords: ["un", "guide"]
sourceVersion: 1
---

# Article Un

` + "mot ".repeat(400),
      "utf8"
    );

    // en/article-two.mdx (NOT translated in fr -> fallback test)
    fs.writeFileSync(
      path.join(enDir, "article-two.mdx"),
      `---
title: "Article Two"
category: "troubleshooting"
description: "Second description in English"
keywords: ["two", "debug"]
version: 1
---

# Article Two

English only content.
`,
      "utf8"
    );
  });

  afterAll(() => {
    if (originalEnvHelpDir !== undefined) {
      process.env.HELP_CONTENT_DIR = originalEnvHelpDir;
    } else {
      delete process.env.HELP_CONTENT_DIR;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("parseFrontmatter", () => {
    it("correctly parses frontmatter and separates body", () => {
      const raw = `---
title: "Sample"
category: "getting-started"
keywords: ["a", "b"]
version: 1
---

Body content goes here.`;
      const parsed = parseFrontmatter(raw);
      expect(parsed.data.title).toBe("Sample");
      expect(parsed.data.category).toBe("getting-started");
      expect(parsed.data.keywords).toEqual(["a", "b"]);
      expect(parsed.data.version).toBe(1);
      expect(parsed.content.trim()).toBe("Body content goes here.");
    });
  });

  describe("toHelpLocale", () => {
    it("returns supported locales or falls back to en", () => {
      expect(toHelpLocale("en")).toBe("en");
      expect(toHelpLocale("fr")).toBe("fr");
      expect(toHelpLocale("es")).toBe("es");
      expect(toHelpLocale("de")).toBe("en");
      expect(toHelpLocale(undefined)).toBe("en");
      expect(toHelpLocale("")).toBe("en");
    });
  });

  describe("getHelpSlugs", () => {
    it("returns slugs based on the English source directory", () => {
      const slugs = getHelpSlugs();
      expect(slugs).toContain("article-one");
      expect(slugs).toContain("article-two");
      expect(slugs.length).toBe(2);
    });
  });

  describe("getArticles & fallback resolution", () => {
    it("loads English articles with readMinutes calculation", () => {
      const articles = getArticles("en");
      expect(articles.length).toBe(2);

      const one = articles.find((a) => a.slug === "article-one");
      expect(one).toBeDefined();
      expect(one?.title).toBe("Article One");
      expect(one?.isFallback).toBe(false);
      expect(one?.readMinutes).toBe(2); // ~400 words / 200 = 2
    });

    it("loads translated article when present and falls back to English when missing", () => {
      const frArticles = getArticles("fr");
      expect(frArticles.length).toBe(2);

      const one = frArticles.find((a) => a.slug === "article-one");
      expect(one).toBeDefined();
      expect(one?.title).toBe("Article Un");
      expect(one?.isFallback).toBe(false);

      const two = frArticles.find((a) => a.slug === "article-two");
      expect(two).toBeDefined();
      expect(two?.title).toBe("Article Two"); // Fallback from English!
      expect(two?.isFallback).toBe(true);
    });

    it("retrieves a single article via getArticle", () => {
      const article = getArticle("fr", "article-one");
      expect(article?.title).toBe("Article Un");

      const missing = getArticle("fr", "non-existent");
      expect(missing).toBeNull();
    });
  });

  describe("foldText & matchesQuery", () => {
    it("strips accents and converts to lower case", () => {
      expect(foldText("Créditos")).toBe("creditos");
      expect(foldText("Édition")).toBe("edition");
      expect(foldText("  HÉLÈNE  ")).toBe("helene");
    });

    it("performs accent-insensitive searches", () => {
      const article: HelpArticle = {
        slug: "creditos-planes",
        title: "Créditos y Planes",
        categoryKey: "billing-account",
        description: "Gestión de facturación.",
        keywords: ["suscripción", "monedas"],
        readMinutes: 3,
        isFallback: false,
        content: "...",
      };

      expect(matchesQuery(article, "creditos")).toBe(true);
      expect(matchesQuery(article, "créditos")).toBe(true);
      expect(matchesQuery(article, "suscripcion")).toBe(true);
      expect(matchesQuery(article, "facturacion")).toBe(true);
      expect(matchesQuery(article, "Billing", "Billing & Account")).toBe(true);
      expect(matchesQuery(article, "completely-unrelated")).toBe(false);
    });
  });

  describe("toMeta", () => {
    it("strips content from article object", () => {
      const article: HelpArticle = {
        slug: "test-slug",
        title: "Test",
        categoryKey: "getting-started",
        description: "Test desc",
        keywords: ["test"],
        readMinutes: 1,
        isFallback: false,
        content: "Huge body content that shouldn't be sent to client",
      };

      const meta = toMeta(article);
      expect("content" in meta).toBe(false);
      expect(meta.slug).toBe("test-slug");
      expect(meta.title).toBe("Test");
      expect(meta.readMinutes).toBe(1);
    });
  });

  describe("HELP_CATEGORY_KEYS", () => {
    it("defines the 5 core categories", () => {
      expect(HELP_CATEGORY_KEYS).toEqual([
        "getting-started",
        "features-workflows",
        "billing-account",
        "collaboration-sharing",
        "troubleshooting",
      ]);
    });
  });
});
