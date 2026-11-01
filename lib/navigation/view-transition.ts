import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Navigates to a new route inside a document View Transition when supported,
 * falling back to immediate router.push when unsupported or when prefers-reduced-motion is active.
 */
export function navigateWithTransition(
  router: AppRouterInstance,
  href: string
): void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const doc = typeof document !== "undefined" ? (document as unknown as {
    startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> };
  }) : null;

  if (!doc?.startViewTransition || reduce) {
    router.push(href);
    return;
  }

  doc.startViewTransition(() => {
    return new Promise<void>((resolve) => {
      router.push(href);
      queueMicrotask(resolve);
    });
  });
}
