import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { authRoutes, DEFAULT_LOGIN_REDIRECT, publicRoutes } from "./utils/routes";

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
    return NextResponse.next();
  }

  // API routes handle their own authorization via route() / getActor()
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);
  const isLoggedIn = Boolean(sessionCookie);

  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthRoute =
    authRoutes.includes(pathname) ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/auth/login", nextUrl));
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
