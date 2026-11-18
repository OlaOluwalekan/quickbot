import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/server/config/site";
import { STATIC_MARKETING_ROUTES } from "@/lib/seo/routes";
import { getArticles } from "@/lib/help/articles";
import enMessages from "@/messages/en.json";

/** Pages whose own text carries a date (Legal.updatedAt). */
const LEGAL_ROUTES = new Set(["/terms", "/privacy", "/cookies", "/acceptable-use"]);

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteConfig().appUrl.replace(/\/$/, "");

  // Only real dates: legal pages from Legal.updatedAt, help articles from their
  // front matter (`updated`). Other pages leave lastModified out rather than
  // claiming a change on every build.
  const staticEntries: MetadataRoute.Sitemap = STATIC_MARKETING_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    ...(LEGAL_ROUTES.has(route) ? { lastModified: enMessages.Legal.updatedAt } : {}),
    changeFrequency:
      route === "" ? "daily" : route === "/pricing" || route === "/features" ? "weekly" : "monthly",
    priority: route === "" ? 1.0 : route === "/pricing" || route === "/features" ? 0.9 : 0.7,
  }));

  const helpEntries: MetadataRoute.Sitemap = getArticles("en").map((article) => ({
    url: `${baseUrl}/help/${article.slug}`,
    ...(article.updated ? { lastModified: article.updated } : {}),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...helpEntries];
}
