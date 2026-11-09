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
- **`@mentions`** notify members. **`@klecx`** creates a workspace note that's added to later prompts; no immediate AI call.
- **Web search** is a tool the model calls when needed. It's on by default for all plans (Free included) and costs +3 credits per executed search, with a daily cap. It can be turned off in Settings. AI response language is a Settings preference (Auto by default), not a composer control.
- **Billing owner:** the workspace owner pays for generations. Voice transcription and read-aloud are billed to the person using them.
- **Ownership transfer** needs the recipient to accept and must fit their plan's member limit. When an owner goes over their member limit: 14-day grace, then the most recently added members are suspended. Nothing is deleted.
- **Refund policy:** cancel anytime; 14-day first-purchase refund if < 20 % of credits used; 7-day refund of a renewal with no usage; errors and duplicate charges always refunded.
- **Legal:** Nigerian law, courts of Lagos State; privacy per the Nigeria Data Protection Act 2023 (plus GDPR rights for EU/UK visitors). The AI provider does not train on data from third-party apps (confirmed 2026-11-08).
- **Locales:** the app chooses the locale by cookie / preference. Per-language marketing URLs come later (main-guide Step 10.7). Keep code ready: one locale registry, next-intl navigation helpers, `buildAlternates`.
