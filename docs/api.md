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

---

## 6. Workspaces API (`/api/v1/workspaces`)

### List Workspaces
`GET /api/v1/workspaces`

- **Query Parameters**:
  - `limit`: Integer between 1 and 50 (default: 20).
  - `cursor`: String, pagination cursor (workspace ID).
  - `projectId`: CUID, filter to workspaces inside a specific project.
  - `standalone`: Boolean, if true, returns only workspaces where `projectId` is `null`.
  - `archived`: Boolean, if true, returns archived workspaces; defaults to active.
  - `q`: String, full-text substring search on workspace `title` (accelerated by `pg_trgm` GIN index).
- **Response**: `{ data: { items: Workspace[], nextCursor: string | null } }`

### Create Workspace
`POST /api/v1/workspaces`

- **Body**:
  ```json
  {
    "title": "My Analysis Workspace",
    "projectId": "clh1234567890abcdef"
  }
  ```
  - `title`: String, 1–255 characters (optional, defaults to `"New workspace"`).
  - `projectId`: CUID (optional, requires project `EDITOR` or `OWNER` permission).
- **Response**: `{ data: Workspace }`

### Get Workspace Detail
`GET /api/v1/workspaces/:id`

- Returns workspace detail, including associated project and the caller's resolved `role`.
- Returns `404` if the workspace does not exist, is soft-deleted, or caller has no role.
- **Response**: `{ data: WorkspaceWithRelations & { role: EffectiveRole } }`

### Update Workspace
`PATCH /api/v1/workspaces/:id`

- **Body**:
  ```json
  {
    "title": "Renamed Title",
    "projectId": "clh1234567890abcdef",
    "archived": false
  }
  ```
  - `title`: String, 1–255 characters (requires `ADMIN` or `OWNER`).
  - `projectId`: CUID or `null` to move workspace (requires `ADMIN` on workspace and `EDITOR` on target project).
  - `archived`: Boolean (requires `ADMIN` or `OWNER`).
- **Response**: `{ data: Workspace }`

### Soft-Delete Workspace
`DELETE /api/v1/workspaces/:id`

- Soft-deletes the workspace by setting `deletedAt = now()`. Owner only.
- **Response**: `{ data: Workspace }`

### Restore Workspace
`POST /api/v1/workspaces/:id/restore`

- Restores a soft-deleted workspace within 30 days of deletion (`deletedAt = null`).
- Owner only. Rejects with `409 Conflict` if more than 30 days have elapsed.
- **Response**: `{ data: Workspace }`

### Search Workspaces & Messages
`GET /api/v1/workspaces/search`

- **Query Parameters**:
  - `q`: String, 1–200 characters, search term.
  - `scope`: `"this chat"` | `"all chats"` (default: `"all chats"`).
  - `workspaceId`: String (required when `scope = "this chat"`).
- **Behavior**:
  - When `scope = "this chat"`: searches question and response text strictly within the designated workspace. Enforces caller has at least `workspace.read` permission (returns 404 if caller lacks access or workspace is soft-deleted).
  - When `scope = "all chats"`: searches accessible workspace titles and conversation messages across all workspaces the caller has access to.
- **Response**: `{ data: { results: Array<Workspace | Response> } }`

---

## 7. Projects API (`/api/v1/projects`)

### List Projects
`GET /api/v1/projects`

- **Query Parameters**:
  - `limit`: Integer between 1 and 50 (default: 20).
  - `cursor`: String, pagination cursor (project ID).
  - `q`: String, search on project name.
  - `archived`: Boolean.
- **Response**: `{ data: { items: Project[], nextCursor: string | null } }`

### Create Project
`POST /api/v1/projects`

- **Body**:
  ```json
  {
    "name": "Design Systems",
    "description": "Cross-functional design and code workspaces"
  }
  ```
- **Response**: `{ data: Project }`

### Get Project Detail
`GET /api/v1/projects/:id`

