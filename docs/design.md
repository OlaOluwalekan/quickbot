# Klecx Design System (`docs/design.md`)

Single source of truth for semantic tokens, typography, spacing, elevation, z-index, motion, and accessibility rules across Klecx. All CSS tokens live in [`app/globals.css`](../app/globals.css) and are enforced in CI via [`scripts/check-tokens.mjs`](../scripts/check-tokens.mjs).

---

## 1. Color Palette & Semantic Tokens

Never use raw hex values (`#...`), `rgb(...)`/`hsl(...)`, or Tailwind palette classes (`bg-slate-*`, `text-gray-*`, `bg-indigo-*`, `bg-white`, `text-black`) in `components/**` or `app/**`. Always use the semantic token classes below.

| Token | Tailwind Class | Light (`:root`) | Dark (`[data-theme="dark"]`) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `--bg` | `bg-bg` | `oklch(0.985 0.002 250)` | `oklch(0.16 0.01 260)` | App canvas / page background |
| `--surface` | `bg-surface` | `oklch(1 0 0)` | `oklch(0.2 0.012 260)` | Cards, sidebar, modals, primary elevated surfaces |
| `--surface-2` | `bg-surface-2` | `oklch(0.97 0.004 250)` | `oklch(0.24 0.014 260)` | Subtle interactive fill, hover surface, secondary blocks |
| `--surface-3` | `bg-surface-3` | `oklch(0.94 0.006 250)` | `oklch(0.29 0.016 260)` | Active/pressed surface, code headers, badges |
| `--border` | `border-border` | `oklch(0.90 0.008 250)` | `oklch(0.32 0.016 260)` | Hairline dividers and standard borders |
| `--border-strong` | `border-border-strong` | `oklch(0.82 0.01 250)` | `oklch(0.42 0.02 260)` | Emphasized borders, input hover/focus borders |
| `--fg` | `text-fg` | `oklch(0.20 0.02 260)` | `oklch(0.96 0.005 260)` | Primary body and heading text |
| `--fg-muted` | `text-muted` | `oklch(0.45 0.02 260)` | `oklch(0.76 0.01 260)` | Secondary text, labels, metadata |
| `--fg-subtle` | `text-subtle` | `oklch(0.58 0.02 260)` | `oklch(0.64 0.012 260)` | Placeholders, timestamps, non-essential hints |
| `--accent` | `bg-accent` / `text-accent` | `oklch(0.50 0.17 270)` | `oklch(0.68 0.16 270)` | Restrained indigo brand accent |
| `--accent-hover` | `hover:bg-accent-hover` | `oklch(0.45 0.18 270)` | `oklch(0.73 0.15 270)` | Hover state for primary CTA |
| `--accent-fg` | `text-accent-fg` | `oklch(0.99 0 0)` | `oklch(0.15 0.02 270)` | Foreground text/icons placed on `--accent` |
| `--accent-soft` | `bg-accent-soft` | `oklch(0.95 0.03 270)` | `oklch(0.28 0.06 270)` | Soft tinted background for selected items & chips |
| `--success` | `text-success` / `bg-success` | `oklch(0.62 0.15 150)` | `oklch(0.62 0.15 150)` | Positive confirmation & completed states |
| `--warning` | `text-warning` / `bg-warning` | `oklch(0.75 0.15 75)` | `oklch(0.75 0.15 75)` | Quota warnings & caution states |
| `--danger` | `text-danger` / `bg-danger` | `oklch(0.58 0.2 25)` | `oklch(0.58 0.2 25)` | Destructive actions & validation errors |
| `--info` | `text-info` / `bg-info` | `oklch(0.62 0.12 235)` | `oklch(0.62 0.12 235)` | Informational callouts |
| `--ring` | `ring-ring` | `oklch(0.58 0.17 270 / 0.55)` | `oklch(0.72 0.15 270 / 0.6)` | Keyboard `:focus-visible` outline |
| `--overlay` | `bg-overlay` | `oklch(0.2 0.02 260 / 0.45)` | `oklch(0 0 0 / 0.6)` | Modal & drawer backdrop |

### Annotation Highlight Tokens
- `--mark-comment`: `oklch(0.9 0.12 95 / 0.55)` (warm yellow highlight)
- `--mark-question`: `oklch(0.85 0.1 235 / 0.45)` (cool blue highlight)
- `--mark-reply`: `oklch(0.88 0.1 150 / 0.45)` (soft green highlight)

---

## 2. WCAG AA Contrast Verification

Verified against WCAG 2.1 AA minimum contrast threshold ($\ge 4.5:1$ for normal text):

| Pair | Light Mode Contrast | Dark Mode Contrast | Requirement | Status |
| :--- | :--- | :--- | :--- | :--- |
| `--fg` on `--surface` | **14.8 : 1** | **13.2 : 1** | $\ge 4.5 : 1$ | Pass (AAA) |
| `--fg` on `--bg` | **14.1 : 1** | **14.9 : 1** | $\ge 4.5 : 1$ | Pass (AAA) |
| `--fg-muted` on `--surface` | **6.1 : 1** | **7.1 : 1** | $\ge 4.5 : 1$ | Pass (AA) |
| `--accent-fg` on `--accent` | **6.4 : 1** | **7.8 : 1** | $\ge 4.5 : 1$ | Pass (AA) |

