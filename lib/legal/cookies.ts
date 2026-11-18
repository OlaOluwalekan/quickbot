/**
 * Every cookie and browser-storage item Klecx sets (F5.5). The Cookie Policy
 * renders its table from this list, and the cookie notice (F5.6) reads it too.
 * A test checks that each name is still used in the code, so the policy can't
 * list something that no longer exists.
 *
 * When you add a cookie or a storage key: add it here (and its purpose in
 * `Legal.cookies.purposes` in en/es/fr). A non-essential cookie (analytics,
 * marketing) also needs a consent banner first; see F5.6.
 */

export type StorageKind = "cookie" | "localStorage" | "sessionStorage";
export type StorageCategory = "essential" | "preference";

export interface StorageItem {
  /** Names as they appear in the browser (one row per item). */
  names: string[];
  kind: StorageKind;
  category: StorageCategory;
  /** `Legal.cookies.purposes.<purpose>` */
  purpose: string;
  /** `Legal.cookies.durations.<duration>` */
  duration: string;
}

export const STORAGE_ITEMS: StorageItem[] = [
  {
    // Better Auth; the __Secure- prefix is used on HTTPS.
    names: ["better-auth.session_token", "__Secure-better-auth.session_token"],
    kind: "cookie",
    category: "essential",
    purpose: "session",
    duration: "sessionRolling",
  },
  { names: ["NEXT_LOCALE"], kind: "cookie", category: "preference", purpose: "locale", duration: "oneYear" },
  { names: ["sidebar"], kind: "cookie", category: "preference", purpose: "sidebar", duration: "oneYear" },
  // next-themes keeps the theme in localStorage under its default key.
  { names: ["theme"], kind: "localStorage", category: "preference", purpose: "theme", duration: "untilCleared" },
  { names: ["klecx-ui-store"], kind: "localStorage", category: "preference", purpose: "uiStore", duration: "untilCleared" },
  {
    names: ["klecx-panel-width", "klecx-ask-col-width", "klecx-doc-col-width"],
    kind: "localStorage",
    category: "preference",
    purpose: "columnWidths",
    duration: "untilCleared",
  },
  { names: ["klecx-sidebar-pinned"], kind: "localStorage", category: "preference", purpose: "sidebarPinned", duration: "untilCleared" },
  { names: ["klecx-project-view-mode"], kind: "localStorage", category: "preference", purpose: "projectView", duration: "untilCleared" },
  { names: ["klecx-document-drafts-v1"], kind: "sessionStorage", category: "preference", purpose: "documentDrafts", duration: "tab" },
  { names: ["klecx_username_prompted"], kind: "sessionStorage", category: "preference", purpose: "usernamePrompt", duration: "tab" },
];
