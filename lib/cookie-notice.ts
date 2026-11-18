/**
 * The cookie notice (F5.6). Klecx only sets essential and preference cookies
 * (lib/legal/cookies.ts), so this is an INFORMATION notice, not a consent
 * banner. If analytics or marketing cookies are ever added, it must become a
 * consent banner first: Reject as prominent as Accept, categories, and no
 * non-essential cookie before consent. See docs/compliance/cookies.md.
 */
export const COOKIE_NOTICE_COOKIE = "klecx_cookie_notice";
export const COOKIE_NOTICE_MAX_AGE = 60 * 60 * 24 * 365; // 12 months
/** Window event that reopens the notice ("Cookie settings" in the footer). */
export const COOKIE_NOTICE_OPEN_EVENT = "klecx:cookie-notice-open";

export function hasAcknowledgedCookieNotice(cookieHeader: string): boolean {
  return cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(`${COOKIE_NOTICE_COOKIE}=`));
}

/** The Set-Cookie value written by Accept (and the close button). */
export function cookieNoticeCookie(secure: boolean): string {
  return `${COOKIE_NOTICE_COOKIE}=1; Max-Age=${COOKIE_NOTICE_MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function openCookieNotice(): void {
  window.dispatchEvent(new Event(COOKIE_NOTICE_OPEN_EVENT));
}
