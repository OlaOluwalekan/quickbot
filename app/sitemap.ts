import type { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import { getSiteConfig } from "@/server/config/site";
import { STATIC_MARKETING_ROUTES } from "@/lib/seo/routes";
import { getHelpSlugs } from "@/lib/help/articles";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteConfig().appUrl;
  const baseUrl = siteUrl.replace(/\/$/, "");

  let helpSlugs: string[] = [];
  try {
    helpSlugs = getHelpSlugs();
  } catch {
    helpSlugs = [];
  }

  const baseReleaseDate = new Date("2026-11-18T00:00:00.000Z");

  const staticEntries: MetadataRoute.Sitemap = STATIC_MARKETING_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: baseReleaseDate,
    changeFrequency:
      route === ""
        ? "daily"
        : route === "/pricing" || route === "/features"
        ? "weekly"
        : "monthly",
    priority:
      route === ""
        ? 1.0
        : route === "/pricing" || route === "/features"
        ? 0.9
        : 0.7,
  }));

  const helpDir = path.join(process.cwd(), "content", "help", "en");

  const helpEntries: MetadataRoute.Sitemap = helpSlugs.map((slug) => {
    let lastModified = baseReleaseDate;
    const mdxPath = path.join(helpDir, `${slug}.mdx`);
    const mdPath = path.join(helpDir, `${slug}.md`);
    const targetFile = fs.existsSync(mdxPath) ? mdxPath : fs.existsSync(mdPath) ? mdPath : null;

    if (targetFile) {
      try {
        const stats = fs.statSync(targetFile);
        lastModified = stats.mtime || baseReleaseDate;
      } catch {
        // fallback
      }
    }

    return {
      url: `${baseUrl}/help/${slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    };
  });

  return [...staticEntries, ...helpEntries];
}
