import { NextRequest, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";
import { ApiError } from "@/server/http/errors";
import { getClientIp, limit } from "@/server/http/rate-limit";

const baseHandler = toNextJsHandler(auth);

async function enforceAuthRateLimit(req: NextRequest): Promise<void> {
  const pathname = req.nextUrl.pathname;
  const ip = getClientIp(req);

  if (pathname.endsWith("/sign-in/email")) {
    let email = "";
    try {
      const cloned = req.clone();
      const body = (await cloned.json()) as { email?: unknown };
      if (typeof body?.email === "string") {
        email = body.email.trim().toLowerCase();
      }
    } catch {
      // Ignore body parse errors here; Better Auth will handle validation
    }
    await limit("auth:signin", `${ip}:${email}`);
    return;
  }

  if (pathname.endsWith("/sign-up/email")) {
    await limit("auth:signup", ip);
    return;
  }

  if (
    pathname.endsWith("/forget-password") ||
    pathname.endsWith("/request-password-reset")
  ) {
    let email = ip;
    try {
      const cloned = req.clone();
      const body = (await cloned.json()) as { email?: unknown };
      if (typeof body?.email === "string" && body.email.trim()) {
        email = body.email.trim().toLowerCase();
      }
    } catch {
      // Fallback to IP
    }
    await limit("auth:reset", email);
    return;
  }

  if (pathname.endsWith("/send-verification-email")) {
    let email = ip;
    try {
      const cloned = req.clone();
      const body = (await cloned.json()) as { email?: unknown };
      if (typeof body?.email === "string" && body.email.trim()) {
        email = body.email.trim().toLowerCase();
      }
    } catch {
      // Fallback to IP
    }
    await limit("auth:verify", email);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const res = await baseHandler.GET(req);
  const xRetryAfter = res.headers.get("X-Retry-After");
  if (res.status === 429 && xRetryAfter && !res.headers.get("Retry-After")) {
    const headers = new Headers(res.headers);
    headers.set("Retry-After", xRetryAfter);
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    await enforceAuthRateLimit(req);
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      const retryAfter =
        err.details &&
        typeof err.details === "object" &&
        "retryAfter" in err.details &&
        typeof (err.details as { retryAfter?: unknown }).retryAfter === "number"
          ? (err.details as { retryAfter: number }).retryAfter
          : 60;
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }
    throw err;
  }

  const res = await baseHandler.POST(req);
  const xRetryAfter = res.headers.get("X-Retry-After");
  if (res.status === 429 && xRetryAfter && !res.headers.get("Retry-After")) {
    const headers = new Headers(res.headers);
    headers.set("Retry-After", xRetryAfter);
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}
