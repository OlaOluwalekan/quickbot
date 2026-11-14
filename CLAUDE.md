# CLAUDE.md — Klecx

Context for Claude Code sessions in this repository. Read this first, then the guides listed below.

## What this is

**Klecx** is an AI workspace app (workspaces, projects, response versions, passage annotations, collaboration). **Klecx is a product of Vyraxity, Lagos, Nigeria.** Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, next-intl (`en`, `es`, `fr`), TanStack Query + Zustand, shadcn/ui, Cloudinary, Resend, Upstash Redis. Billing will use Creem (merchant of record).

## The plan — two guides, in this order

1. `Klecx_Implementation_Guide_v2.md` — the main guide. **Done up to Step 7.7** (notifications).
2. `quick_implementation_fix_for_v2.md` — the **interlude** (steps `F0.1` → `F5.10`). Do these **before** main-guide Step 8.1.
3. Then main-guide Steps **8.1 → 10.6**. Read each step's **"↳ After the interlude"** block, which changes the step. Step 10.7 (per-language marketing URLs) comes after launch.

Each step = one PR. Implement **only** the step you were asked for. Follow its *Update / Create / Schema / Env / i18n / Done when* fields. If the code disagrees with a guide (paths, names), check the live code, follow its intent, and say so in the PR.

## Workflow

- The owner uses **Google Antigravity** to implement a step and opens a PR. **Claude reviews the PR** against the guides and the rules below, fixes problems, and pushes to **that PR's branch**.
- **`dev` is the default branch.** Create new branches from the latest `origin/dev` (e.g. `fix/F1-2-member-capabilities`, `step/8-1-plan-catalog`).
- **Never merge PRs and never push to `dev` or `main`.** The owner merges. Don't open a PR unless asked.
- Before pushing, run the checks below on what changed. For a review, list what you found, what you fixed, and anything left for the owner.

## Commands

```bash
npm run lint
```
```bash
npm run typecheck
```
```bash
npm test -- --ci
```
```bash
npm run build
```
```bash
npm run verify
```
`verify` runs everything (it needs Docker for Postgres). Use `npm run db:migrate` to create migrations (`--create-only` when hand-editing SQL). Never edit a migration that's already merged. `check:i18n` exists once interlude F5.1 is merged.

CI and `verify` fail when `schema.prisma` and the migrations disagree (`prisma migrate diff --exit-code`). If that check fails, the schema was changed without a migration (or with `prisma db push`): create the missing migration.

