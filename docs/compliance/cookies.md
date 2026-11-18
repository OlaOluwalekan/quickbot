# Cookies and the cookie notice

Klecx sets only **essential** and **preference** cookies and browser-storage
items. The full list is `lib/legal/cookies.ts` (`STORAGE_ITEMS`); the Cookie
Policy page renders its table from it, and a test fails if a listed name is no
longer used in the code.

## The notice is information, not consent

`components/legal/cookie-notice.tsx` (F5.6) tells first-time visitors which
cookies we use, with **Accept**, a close button (same as Accept) and a link to
the Cookie Policy. Accept sets `klecx_cookie_notice=1` for 12 months
(`SameSite=Lax`, `Secure` on HTTPS). "Cookie settings" in the marketing footer
reopens it. Essential and preference cookies need no consent, so nothing waits
on Accept.

## Before adding analytics or marketing cookies

Any non-essential cookie (analytics, advertising, tracking pixels, third-party
embeds that set cookies) changes the legal basis. Before shipping one:

1. Turn the notice into a **consent banner**: **Reject** as prominent as
   **Accept**, per-category choices, and a way to change them later
   ("Cookie settings").
2. Set **no** non-essential cookie or script before the visitor consents;
   remember the choice per category.
3. Add the item to `STORAGE_ITEMS` with a new category, translate its purpose
   and duration (`Legal.cookies.*`, en/es/fr), and update the Cookie and
   Privacy policies (bump `Legal.updatedAt`).
