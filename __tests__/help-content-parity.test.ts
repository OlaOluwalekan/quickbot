/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import { parseFrontmatter } from "@/lib/help/articles";

describe("Help Content Parity & Internationalization", () => {
  const contentDir = path.join(process.cwd(), "content", "help");
  const enDir = path.join(contentDir, "en");
  const frDir = path.join(contentDir, "fr");
  const esDir = path.join(contentDir, "es");

  const enFiles = fs
    .readdirSync(enDir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  it("has exactly 12 source English articles", () => {
    expect(enFiles.length).toBe(12);
  });

  it("has matching files in French and Spanish for all English articles", () => {
    const frFiles = fs.readdirSync(frDir);
    const esFiles = fs.readdirSync(esDir);

    for (const file of enFiles) {
      expect(frFiles).toContain(file);
      expect(esFiles).toContain(file);
    }
  });

  it("contains no unparsed <kbd> tags across all help files", () => {
    for (const lang of ["en", "fr", "es"]) {
      const dir = path.join(contentDir, lang);
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), "utf8");
        expect(content).not.toMatch(/<kbd>/i);
        expect(content).not.toMatch(/<\/kbd>/i);
      }
    }
  });

  describe.each(enFiles)("Article Parity: %s", (file) => {
    const enRaw = fs.readFileSync(path.join(enDir, file), "utf8");
    const frRaw = fs.readFileSync(path.join(frDir, file), "utf8");
    const esRaw = fs.readFileSync(path.join(esDir, file), "utf8");

    const enParsed = parseFrontmatter(enRaw);
    const frParsed = parseFrontmatter(frRaw);
    const esParsed = parseFrontmatter(esRaw);

    it("has valid frontmatter schema in all languages", () => {
      // English
      expect(enParsed.data.title).toBeTruthy();
      expect(enParsed.data.category).toBeTruthy();
      expect(enParsed.data.description).toBeTruthy();
      expect(Array.isArray(enParsed.data.keywords)).toBe(true);
      expect(enParsed.data.keywords.length).toBeGreaterThan(0);
      expect(typeof enParsed.data.version).toBe("number");

      // French
      expect(frParsed.data.title).toBeTruthy();
      expect(frParsed.data.category).toBe(enParsed.data.category);
      expect(frParsed.data.description).toBeTruthy();
      expect(Array.isArray(frParsed.data.keywords)).toBe(true);
      expect(frParsed.data.keywords.length).toBeGreaterThan(0);
      expect(frParsed.data.sourceVersion).toBe(enParsed.data.version);

      // Spanish
      expect(esParsed.data.title).toBeTruthy();
      expect(esParsed.data.category).toBe(enParsed.data.category);
      expect(esParsed.data.description).toBeTruthy();
      expect(Array.isArray(esParsed.data.keywords)).toBe(true);
      expect(esParsed.data.keywords.length).toBeGreaterThan(0);
      expect(esParsed.data.sourceVersion).toBe(enParsed.data.version);
    });

    it("preserves heading structure across translations", () => {
      const extractHeadingLevels = (text: string) => {
        const matches = text.match(/^#{1,6}\s+/gm) || [];
        return matches.map((m) => m.trim());
      };

      const enHeadings = extractHeadingLevels(enParsed.content);
      const frHeadings = extractHeadingLevels(frParsed.content);
      const esHeadings = extractHeadingLevels(esParsed.content);

      expect(frHeadings).toEqual(enHeadings);
      expect(esHeadings).toEqual(enHeadings);
    });

    it("preserves code fence count across translations", () => {
      const countFences = (text: string) => (text.match(/^```/gm) || []).length;

      expect(countFences(frParsed.content)).toBe(countFences(enParsed.content));
      expect(countFences(esParsed.content)).toBe(countFences(enParsed.content));
    });

    it("preserves internal link targets across translations", () => {
      const extractInternalLinks = (text: string) => {
        const regex = /\[.*?\]\((\/[^)\s]+)\)/g;
        const links: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          if (m[1]) links.push(m[1]);
        }
        return links;
      };

      const enLinks = extractInternalLinks(enParsed.content);
      const frLinks = extractInternalLinks(frParsed.content);
      const esLinks = extractInternalLinks(esParsed.content);

      for (const link of enLinks) {
        expect(frLinks).toContain(link);
        expect(esLinks).toContain(link);
      }
    });
  });
});