- Returns project detail with member count, active workspace count, and caller's resolved `role`.
- Returns `404` if project does not exist, is soft-deleted, or caller is not a member.
- **Response**: `{ data: ProjectWithCounts & { role: EffectiveRole } }`

### Update Project
`PATCH /api/v1/projects/:id`

- **Body**:
  ```json
  {
    "name": "New Project Name",
    "description": "Updated description",
    "archived": false
  }
  ```
- Requires project `OWNER` or `ADMIN`.
- **Response**: `{ data: Project }`

### Soft-Delete Project
`DELETE /api/v1/projects/:id`

- Soft-deletes project by setting `deletedAt = now()`. Workspaces remain intact.
- Requires project `OWNER`.
- **Response**: `{ data: Project }`

### List Project Workspaces
`GET /api/v1/projects/:id/workspaces`

- Lists active workspaces contained within the project that are visible to the caller.
- **Response**: `{ data: { items: Workspace[], nextCursor: string | null } }`


---

## 5. Generations & Server-Sent Events (SSE)

### Stream Generation
`POST /api/v1/workspaces/:id/generations`

- **Authorization**: Requires `workspace.generate` permission on the target workspace.
- **Billing**: The workspace owner's credit account is billed (not the actor's).
- **Runtime**: `nodejs`, with `maxDuration = 300` s.
- **Headers**:
  ```http
  Content-Type: text/event-stream; charset=utf-8
  Cache-Control: no-cache, no-transform
  X-Accel-Buffering: no
  Connection: keep-alive
  ```
- **Body**:
  ```json
  {
    "idempotencyKey": "uuid-v4-or-v7",
    "prompt": "Your question or prompt text",
    "modelKey": "text-economy",
    "kind": "TEXT",
    "attachmentIds": [],
    "regenerateResponseId": "optional-response-id",
    "think": false,
    "language": "en"
  }
  ```

#### SSE Event Format
All streaming events adhere to the standard SSE structure:
```http
event: <eventType>
data: <jsonPayload>

```
Keepalive ping comments are emitted every 15 seconds:
```http
: ping

```

#### SSE Events Lifecycle:
1. `started`: `{ "generationId": string, "responseId": string, "versionId": string }`
2. `status`: `{ "stage": "preparing" | "writing" | "done" | "cancelled" | "failed", "truncated"?: boolean }`
3. `thought`: `{ "text": string }` (incremental reasoning summaries)
4. `delta`: `{ "text": string }` (incremental model response text)
5. `usage`: `{ "inputTokens": number, "outputTokens": number, "credits": number }`
6. `completed`: `{ "responseId": string, "versionId": string, "content": string }`
7. `error`: `{ "code": string }` (localization key)

### Get Generation Status & Resume
`GET /api/v1/generations/:id`

- Returns current status, latest partial or completed text, and metadata for recovery after client disconnect.
- **Authorization**: Requires `workspace.read` permission.
- **Response**:
  ```json
  {
    "data": {
      "id": "gen_123",
      "status": "RUNNING",
      "workspaceId": "ws_123",
      "responseId": "resp_123",
      "versionId": "ver_123",
      "content": "Partial text stream...",
      "thoughtSummary": null,
      "errorCode": null
    }
  }
  ```

### Cancel Generation
`POST /api/v1/generations/:id/cancel`

- Explicitly halts the running upstream provider stream and settles credits up to the cancellation point.
- **Authorization**: Requires `workspace.generate` permission.
- **Response**: `{ "data": { "success": true, "status": "CANCELLED" } }`


---

## 6. Response Versions & Regeneration

### List Workspace Responses
`GET /api/v1/workspaces/:id/responses?cursor&limit`

