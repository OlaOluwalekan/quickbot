# CLAUDE.md — Klecx

Context for Claude Code sessions in this repository. Read this first, then the guides listed below.

## What this is

**Klecx** is an AI workspace app (workspaces, projects, response versions, passage annotations, collaboration). **Klecx is a product of Vyraxity, Lagos, Nigeria.** Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, next-intl (`en`, `es`, `fr`), TanStack Query + Zustand, shadcn/ui, Cloudinary, Resend, Upstash Redis. Billing will use Creem (merchant of record).

## The plan — two guides, in this order

1. `Klecx_Implementation_Guide_v2.md` — the main guide. **Done up to Step 8.1** (plan catalog, entitlements, subscription schema).
2. `quick_implementation_fix_for_v2.md` — the **interlude** (steps `F0.1` → `F5.10`). **Done** (it came before main-guide Step 8.1).
3. Then main-guide Steps **8.1 → 10.6**. Read each step's **"↳ After the interlude"** block, which changes the step. Step 10.7 (per-language marketing URLs) comes after launch.

Each step = one PR. Implement **only** the step you were asked for. Follow its _Update / Create / Schema / Env / i18n / Done when_ fields. If the code disagrees with a guide (paths, names), check the live code, follow its intent, and say so in the PR.

## Workflow

- The owner uses **Google Antigravity** to implement a step and opens a PR. **Claude reviews the PR** against the guides and the rules below, fixes problems, and pushes to **that PR's branch**.
- **`dev` is the default branch.** Create new branches from the latest `origin/dev` (e.g. `fix/F1-2-member-capabilities`, `step/8-1-plan-catalog`).
- **Never merge PRs and never push to `dev` or `main`.** The owner merges. Don't open a PR unless asked.
- Before pushing, run the checks below on what changed. For a review, list what you found, what you fixed, and anything left for the owner.

## Steps that need the Creem dashboard (owner's request, 2026-11-19)

The owner has not used Creem (creem.io, the payment provider) before. **Whenever a step needs something done in the Creem dashboard, tell the owner at the start of that step, before writing code, and guide them step by step.** This covers at least: Step 8.2 (create the store and the 6 products in **test mode**, copy the product IDs and the test API key), Step 8.3 (register the webhook URL, copy the signing secret, a tunnel for local testing), Step 8.5 (checkout and customer-portal settings, the consent to immediate start for EU/UK buyers), Step 8.6 (the store review / live-payments application) and going live in Phase 10 (live products, live API key, live webhook). Each time:

1. Say **what** has to be done in Creem and **why** this step needs it.
2. Give **numbered steps**: where to click, what to type, what to choose. Read `docs.creem.io` first (the dashboard changes; don't rely on memory or the guide's wording) and say when a label might be different.
3. Say **which values to copy** and **where they go**: the exact env variable names (`CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_PRODUCT_*`…) in `.env.local` and the hosting provider's secret settings. **Never ask for secrets in chat** and never commit them.
4. Always **test mode first**; live mode only at Step 8.6 / Phase 10, and only when the owner says so.
5. Say how to check it worked, and what to send back (e.g. "tell me when the product IDs are in `.env.local`").

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