**Open review items carried forward from F2.2 (PR #111, 2026-11-10), F2.4 (PR #113, 2026-11-10), F2.5 (PR #114, 2026-11-11), F2.6 (PR #115, 2026-11-11), F2.7 (PR #116, 2026-11-11) and F3.3 (PR #120, 2026-11-13).** When reviewing the step named in each item, check whether it's fixed; if not, fix it in that step's PR. Once that step's review is done and the item is fixed, **delete the item from this file** (and delete this whole block when it's empty).

- **Check in Step 8.1 — collaboration limits per plan** (owner decided 2026-11-14, no real users yet). To stop one paid plan being shared by a group: **Free and Lite: no collaboration** (0 collaborators; Lite is 2 today), **Standard: 3** (5 today), **Pro: 5** (15 today). Count **distinct people across all the owner's workspaces and projects**, not per workspace (today the limit is per workspace or project, so an owner could invite 3 different people into each workspace). Update `server/billing/plans.ts` (`limits.members` and the `features` lines), the pricing page, FAQ, help articles, the over-limit notice (`messages/*.json`, "per workspace or project") and the tests together; members above the new limit follow the existing 14-day grace → suspension rule. A seat-based team plan is in `OPEN_DECISIONS.md` §3.
- **Check in F4.1 — web search in Asks.** Ask answers don't search the web yet (`streamAnnotationAnswer` passes no tool; `buildAskContext`'s `webSearch` option is unused). The citation path is ready: `citation` events are saved on the message and shown by `AnswerBody`. F4.1 must turn search on per the actor's preference and charge the +3 credits.
- **Check in Step 9.5 — account deletion uses `softDeleteUser()`.** `server/services/account-deletion.ts` only does the data part (sets `User.deletedAt`, soft-deletes the person's Klecx notes). Nothing calls it yet and nothing reads `User.deletedAt`: a deleted account can still sign in and is still listed as a member / mentionable. Step 9.5 must build the flow around it (fresh login, revoke sessions, block sign-in, ownership transfer, grace period) and decide what cancelling the deletion restores (the notes carry the same `deletedAt` as the user).
- **Check in F3.x — view-only projects when promoting** (owner decided 2026-11-11). "New workspace" in an Ask column lists every project the person belongs to (`GET /api/v1/projects`), including projects where they can only view. Picking one of those ends in a 403 and a toast. Keep listing all of them, but grey out the view-only ones with a tooltip ("You have view-only access to this project"), using `<Gated>`. The list has no role per project yet: add the caller's role or capabilities to each row on the server, then gate on it.
- **Check in F5.7 — help articles for F3.1 – F3.3.** No help article describes workspace documents, "Ask Klecx to review", accepting a fix from the highlight, or the Download menu (original file / edited version). Write them with the other help fixes, in `en`, `es` and `fr`.
- **Check in F5.1 — untranslated text near Asks.** The question queue popover (`components/workspace/question-queue-popover.tsx`) and the code block header (`components/markdown/code-block.tsx`: "Wrap", "Copy", "Copied", their `title`s) are still hard-coded English; `Response.*` in `es.json` / `fr.json` is still English. The editor (`components/response/edit-response.tsx`, also used for documents since F3.2) has a hard-coded placeholder ("Edit response content...") and "Nothing to preview.". (The highlight preview card is translated since F2.6: `Annotations.preview.*`.)

**Undecided product questions live in `OPEN_DECISIONS.md`.** Read it before a step that touches one of its entries. Keep the behaviour it describes until the owner decides; add an entry when a review finds a choice the owner hasn't made.

## Code layout

- `app/` — routes: `(marketing)` public pages, `(app)` signed-in app, `api/v1/*` JSON/SSE endpoints, `s/[token]` public share pages.
- `server/` — server only (`import "server-only"`): `services/` (business rules), `authz/` (roles/permissions), `ai/` (provider, registry, prompts, context builder), `billing/`, `email/`, `storage/`, `http/` (`route()` wrapper, errors, rate limits).
- `lib/` — isomorphic code: `schemas/` (zod), `api/` (client + TanStack hooks), `stores/` (Zustand), `annotations/`.
- `components/` — UI. `messages/*.json` — translations. `content/help/<locale>/*.mdx` — help center.
- Tests: `__tests__/`. Name new ones `step-<n>-<m>-<name>.test.ts(x)` or `fix-F<phase>-<n>-<name>.test.ts(x)`.

## Rules for every change

1. **The server decides.** Never trust a user id, balance, role, plan, price or model from the client. Routes do: parse → authenticate → authorize → call a service → shape the response.
2. **No Prisma outside `server/`.** The UI talks to `/api/v1/*` only.
3. **Authorization on every new resource**, in the same PR (`requireWorkspace` / `requireProject` + a test that another user gets 404).
4. **All user-visible text goes through next-intl**, in `en`, `es` and `fr`. That includes `aria-label`, `title`, `placeholder`, toasts, errors shown to users, emails, legal pages and help articles.
5. **No hard-coded email addresses, company name, address or URLs.** Read them from env via `getSiteConfig()` (interlude F0.2).
6. **No third-party AI or provider brand names in product copy** (marketing, app, help, emails). Say "third-party AI models" or use the tier names. The only exceptions are OAuth sign-in buttons and the privacy policy's processor list.
7. **Plan-dependent UI reads `useEntitlements()`** and uses `<Gated>` (disabled + tooltip). The server re-checks.
8. **Annotation and document features work on every target**: main responses, Ask answers at any depth, uploaded documents, generated documents.
9. **Copy must be true.** Don't describe features that don't exist yet (top-up packs, self-service account deletion, etc.). Billing text shows only when `BILLING_ENABLED=true`.
10. **Tests ship with the feature**: at least one service-level test and one unauthorized-access test.
11. **No secrets, prompts, responses or file contents in logs.**
12. New dependencies need a one-line reason in the PR. Prefer removing one when adding one.

## Key decisions (details in the guides)

- **Permissions are top-down:** effective role = max(project role, workspace role). A workspace row can add rights, never remove inherited ones. Per-member **Comment** and **Ask** toggles exist. Suspended members are read-only.
- **Annotations:** two actions, **Comment** and **Ask** (Ask now / Add to queue). Nesting depth is **unlimited** (hidden safety ceiling 100), shown as a column stack whose older levels collapse into spines. An Ask's AI context = only the text containing the highlight + its own thread + Klecx notes.
- **`@mentions`** notify members. **`@klecx`** creates a workspace note that's added to later prompts; no immediate AI call. A note belongs to the message that recorded it, so one comment thread can hold several notes.
- **Web search** is a tool the model calls when needed. It's on by default for all plans (Free included) and costs +3 credits per executed search, with a daily cap. It can be turned off in Settings. AI response language is a Settings preference (Auto by default), not a composer control.
- **Deleting an account is a soft delete** (decided 2026-11-11): the `users` row stays with `deletedAt` set, and the Klecx notes that person wrote are soft-deleted too (`WorkspaceNote.deletedAt`): hidden from the notes list, the annotation marks and later prompts. No row is removed.
- **Workspace documents** (decided 2026-11-12): MD, TXT, DOCX and CSV files can be added to a workspace as a document. **PDFs can't** (only their text can be extracted, the layout is lost and the result can't be edited and downloaded as a corrected file); a PDF can still be attached to a message. A workspace holds **at most 3 documents** (`MAX_WORKSPACE_DOCUMENTS`): each one is sent with every prompt and never dropped from the context, so the cap bounds input tokens. The type list and the cap live in `lib/documents/workspace-document-types.ts`; the server enforces both. A document is stored as Markdown (the working copy for highlights, the AI and edits); the original file is kept for download. Document text is rendered with `<Markdown variant="document">`: HTML inside it is rendered after sanitizing, and images that can't be shown become a placeholder box with their description. What happens to heavily styled files is open: `OPEN_DECISIONS.md` §2.
- **Review comments and quick fixes** (decided 2026-11-13): "Ask Klecx to review" leaves comments written by Klecx (`authorType = AI`), each on an exact passage, shown as a wavy underline. Hovering a passage shows what is wrong and, when there is a replacement, the change (old → new) with **Accept** and **Dismiss** for that one change; "Accept all fixes" on the card takes every open fix at once. Accept only changes the unsaved draft; the fix is recorded as accepted when the text is saved (`acceptedSuggestionIds`), never directly. A fix whose passage changed becomes `STALE`. Text with unsaved changes can't be commented on or asked about until it is saved (the server only knows the saved text). A review costs credits once (owner pays) and reads the saved text.
- **Question queue answers** (decided 2026-11-13): "Ask all" opens **one column** next to the conversation (`?thread=b:<generationId>`, `components/threads/batch-column.tsx`) with every queued question and its answer, like "Ask now". It is still one model call. Each answer stays attached to its own question, so it can be highlighted and continued in its own thread. The old right panel is no longer opened by the queue.
- **Document download** (decided 2026-11-13): a document's Download menu offers the **original file** (as uploaded) and the **edited version** (the saved text, as Word, PDF or Markdown, per the plan's export formats). The edited version of an uploaded document carries no model, version or workspace link.
- **Function duration** (decided 2026-11-13): API routes may run up to **300 s** (Vercel Hobby with Fluid compute). The limit is set in **one place**, `vercel.json` (`functions["app/api/**/*"].maxDuration`). Don't add `export const maxDuration` to a route: it would override that value for the route, and Next.js only reads it as a literal, so it can't come from a shared constant or an env variable. `MAX_FUNCTION_SECONDS` in `lib/annotations/limits.ts` mirrors it for code that must know the limit (an Ask answer counts as interrupted after it + 60 s): change both together.
- **Download formats follow the owner's plan** (decided 2026-11-14): which formats (Markdown / PDF / Word) a workspace's members may download comes from the **workspace owner's** plan, for every download (responses, whole workspace, uploaded and generated documents). The owner invites the members, so their plan applies. Word/PDF also need `workspace.export`. The server checks it in `assertExportAllowed()` (`server/documents`); the UI greys formats out with `exportFormatGateReason()` from `GET /api/v1/workspaces/:id` → `exportFormats` (non-owners see "the workspace owner's plan doesn't include this", without an upgrade link). The daily export cap is counted per downloader.
- **Auto-closing sidebar** (decided 2026-11-14): when the open columns don't fit beside the expanded sidebar (main ≥ 480 px + up to two columns ≥ 420 px), the sidebar collapses to its rail by itself; wide screens keep it. Hovering the rail with a mouse (after 250 ms) or reaching it with Tab opens the full sidebar as an overlay; it closes when the pointer leaves, on Escape or a click outside, and stays while one of its menus is open. Touch uses the toggle only. In the overlay the toggle **pins** the sidebar open (remembered in `klecx-sidebar-pinned`); collapsing it by hand unpins. When the columns close, the person's own choice (the `sidebar` cookie) applies again; the app never writes that cookie by itself. Rules in `lib/layout/sidebar-auto.ts`; the column layout reports `columnsNeedRoom` (`lib/stores/sidebar-auto.ts`).
- **Billing owner:** the workspace owner pays for generations. Voice transcription and read-aloud are billed to the person using them.
- **Ownership transfer** needs the recipient to accept and must fit their plan's member limit. When an owner goes over their member limit: 14-day grace, then the most recently added members are suspended. Nothing is deleted.
- **Refund policy:** cancel anytime; 14-day first-purchase refund if < 20 % of credits used; 7-day refund of a renewal with no usage; errors and duplicate charges always refunded.
- **Legal:** Nigerian law, courts of Lagos State; privacy per the Nigeria Data Protection Act 2023 (plus GDPR rights for EU/UK visitors). The AI provider does not train on data from third-party apps (confirmed 2026-11-08).
- **Locales:** the app chooses the locale by cookie / preference. Per-language marketing URLs come later (main-guide Step 10.7). Keep code ready: one locale registry, next-intl navigation helpers, `buildAlternates`.
