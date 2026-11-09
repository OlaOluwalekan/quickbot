export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  badRequest: (m = "Malformed JSON", code = "bad_request", details?: unknown) =>
    new ApiError(400, code, m, details),
  unauthorized: (m = "Authentication required") =>
    new ApiError(401, "unauthorized", m),
  paymentRequired: (m = "Not enough credits") =>
    new ApiError(402, "insufficient_credits", m),
  forbidden: (m = "You don't have permission", code = "forbidden") =>
    new ApiError(403, code, m),
  notFound: (what = "Resource") => new ApiError(404, "not_found", `${what} not found`),
  conflict: (m: string, code = "conflict", details?: unknown) =>
    new ApiError(409, code, m, details),
  validation: (details: unknown) =>
    new ApiError(422, "validation_error", "Invalid input", details),
  unprocessable: (
    m = "Unprocessable entity",
    code = "unprocessable_entity",
    details?: unknown
  ) => new ApiError(422, code, m, details),
  contentBlocked: (
    m = "Prompt blocked by content safety policy",
    details?: unknown
  ) => new ApiError(422, "content_blocked", m, details),
  rateLimited: (retryAfter: number) =>
    new ApiError(429, "rate_limited", "Too many requests", { retryAfter }),
};
