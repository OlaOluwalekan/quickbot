import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/server/config/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteConfig().appUrl;
  const baseUrl = siteUrl.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/settings",
          "/workspaces",
          "/projects",
          "/s/",
          "/auth/",
          "/invite/",
          "/dev/",
          "/maintenance",
          "/offline",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
