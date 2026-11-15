/**
 * F4.4: something just spent credits (a review, an answer…). The workspace
 * view listens and refetches the workspace, whose `ownerOutOfCredits` and
 * `memberCreditCapReached` drive the credit gates. Browser-only, no payload.
 */
export const CREDITS_CHANGED_EVENT = "klecx:credits-changed";

export function notifyCreditsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}
