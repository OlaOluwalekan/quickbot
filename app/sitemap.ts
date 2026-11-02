import type { MetadataRoute } from "next";
import { getHelpSlugs } from "@/lib/help/articles";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://klecx.com";
  const baseUrl = siteUrl.replace(/\/$/, "");

  const staticRoutes = [
    "",
    "/pricing",
    "/features",
    "/about",
    "/help",
    "/support",
    "/status",
    "/terms",
    "/privacy",
    "/cookies",
    "/acceptable-use",
  ];

  let helpSlugs: string[] = [];
  try {
    helpSlugs = getHelpSlugs();
  } catch {
    helpSlugs = [];
  }

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
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

  const helpEntries: MetadataRoute.Sitemap = helpSlugs.map((slug) => ({
    url: `${baseUrl}/help/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...helpEntries];
}
