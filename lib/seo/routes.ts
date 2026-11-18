import { getHelpSlugs } from "@/lib/help/articles";

export const STATIC_MARKETING_ROUTES = [
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
] as const;

export type StaticMarketingRoute = (typeof STATIC_MARKETING_ROUTES)[number];

export function getAllMarketingRoutes(): string[] {
  let helpSlugs: string[] = [];
  try {
    helpSlugs = getHelpSlugs();
  } catch {
    helpSlugs = [];
  }

  const helpRoutes = helpSlugs.map((slug) => `/help/${slug}`);
  return [...STATIC_MARKETING_ROUTES, ...helpRoutes];
}