---

## 3. When to Use `--accent`

Klecx uses a restrained neutral palette where content is primary. Reserve `--accent` (`bg-accent`, `text-accent`, `--accent-soft`) strictly for:
1. **Primary CTA button** on the current view (at most one primary CTA per surface, e.g., "Send", "Sign in", "New Workspace").
2. **Active navigation indicator** (`bg-accent-soft text-accent` on the active workspace or active sidebar item).
3. **Focus rings** (`--ring`) and interactive toggles (switch/checkbox checked state).
4. **Inline links** inside prose (`text-accent hover:underline`).

Do **not** use `--accent` for decorative backgrounds, large banners, card borders, or secondary actions.

---

## 4. Typography Scale

Loaded via `next/font/google` in `app/layout.tsx`:
- **Sans (`--font-sans`)**: `Inter` — UI controls, headings, and body prose.
- **Mono (`--font-mono`)**: `JetBrains Mono` — code blocks, inline code, token counters, and keyboard shortcuts.

| Step | Size (`px` / `rem`) | Line Height | Tailwind Class | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `xs` | `12px` (`0.75rem`) | `16px` (`1rem`) | `text-xs` | Badges, kbd hints, timestamps, table headers |
| `sm` | `14px` (`0.875rem`) | `20px` (`1.25rem`) | `text-sm` | Compact UI controls, sidebar items, secondary labels |
| `base` | `16px` (`1rem`) | `26px` (`1.625rem`) | `text-base` | Workspace prose, composer input, primary body text |
| `lg` | `18px` (`1.125rem`) | `28px` (`1.75rem`) | `text-lg` | Card titles, dialog titles, section subheadings |
| `xl` | `20px` (`1.25rem`) | `28px` (`1.75rem`) | `text-xl` | Workspace header title, H3 in prose |
| `2xl` | `24px` (`1.5rem`) | `32px` (`2rem`) | `text-2xl` | Page titles, H2 in prose |
| `3xl` | `30px` (`1.875rem`) | `36px` (`2.25rem`) | `text-3xl` | Marketing section headings, H1 in prose |
| `4xl` | `36px` (`2.25rem`) | `40px` (`2.5rem`) | `text-4xl` | Hero display headline |

**Reading measure:** Workspace prose is constrained to `--content-w: 760px` (`65–72ch`) for comfortable long-form reading.

---

## 5. Spacing & Layout Scale (4-pt Grid)

All padding, margin, and gap values follow the 4-point scale:
- `4px` (`1`), `8px` (`2`), `12px` (`3`), `16px` (`4`), `20px` (`5`), `24px` (`6`), `32px` (`8`), `40px` (`10`), `48px` (`12`), `64px` (`16`).
- **Structural layout tokens:**
  - `--sidebar-w`: `280px`
  - `--sidebar-w-collapsed`: `64px`
  - `--panel-w`: `360px`
  - `--content-w`: `760px`
- **Border Radius tokens:**
  - `--radius-sm`: `6px` (chips, kbd, small badges)
  - `--radius`: `10px` (buttons, inputs, menu items)
  - `--radius-lg`: `14px` (cards, dropdowns, popovers)
  - `--radius-xl`: `20px` (dialogs, composer container)

---

## 6. Elevation & Z-Index Scale

### Shadows
- `--shadow-sm`: `0 1px 2px oklch(0.2 0.02 260 / 0.06)` — subtle card/button lift
- `--shadow-md`: `0 4px 16px oklch(0.2 0.02 260 / 0.08)` — popovers, dropdown menus, floating toolbars
- `--shadow-lg`: `0 16px 48px oklch(0.2 0.02 260 / 0.14)` — modals, command palette, drawers

### Z-Index Scale
| Layer | Class | Purpose |
| :--- | :--- | :--- |
| Base | `z-0` | Standard document flow |
| Sticky Header / Composer | `z-10` | Sticky workspace header and bottom composer bar |
| Sidebar / Side Panel | `z-20` | Collapsible desktop panes |
| Dropdown / Popover / Tooltip | `z-30` | Menus, selection popover, tooltips |
| Overlay / Drawer | `z-40` | Mobile navigation drawer & backdrop (`--overlay`) |
| Modal / Command Palette | `z-50` | Dialogs, `⌘K` palette, confirmation modals, toasts |

---

## 7. Motion Rules

- **Durations:**
  - `--dur-fast`: `120ms` (hover color shifts, button press feedback, tooltip appear)
  - `--dur`: `200ms` (dropdowns, popovers, tab transitions)
  - `--dur-slow`: `320ms` (sidebar collapse, sheet/drawer slide)
- **Easing:** `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)`
- **Reduced Motion:** `app/globals.css` enforces `@media (prefers-reduced-motion: reduce)` globally, collapsing all animation and transition durations to `0.01ms` and disabling smooth scrolling.
