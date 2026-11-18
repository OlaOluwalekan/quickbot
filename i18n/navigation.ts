import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation helpers. Marketing, help and legal code imports
 * `Link`, `redirect`, `usePathname`, `useRouter` from here instead of
 * `next/link` / `next/navigation` (enforced by lint), so per-language URLs
 * (main-guide Step 10.7) only need a change to `routing`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
