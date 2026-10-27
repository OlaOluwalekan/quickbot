# Klecx API v1 Contract

All JSON endpoints under `/api/v1/*` are built using the `route()` wrapper in `server/http/route.ts` and adhere to a uniform request/response contract designed for both web and mobile clients.

---

## 1. Response Envelopes

### Success Response
Every successful non-streaming JSON response returns a top-level `data` key:

```json
{
  "data": {
    "id": "01966f0c-7c2a-7000-8000-000000000001",
    "title": "New workspace"
  }
}
```

### Paginated List Response
Paginated endpoints accept `?cursor=<id>&limit=<1..50>` (default `limit = 20`) via `pageQuery` (`server/http/pagination.ts`) and return `items` + `nextCursor` inside `data`:

```json
{
  "data": {
    "items": [
      { "id": "01966f0c-7c2a-7000-8000-000000000001" }
    ],
    "nextCursor": "01966f0c-7c2a-7000-8000-000000000001"
  }
}
```
When there are no more items, `nextCursor` is `null`.

### Error Response
Every error response returns a top-level `error` object containing a machine-readable `code`, human-readable `message`, optional `details`, and the `requestId`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid input",
    "details": {
      "fieldErrors": {
        "title": ["String must contain at least 1 character(s)"]
      },
      "formErrors": []
    },
    "requestId": "c39f9a74-5e41-4c28-928c-6f6279b9d3f4"
  }
}
```
Internal server errors (`500`) never expose stack traces or raw exception messages in the response body.

---

## 2. Request Tracing (`x-request-id`)

- Every response includes an `x-request-id` HTTP header.
- If the client sends an `x-request-id` request header, the server echoes it back; otherwise, the server generates a UUID v4.

---

## 3. Standard HTTP Status Codes

| Status | Code | Meaning / When Used |
|---|---|---|
| `400` | `bad_request` | Malformed JSON body |
| `401` | `unauthorized` | Missing or invalid session cookie / Bearer token |
| `402` | `insufficient_credits` | User or workspace owner does not have enough credits |
| `403` | `forbidden` | Authenticated user has access to the resource but lacks permission for the action |
| `404` | `not_found` | Resource does not exist **or** caller has no access to it |
| `409` | `conflict` | State conflict (e.g., mutating an archived workspace, duplicate resource) |
| `422` | `validation_error` | Request body or query parameters failed Zod validation |
| `429` | `rate_limited` | Rate limit exceeded; includes `Retry-After` header (in seconds) and `{ retryAfter }` in `details` |
| `500` | `internal_error` | Unhandled server error (logged server-side with `requestId`) |

---

## 4. Resource Existence Privacy Rule

> **Return `404 Not Found`, not `403 Forbidden`, when a resource exists in the database but the caller has no access to it (`NONE` role or not a member/owner).**

- `404` is returned whenever `resolveWorkspaceRole` / `resolveProjectRole` returns `null`, preventing attackers from probing UUIDs to discover private resources.
- `403` is returned **only** when the user already has at least `VIEWER` access to the resource (so they are allowed to know it exists) but lacks the specific permission required for the operation (e.g., a `VIEWER` attempting `workspace.rename`).

---

## 5. Rate Limiting & Reverse Proxy Configuration (`TRUST_PROXY`)

- Next.js 16 `Request` / `NextRequest` objects do not expose a raw socket IP (`req.ip`).
- Client IP resolution (`resolveClientIp` in `server/http/rate-limit.ts`) returns `null` when `TRUST_PROXY=false` (never a shared `"127.0.0.1"` fallback) so untrusted client-supplied headers are ignored and callers do not collide in a single global localhost bucket.
- When `TRUST_PROXY=true`:
  - Your deployment's edge / reverse proxy **must** strip or overwrite incoming `X-Forwarded-For` and `X-Real-IP` headers from untrusted clients (Vercel and Cloudflare do this automatically; on Nginx, configure `proxy_set_header X-Forwarded-For $remote_addr;` and `proxy_set_header X-Real-IP $remote_addr;`).
  - `readTrustedProxyAddress(req)` reads the first entry of `x-forwarded-for` (or `x-real-ip`) and validates it with `node:net`'s `isIP()`, returning `null` if the header is missing or malformed.
  - Auth endpoints (`/api/auth/*`) fail closed (`429`) if `TRUST_PROXY=true` is configured and a request arrives without a valid proxy IP header.