**Open review items carried forward from F2.2 (PR #111, 2026-11-10), F2.4 (PR #113, 2026-11-10), F2.5 (PR #114, 2026-11-11), F2.6 (PR #115, 2026-11-11), F2.7 (PR #116, 2026-11-11), F3.3 (PR #120, 2026-11-13), Step 8.1 (2026-11-19), F5.1 (PR #131, 2026-11-16), F5.2 (PR #134, 2026-11-16), F5.4 (2026-11-18), F5.5 (2026-11-18), F5.8 (2026-11-16) and F5.9 (2026-11-18).** When reviewing the step named in each item, check whether it's fixed; if not, fix it in that step's PR. Once that step's review is done and the item is fixed, **delete the item from this file** (and delete this whole block when it's empty).

- **Check in Step 8.5 — where the plan buttons point** (from Step 8.1). The credits card's **Upgrade / Manage** button and the **Upgrade** links of plan gates (`<Gated>`, the composer's image notice) show only while `BILLING_ENABLED` is on and point at `PLAN_UPGRADE_HREF` / `PLAN_MANAGE_HREF` in `lib/billing/links.ts`, both `/pricing` today. When the billing section of Settings exists, point `PLAN_MANAGE_HREF` (and the Settings credits card, which hides its button with `showPlanAction={false}`) at it.
- **Check in the next step that touches regeneration or the response card (Step 10.5 at the latest) — Regenerate keeps the version's model** (found in F5.7, owner decided 2026-11-18). Today the **Regenerate** button sends no model and the server defaults to `text-economy` (`regenerateResponseSchema` in `lib/schemas/response.ts`), so regenerating a **Standard Reasoning** answer gives a **Fast & Efficient** version. Decided: regenerate with the **model of the version being regenerated**; if the workspace owner's plan no longer includes that model, fall back to Fast & Efficient. Send the version's model with the regenerate request and check it on the server against the owner's plan (rule 1), update the help article `regenerate-vs-edit` (it says "Fast & Efficient" today) in `en`, `es` and `fr`, add a test, and record the choice under "Key decisions".
- **Check in Steps 8.4 and 8.5 — help articles while billing goes live** (from F5.7). Help articles fill in product numbers from `PLANS` and the model catalog (`productTokens()` in `lib/help/articles.ts`: `{{plan.LITE.credits}}`, `{{credits.fast}}`…) and show text only when billing is on or off with `{{#billing}}…{{/billing}}` / `{{^billing}}…{{/billing}}`. With billing off, `credits-and-plans` says every account **starts** with 100 credits (Free credits are a one-time grant today) and `billing-and-cancellation` says paid plans are launching soon. Step 8.4: when Free credits renew monthly, say so in the billing-off text of `credits-and-plans`. Step 8.5: write the billing-on text of `billing-and-cancellation` (subscribe, change plan, cancel, the refund policy from "Key decisions") and check the billing-on plan table in `credits-and-plans`, in `en`, `es` and `fr`.
- **Check in Step 8.5 — paid plans in the structured data once billing is live** (from F5.9). While `BILLING_ENABLED` is off, `SoftwareApplicationJsonLd` in `components/seo/json-ld.tsx` lists **only the Free plan** as an offer for search engines (the paid plans are "coming soon"); the filter is `site.billingEnabled || plan.priceMonthly === 0`. When Step 8.5 sets `BILLING_ENABLED=true`, check on the running site that the page source lists **every plan** (Free, Lite, Standard, Pro) with its translated name and price, and that the test "offers only the Free plan while billing is off" in `__tests__/fix-F5-9-seo-localized.test.ts` still has a billing-on counterpart (every plan listed). If plans or prices move to Creem, read the offers from the same source as the pricing page.
- **Check in Step 9.5 — account deletion uses `softDeleteUser()`.** `server/services/account-deletion.ts` only does the data part (sets `User.deletedAt`, soft-deletes the person's Klecx notes). Nothing calls it yet and nothing reads `User.deletedAt`: a deleted account can still sign in and is still listed as a member / mentionable. Step 9.5 must build the flow around it (fresh login, revoke sessions, block sign-in, ownership transfer, grace period) and decide what cancelling the deletion restores (the notes carry the same `deletedAt` as the user).
- **Check in Step 9.2 — React warning "Encountered a script tag while rendering React component"** (found in F5.1). It appears in the browser console on every page. Its source is `next-themes`' `<ThemeProvider>` in `app/layout.tsx`, which renders an inline `<script>` to set the theme before paint; React 19 warns when such a script renders on the client. Step 9.2 reworks theme sync: fix it there (a `next-themes` version that avoids the warning, or set the theme class from the server/cookie with a script in `<head>` outside the React tree), and check the console is clean.
- **Check in the next step that changes the composer or the home page (Step 10.5 at the latest) — hydration mismatches** (found in F5.1, also seen by the owner locally). Next.js reports "Hydration failed because the server rendered HTML didn't match the client". Confirmed source: the voice button in `components/workspace/voice-input.tsx` computes `isSupported = isVoiceSupported()` during render, so the server renders the `<Gated>` "unsupported_browser" state and the browser renders the real button. Fix it by assuming "unknown" on the server and the first client render (e.g. `useSyncExternalStore` with a server snapshot, or a mounted flag), then switching. Also check other render-time `Date` / time-zone values that differ between server and browser (e.g. "Today" / date buckets in `lib/i18n/use-activity-date.ts` and the sidebar). Open every main page with the dev overlay and make sure no "Issues" remain.
- **Check in Step 9.5 — legal text when self-service export and deletion exist** (from F5.5). The Privacy Policy (`rights` section) and the Terms (`termination` section) say export and account deletion aren't in Settings yet and point to `{privacyEmail}` / `{supportEmail}`. When Step 9.5 ships them, rewrite those paragraphs in `en`, `es` and `fr` and bump `Legal.updatedAt`.
- **Check in Step 10.3 — the deleted-workspace clean-up the Privacy Policy promises** (from F5.5). The Privacy Policy (`retention`) says deleted workspaces are "hidden immediately and permanently removed in a scheduled clean-up". Today a deleted workspace only gets `deletedAt`; nothing removes it. The purge job in Step 10.3 makes that sentence true: build it, and if it keeps workspaces restorable for a while first (e.g. 30 days), say so in the policy.
- **Check in Step 10.3 — delete support screenshots after 90 days** (from F5.8). Add the job: find `SupportAttachment` rows older than `SUPPORT_SCREENSHOT_RETENTION_DAYS`, delete the file from storage (`storage.delete(providerId, { resourceType: "image" })`), then the row. Index `support_attachments(created_at)` exists for it. Until the job exists, nothing deletes them.

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
- **Web search** is a tool the model calls when needed. It's on by default for all plans (Free included) and costs +3 credits per executed search, with a daily cap. The cap is counted **per person, per owner** (decided 2026-11-14): the limit is the workspace owner's plan `searchesPerDay`, and only that person's searches in that owner's workspaces count toward it (`countSearchesToday(actorId, billedAccountId)`), so searching in someone else's workspace never uses up the searches of your own. It can be turned off in Settings. AI response language is a Settings preference (Auto by default), not a composer control.
- **Deleting an account is a soft delete** (decided 2026-11-11): the `users` row stays with `deletedAt` set, and the Klecx notes that person wrote are soft-deleted too (`WorkspaceNote.deletedAt`): hidden from the notes list, the annotation marks and later prompts. No row is removed.
- **Workspace documents** (decided 2026-11-12): MD, TXT, DOCX and CSV files can be added to a workspace as a document. **PDFs can't** (only their text can be extracted, the layout is lost and the result can't be edited and downloaded as a corrected file); a PDF can still be attached to a message. A workspace holds **at most 3 documents** (`MAX_WORKSPACE_DOCUMENTS`): each one is sent with every prompt and never dropped from the context, so the cap bounds input tokens. The type list and the cap live in `lib/documents/workspace-document-types.ts`; the server enforces both. A document is stored as Markdown (the working copy for highlights, the AI and edits); the original file is kept for download. Document text is rendered with `<Markdown variant="document">`: HTML inside it is rendered after sanitizing, and images that can't be shown become a placeholder box with their description. What happens to heavily styled files is open: `OPEN_DECISIONS.md` §2.
- **Review comments and quick fixes** (decided 2026-11-13): "Ask Klecx to review" leaves comments written by Klecx (`authorType = AI`), each on an exact passage, shown as a wavy underline. Hovering a passage shows what is wrong and, when there is a replacement, the change (old → new) with **Accept** and **Dismiss** for that one change; "Accept all fixes" on the card takes every open fix at once. Accept only changes the unsaved draft; the fix is recorded as accepted when the text is saved (`acceptedSuggestionIds`), never directly. A fix whose passage changed becomes `STALE`. Text with unsaved changes can't be commented on or asked about until it is saved (the server only knows the saved text). A review costs credits once (owner pays) and reads the saved text.
- **Question queue answers** (decided 2026-11-13): "Ask all" opens **one column** next to the conversation (`?thread=b:<generationId>`, `components/threads/batch-column.tsx`) with every queued question and its answer, like "Ask now". It is still one model call. Each answer stays attached to its own question, so it can be highlighted and continued in its own thread. The old right panel is no longer opened by the queue.
- **Document download** (decided 2026-11-13): a document's Download menu offers the **original file** (as uploaded) and the **edited version** (the saved text, as Word, PDF or Markdown, per the plan's export formats). The edited version of an uploaded document carries no model, version or workspace link.
- **Function duration** (decided 2026-11-13): API routes may run up to **300 s** (Vercel Hobby with Fluid compute). The limit is set in **one place**, `vercel.json` (`functions["app/api/**/*"].maxDuration`). Don't add `export const maxDuration` to a route: it would override that value for the route, and Next.js only reads it as a literal, so it can't come from a shared constant or an env variable. `MAX_FUNCTION_SECONDS` in `lib/annotations/limits.ts` mirrors it for code that must know the limit (an Ask answer counts as interrupted after it + 60 s): change both together.
- **Download formats follow the owner's plan** (decided 2026-11-14): which formats (Markdown / PDF / Word) a workspace's members may download comes from the **workspace owner's** plan, for every download (responses, whole workspace, uploaded and generated documents). The owner invites the members, so their plan applies. Word/PDF also need `workspace.export`. The server checks it in `assertExportAllowed()` (`server/documents`); the UI greys formats out with `exportFormatGateReason()` from `GET /api/v1/workspaces/:id` → `exportFormats` (non-owners see "the workspace owner's plan doesn't include this", without an upgrade link). The daily export cap is counted per downloader.
- **Auto-closing sidebar** (decided 2026-11-14): when the open columns don't fit beside the expanded sidebar (main ≥ 480 px + up to two columns ≥ 420 px), the sidebar collapses to its rail by itself; wide screens keep it. The decision uses the column area's **right edge** minus the expanded sidebar width, never the current width (which changes when the sidebar collapses and would flip the decision back: an update loop). **Whenever the sidebar is a rail** (collapsed by the app or by the person), hovering it with a mouse (after 250 ms) or reaching it with Tab opens the full sidebar as an overlay; it closes when the pointer leaves, on Escape or a click outside, and stays while one of its menus is open. Touch uses the toggle only. The toggle in the overlay ("Keep sidebar open") expands it; while columns need the room that also **pins** it (remembered in `klecx-sidebar-pinned`); collapsing it by hand unpins. When the columns close, the person's own choice (the `sidebar` cookie) applies again; the app never writes that cookie by itself. Rules in `lib/layout/sidebar-auto.ts`; the column layout reports `columnsNeedRoom` (`lib/stores/sidebar-auto.ts`).
- **Billing owner:** the workspace owner pays for generations. Voice transcription and read-aloud are billed to the person using them.
- **Collaborator limits** (decided 2026-11-14, built in Step 8.1): Free and Lite **0**, Standard **1**, Pro **3**, counted as **distinct people across all of the owner's workspaces and projects** (active members + people with a live pending invitation), never per workspace. Inviting someone who already holds a seat to another workspace is always allowed. One source: `getOwnerCollaborators()` / `getInviteCapacity()` in `server/services/member-limits.ts`, used by the invite check, the Share dialog's gate and `checkTransferFits()` (which adds the recipient's existing collaborators).
- **Ownership transfer** needs the recipient to accept and must fit their plan's member limit. When an owner goes over their member limit: 14-day grace, then the most recently added people are suspended (all their memberships with that owner; "Keep active" people stay first). Nothing is deleted.
- **Effective plan** (Step 8.1, `resolveSubscriptionPlan()` in `server/billing/entitlements.ts`): ACTIVE/TRIALING → the plan; PAST_DUE → the plan for 3 days after the period end, then Free; CANCELED with `cancelAtPeriodEnd` → the plan until the period end; EXPIRED/PAUSED/DISPUTED → Free. **DISPUTED also freezes the account's credits** (`reserve()` throws `billing_frozen`). No subscription row → `DEV_DEFAULT_PLAN` (never in production) → Free.
- **Daily credit cap and concurrent AI calls** (Step 8.1): checked in `reserveForWorkspaceGeneration()` (answers, Asks, the question queue, reviews) on the **workspace owner's account and plan**, so members' spending counts. Concurrent = reservations not yet settled or released in the last `ANSWER_STALE_MS` (a crashed call stops counting after it). Errors: 429 `daily_cap_reached` / `too_many_concurrent`. Voice transcription has its own daily seconds limit.
- **Refund policy:** cancel anytime; 14-day first-purchase refund if < 20 % of credits used; 7-day refund of a renewal with no usage; errors and duplicate charges always refunded.
- **Legal:** Nigerian law, courts of Lagos State; privacy per the Nigeria Data Protection Act 2023 (plus GDPR rights for EU/UK visitors). The AI provider does not train on data from third-party apps (confirmed 2026-11-08).
- **Locales:** the app chooses the locale by cookie / preference. Per-language marketing URLs come later (main-guide Step 10.7). Keep code ready: one locale registry, next-intl navigation helpers, `buildAlternates`.
