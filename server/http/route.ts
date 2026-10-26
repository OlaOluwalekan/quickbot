import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, Errors } from "./errors";
import { getActor, type Actor } from "@/server/auth/session";

export type Ctx<B, Q, P> = {
  req: NextRequest;
  actor: Actor;
  body: B;
  query: Q;
  params: P;
  requestId: string;
};

export function route<
  B extends z.ZodType = z.ZodUndefined,
  Q extends z.ZodType = z.ZodUndefined,
  P = Record<string, string>,
>(opts: {
  auth?: "required" | "optional"; // default "required"
  body?: B;
  query?: Q;
  handler: (c: Ctx<z.infer<B>, z.infer<Q>, P>) => Promise<unknown | Response>;
}) {
  return async (
    req: NextRequest,
    context?: { params?: Promise<P> | P }
  ): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const actor = await getActor(req); // session cookie OR Bearer token
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

      const resolvedParams = context?.params ? await context.params : ({} as P);

      const out = await opts.handler({
        req,
        actor: actor as Actor,
        body: parsedBody,
        query: parsedQuery,
        params: resolvedParams,
        requestId,
      });

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

      return NextResponse.json(
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
    }
  };
}
