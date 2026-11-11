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

**Known migration drift (found 2026-11-09):** the `SupportTicket` model (`support_tickets` table, `TicketStatus` enum) is in `prisma/schema.prisma` but no migration creates it. `prisma migrate deploy` doesn't notice, but `prisma migrate dev` will report drift and propose a migration for it. Fix it in its own PR with a new migration; don't fold it into an unrelated step's migration.

**Open review items carried forward from F2.2 (PR #111, 2026-11-10), F2.4 (PR #113, 2026-11-10), F2.5 (PR #114, 2026-11-11), F2.6 (PR #115, 2026-11-11) and F2.7 (PR #116, 2026-11-11).** When reviewing the step named in each item, check whether it's fixed; if not, fix it in that step's PR. Once that step's review is done and the item is fixed, **delete the item from this file** (and delete this whole block when it's empty).

- **Check in F3.x — Ask context for documents.** `loadAskTarget()` (`server/ai/ask-context.ts`) knows `RESPONSE_VERSION` and `ANNOTATION_MESSAGE`. For `DOCUMENT_REVISION` it only sends the quoted passage. When documents arrive, load the revision's markdown + "Document «title» generated earlier" (and "The user uploaded the document «name»" for uploads).
- **Check in F4.1 — web search in Asks.** Ask answers don't search the web yet (`streamAnnotationAnswer` passes no tool; `buildAskContext`'s `webSearch` option is unused). The citation path is ready: `citation` events are saved on the message and shown by `AnswerBody`. F4.1 must turn search on per the actor's preference and charge the +3 credits.
- **Check in Step 9.5 — account deletion uses `softDeleteUser()`.** `server/services/account-deletion.ts` only does the data part (sets `User.deletedAt`, soft-deletes the person's Klecx notes). Nothing calls it yet and nothing reads `User.deletedAt`: a deleted account can still sign in and is still listed as a member / mentionable. Step 9.5 must build the flow around it (fresh login, revoke sessions, block sign-in, ownership transfer, grace period) and decide what cancelling the deletion restores (the notes carry the same `deletedAt` as the user).
- **Check in F3.x — projects offered when promoting.** "New workspace" in an Ask column lists every project the person belongs to (`GET /api/v1/projects`), including projects where they can only view. Picking one of those ends in a 403 and a toast. The list has no role per project; when F3.x or Step 8.x adds one, offer only projects where the person may create workspaces.
- **Check in F5.1 — untranslated text near Asks.** The question queue popover (`components/workspace/question-queue-popover.tsx`) and the code block header (`components/markdown/code-block.tsx`: "Wrap", "Copy", "Copied", their `title`s) are still hard-coded English; `Response.*` in `es.json` / `fr.json` is still English. (The highlight preview card is translated since F2.6: `Annotations.preview.*`.)

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
- **Billing owner:** the workspace owner pays for generations. Voice transcription and read-aloud are billed to the person using them.
- **Ownership transfer** needs the recipient to accept and must fit their plan's member limit. When an owner goes over their member limit: 14-day grace, then the most recently added members are suspended. Nothing is deleted.
- **Refund policy:** cancel anytime; 14-day first-purchase refund if < 20 % of credits used; 7-day refund of a renewal with no usage; errors and duplicate charges always refunded.
- **Legal:** Nigerian law, courts of Lagos State; privacy per the Nigeria Data Protection Act 2023 (plus GDPR rights for EU/UK visitors). The AI provider does not train on data from third-party apps (confirmed 2026-11-08).
- **Locales:** the app chooses the locale by cookie / preference. Per-language marketing URLs come later (main-guide Step 10.7). Keep code ready: one locale registry, next-intl navigation helpers, `buildAlternates`.
