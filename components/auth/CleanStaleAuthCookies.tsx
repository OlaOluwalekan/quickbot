"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CookieCleanerInner() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason");

  useEffect(() => {
    if (reason === "expired" || reason === "revoked") {
      const cookieNames = [
        "better-auth.session_token",
        "__Secure-better-auth.session_token",
        "better-auth.session_data",
        "__Secure-better-auth.session_data",
        "better-auth.dont_remember",
        "__Secure-better-auth.dont_remember",
      ];
      for (const name of cookieNames) {
        document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      }
    }
  }, [reason]);

  return null;
}

export function CleanStaleAuthCookies() {
  return (
    <Suspense fallback={null}>
      <CookieCleanerInner />
    </Suspense>
  );
}