- Returns responses ordered chronologically by `(sortAt, id)` ascending.
- **Authorization**: Requires `workspace.read` permission.
- Each item includes `activeVersion` (with its latest edit summary: `hasEdits`, `editCount`) and `versionCount`.
- **Response**:
  ```json
  {
    "data": {
      "items": [
        {
          "id": "resp_123",
          "workspaceId": "ws_123",
          "createdById": "user_123",
          "prompt": "Explain quantum computing",
          "kind": "TEXT",
          "origin": "DIRECT",
          "sortAt": "2026-10-31T12:00:00.000Z",
          "activeVersionId": "ver_002",
          "createdAt": "2026-10-31T12:00:00.000Z",
          "activeVersion": {
            "id": "ver_002",
            "number": 2,
            "status": "COMPLETE",
            "content": "Quantum computing is...",
            "thoughtSummary": "Analyzing quantum states...",
            "modelKey": "text-economy",
            "hasEdits": false,
            "editCount": 0,
            "latestEditContent": null
          },
          "versionCount": 2
        }
      ],
      "nextCursor": null
    }
  }
  ```

### List Response Versions
`GET /api/v1/responses/:id/versions`

- Lists all versions for a response ordered by `number` ascending.
- **Authorization**: Requires `workspace.read` permission.
- **Response**: `{ "data": [ ResponseVersion & { isActive: boolean, hasEdits: boolean, editCount: number } ] }`

### Regenerate Response Turn
`POST /api/v1/responses/:id/regenerate`

- Creates **version N+1** without mutating or replacing earlier versions.
- Uses conversation context **up to that response only** (excludes subsequent turns).
- On completion, automatically updates `Response.activeVersionId` to the newly generated version.
- **Authorization**: Requires `workspace.regenerate` permission.
- **SSE Stream**: Adheres to the exact same SSE contract as `/api/v1/workspaces/:id/generations`.
- **Body**:
  ```json
  {
    "idempotencyKey": "uuid-v4-or-v7",
    "modelKey": "text-economy",
    "think": false,
    "language": "en"
  }
  ```

### Switch Active Response Version
`PUT /api/v1/responses/:id/active-version`

- Changes what version is displayed by default for everyone viewing the workspace.
- **Authorization**: Requires `workspace.regenerate` permission.
- **Body**: `{ "versionId": "ver_001" }`
- **Response**: `{ "data": { "responseId": "resp_123", "activeVersionId": "ver_001" } }`


---

## 7. Response Edits (User Improvements)

### List Response Version Edits
`GET /api/v1/response-versions/:id/edits`

- Returns the append-only revision history of user edits for a specific response version, ordered by `revision` descending.
- **Authorization**: Requires `workspace.read` permission.
- **Response**:
  ```json
  {
    "data": {
      "versionId": "ver_123",
      "originalContent": "AI generated text...",
      "total": 1,
      "items": [
        {
          "id": "edit_123",
          "versionId": "ver_123",
          "revision": 1,
          "content": "User improved text...",
          "editorId": "usr_123",
          "createdAt": "2026-10-31T12:00:00.000Z"
        }
      ]
    }
  }
  ```

### Create Response Version Edit
`POST /api/v1/response-versions/:id/edits`

- Appends a new revision (`revision = max + 1`) to the response version.
- `ResponseVersion.content` remains untouched and byte-identical.
- User edits cost 0 credits.
- Max content length: 100,000 characters.
- **Authorization**: Requires `workspace.edit_response` permission (OWNER, ADMIN, COLLABORATOR).
- **Body**:
  ```json
  {
    "content": "Updated and polished explanation..."
  }
  ```
- **Response**:
  ```json
  {
    "data": {
      "id": "edit_123",
      "versionId": "ver_123",
      "revision": 1,
      "content": "Updated and polished explanation...",
      "editorId": "usr_123",
      "createdAt": "2026-10-31T12:00:00.000Z"
    }
  }
  ```

### Revert Latest Response Edit
`DELETE /api/v1/response-versions/:id/edits/latest`

- Reverts the most recent edit (`max(revision)`), returning the response version to its previous revision or original state.
- **Authorization**: Requires workspace owner, workspace admin, or the editor who authored that latest edit.
- **Response**:
  ```json
  {
    "data": {
      "revertedEdit": {
        "id": "edit_123",
        "revision": 2
      },
      "remainingEdits": 1
    }
  }
  ```
