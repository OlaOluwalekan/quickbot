import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/server/http/errors";
import { limit, resolveClientIp } from "@/server/http/rate-limit";
import { env } from "@/server/env";
import {
  resolvePublicShareByToken,
  getPublicShareHeaders,
} from "@/server/services/share";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> | { token: string } }
): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const baseHeaders: Record<string, string> = {
    ...getPublicShareHeaders(),
    "x-request-id": requestId,
  };

  try {
    const ip = resolveClientIp(req, env.TRUST_PROXY) ?? "untrusted-anon";
    await limit("share:view", ip);

    const { token } = await ctx.params;
    const data = await resolvePublicShareByToken(token);

    return NextResponse.json({ data }, { status: 200, headers: baseHeaders });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "rate_limited") {
        const retryAfter = (err.details as { retryAfter?: number } | undefined)
          ?.retryAfter;
        if (typeof retryAfter === "number") {
          baseHeaders["Retry-After"] = String(retryAfter);
        }
      }
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
            requestId,
          },
        },
        { status: err.status, headers: baseHeaders }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "internal",
          message: "Something went wrong",
          requestId,
        },
      },
      { status: 500, headers: baseHeaders }
    );
  }
}
