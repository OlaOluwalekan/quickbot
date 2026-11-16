/**
 * Limits for screenshots attached to a support request (F5.8).
 * Shared by the form (client checks, shrinking) and the server (which enforces them).
 */

export const MAX_SUPPORT_SCREENSHOTS = 5;

/** Per file, as chosen by the person. */
export const MAX_SUPPORT_SCREENSHOT_BYTES = 2 * 1024 * 1024;

/**
 * All screenshots of one request together. Vercel rejects request bodies over
 * 4.5 MB before they reach the function, so the total stays below that; the
 * form shrinks large screenshots (WebP) so five of them still fit.
 */
export const MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES = 4 * 1024 * 1024;

/** Width or height, in pixels. */
export const MAX_SUPPORT_SCREENSHOT_DIMENSION = 4096;

export const SUPPORT_SCREENSHOT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SupportScreenshotMime = (typeof SUPPORT_SCREENSHOT_MIME_TYPES)[number];

export function isSupportScreenshotMime(mime: string): mime is SupportScreenshotMime {
  return (SUPPORT_SCREENSHOT_MIME_TYPES as readonly string[]).includes(mime);
}

/** How long the links in the support team's email stay valid. */
export const SUPPORT_SCREENSHOT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Screenshots are deleted this many days after the request (job: Step 10.3). */
export const SUPPORT_SCREENSHOT_RETENTION_DAYS = 90;
