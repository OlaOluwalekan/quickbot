import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodTypeAny } from "zod";
import { ApiError, Errors } from "./errors";
import { limit, type RateLimitPolicy } from "./rate-limit";
import { getActor, type Actor } from "@/server/auth/session";

export type Ctx<B, Q, P> = {
  req: NextRequest;
  actor: Actor;
  body: B;
  query: Q;
  params: P;
  requestId: string;
};

export function clearResponseAuthCookies(res: NextResponse) {
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

export function route<
  B extends ZodTypeAny = z.ZodUndefined,
  Q extends ZodTypeAny = z.ZodUndefined,
  P = Record<string, string>,
>(opts: {
  auth?: "required" | "optional"; // default "required"
  disableCookieCache?: boolean;
  body?: B;
  query?: Q;
  rateLimit?: {
    policy: RateLimitPolicy;
    key: (c: Ctx<z.infer<B>, z.infer<Q>, P>) => string;
  };
  handler: (c: Ctx<z.infer<B>, z.infer<Q>, P>) => Promise<unknown | Response>;
}) {
  return async (
    req: NextRequest,
    context?: { params?: Promise<P> | P }
  ): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const actor = await getActor(req, { disableCookieCache: opts.disableCookieCache }); // session cookie OR Bearer token
      if ((opts.auth ?? "required") === "required" && !actor) {
        throw Errors.unauthorized();
      }

      let parsedBody: z.infer<B> = undefined as z.infer<B>;
      if (opts.body) {
        let rawJson: unknown = {};
        if (typeof req.text === "function") {
          const rawText = await req.text();
          if (rawText.trim().length > 0) {
            try {
              rawJson = JSON.parse(rawText);
            } catch {
              throw Errors.badRequest("Malformed JSON");
            }
          }
        } else {
          rawJson = await req.json().catch(() => ({}));
        }
        const bodyResult = opts.body.safeParse(rawJson);
        if (!bodyResult.success) {
          throw Errors.validation(bodyResult.error.flatten());
        }
        parsedBody = bodyResult.data as z.infer<B>;
      }

      let parsedQuery: z.infer<Q> = undefined as z.infer<Q>;
      if (opts.query) {
        const rawQuery = Object.fromEntries(req.nextUrl.searchParams);
        const queryResult = opts.query.safeParse(rawQuery);
        if (!queryResult.success) {
          throw Errors.validation(queryResult.error.flatten());
        }
        parsedQuery = queryResult.data as z.infer<Q>;
      }

      const resolvedParams = context?.params
        ? await context.params
        : ({} as P);

      const ctx: Ctx<z.infer<B>, z.infer<Q>, P> = {
        req,
        actor: actor as Actor,
        body: parsedBody,
        query: parsedQuery,
        params: resolvedParams,
        requestId,
      };

      if (opts.rateLimit) {
        await limit(opts.rateLimit.policy, opts.rateLimit.key(ctx));
      } else if (actor) {
        await limit("api:default", actor.userId);
      }

      const out = await opts.handler(ctx);

      if (out instanceof Response) {
        out.headers.set("x-request-id", requestId);
        return out;
      }

      return NextResponse.json(
        { data: out },
        { headers: { "x-request-id": requestId } }
      );
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError(500, "internal_error", "Something went wrong");

      if (!(e instanceof ApiError)) {
        console.error({ requestId, err: String(e) }); // replaced by pino in 10.2
      }

      const headers: Record<string, string> = { "x-request-id": requestId };
      if (
        err.status === 429 &&
        err.details &&
        typeof err.details === "object" &&
        "retryAfter" in err.details &&
        typeof (err.details as { retryAfter?: unknown }).retryAfter === "number"
      ) {
        headers["Retry-After"] = String(
          (err.details as { retryAfter: number }).retryAfter
        );
      }

      const res = NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
            requestId,
          },
        },
        { status: err.status, headers }
      );

      if (err.status === 401) {
        clearResponseAuthCookies(res);
      }

      return res;
    }
  };
}
