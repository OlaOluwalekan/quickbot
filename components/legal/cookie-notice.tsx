"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Cookie, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import {
  COOKIE_NOTICE_OPEN_EVENT,
  cookieNoticeCookie,
  hasAcknowledgedCookieNotice,
} from "@/lib/cookie-notice";

/*
 * Information notice, not a consent banner: Klecx sets only essential and
 * preference cookies. Adding analytics/marketing cookies requires turning this
 * into a consent banner first (Reject as prominent as Accept, categories, no
 * non-essential cookies before consent). See lib/cookie-notice.ts.
 */

const subscribe = (onChange: () => void) => {
  window.addEventListener(COOKIE_NOTICE_OPEN_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_NOTICE_OPEN_EVENT, onChange);
};

export function CookieNotice() {
  const t = useTranslations("CookieNotice");
  const { appName } = useSiteConfig();
  // Reopened from "Cookie settings" even after it was accepted.
  const [reopened, setReopened] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);

  React.useEffect(() => subscribe(() => setReopened(true)), []);

  // Read the cookie only in the browser: the server and the first client render
  // show nothing, so there is no hydration mismatch and no layout shift (the
  // notice is fixed-position).
  const acknowledged = React.useSyncExternalStore(
    subscribe,
    () => hasAcknowledgedCookieNotice(document.cookie),
    () => true
  );

  const visible = reopened || (!acknowledged && !accepted);
  if (!visible) return null;

  const accept = () => {
    document.cookie = cookieNoticeCookie(window.location.protocol === "https:");
    setAccepted(true);
    setReopened(false);
  };

  return (
    <div
      role="region"
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-[640px] sm:rounded-xl sm:border sm:pb-4"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="flex-1 text-xs leading-relaxed text-fg-muted sm:text-sm">
          {t("text", { appName })}
        </p>
        <button
          type="button"
          onClick={accept}
          aria-label={t("close")}
          className="-m-1 rounded-md p-1 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/cookies">{t("policy")}</Link>
        </Button>
        <Button size="sm" onClick={accept}>
          {t("accept")}
        </Button>
      </div>
    </div>
  );
}

export default CookieNotice;
