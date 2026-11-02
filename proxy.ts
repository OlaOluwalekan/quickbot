import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { authRoutes, DEFAULT_LOGIN_REDIRECT, publicRoutes } from "./utils/routes";

function attachSecurityHeaders(res: NextResponse, pathname: string) {
  const isPrivateRoute =
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/api/");

  if (isPrivateRoute) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

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
    pathname.startsWith("/help/");

  const isAuthRoute =
    authRoutes.includes(pathname);

  if (isAuthRoute) {
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
