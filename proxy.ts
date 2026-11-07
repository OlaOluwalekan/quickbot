import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { authRoutes, DEFAULT_LOGIN_REDIRECT, publicRoutes } from "./utils/routes";

function attachSecurityHeaders(res: NextResponse, pathname: string) {
  if (pathname.startsWith("/s/") || pathname.startsWith("/api/v1/s/")) {
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const isPrivateRoute =
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/api/");

  if (isPrivateRoute) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  const cookieNames = [
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
    "better-auth.session_data",
    "__Secure-better-auth.session_data",
    "better-auth.dont_remember",
    "__Secure-better-auth.dont_remember",
  ];
  for (const name of cookieNames) {
    res.cookies.delete(name);
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      expires: new Date(0),
    });
  }
}

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  // Maintenance mode handling (Step 4.3)
  if (process.env.MAINTENANCE_MODE === "true") {
    if (
      pathname !== "/maintenance" &&
      pathname !== "/status" &&
      !pathname.startsWith("/api/health") &&
      !pathname.startsWith("/api/ready")
    ) {
      return attachSecurityHeaders(
        NextResponse.redirect(new URL("/maintenance", nextUrl)),
        pathname,
      );
    }
    return attachSecurityHeaders(NextResponse.next(), pathname);
  }

  // Leave Better Auth, webhooks, cron jobs, and shared links public
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/s/")
  ) {
    return attachSecurityHeaders(NextResponse.next(), pathname);
  }

  // API routes handle their own authorization via route() / getActor()
  if (pathname.startsWith("/api/")) {
    return attachSecurityHeaders(NextResponse.next(), pathname);
  }

  const sessionCookie = getSessionCookie(req);
  const isLoggedIn = Boolean(sessionCookie);

  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/help/") ||
    pathname === "/maintenance";

  const isAuthRoute = authRoutes.includes(pathname);

  const hasExpiredReason =
    nextUrl.searchParams.get("reason") === "expired" ||
    nextUrl.searchParams.get("reason") === "revoked" ||
    nextUrl.searchParams.has("expired") ||
    nextUrl.searchParams.has("revoked");

  // Canonical alias: forward /login to /auth/login
  if (pathname === "/login") {
    const url = new URL("/auth/login", nextUrl);
    url.search = nextUrl.search;
    const res = NextResponse.redirect(url);
    if (hasExpiredReason) {
      clearAuthCookies(res);
    }
    return attachSecurityHeaders(res, pathname);
  }

  if (isAuthRoute) {
    // If arriving with an expired or revoked reason, clear stale session cookies and show login
    if (hasExpiredReason) {
      const res = NextResponse.next();
      clearAuthCookies(res);
      return attachSecurityHeaders(res, pathname);
    }

    if (isLoggedIn) {
      return attachSecurityHeaders(
        NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl)),
        pathname,
      );
    }
    return attachSecurityHeaders(NextResponse.next(), pathname);
  }

  if (!isLoggedIn && !isPublicRoute) {
    return attachSecurityHeaders(
      NextResponse.redirect(new URL("/auth/login", nextUrl)),
      pathname,
    );
  }

  return attachSecurityHeaders(NextResponse.next(), pathname);
}

export default proxy;

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
