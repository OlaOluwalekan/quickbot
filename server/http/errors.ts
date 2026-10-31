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
  badRequest: (m = "Malformed JSON") => new ApiError(400, "bad_request", m),
  unauthorized: () => new ApiError(401, "unauthorized", "Authentication required"),
  paymentRequired: (m = "Not enough credits") =>
    new ApiError(402, "insufficient_credits", m),
  forbidden: (m = "You don't have permission") => new ApiError(403, "forbidden", m),
  notFound: (what = "Resource") => new ApiError(404, "not_found", `${what} not found`),
  conflict: (m: string) => new ApiError(409, "conflict", m),
  validation: (details: unknown) =>
    new ApiError(422, "validation_error", "Invalid input", details),
  rateLimited: (retryAfter: number) =>
    new ApiError(429, "rate_limited", "Too many requests", { retryAfter }),
};
