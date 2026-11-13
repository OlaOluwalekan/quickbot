# Open decisions — Klecx

Product decisions the owner has **not** made yet. Each entry says what the code does today, so nothing here blocks a step.

How to use this file:

- **Add** an entry when a review or a step finds a choice that is the owner's to make and the owner hasn't decided. Give it the next number.
- **Don't change the behaviour** described under "Today" until the owner decides. If a step has to touch it, keep the behaviour and say so in the PR.
- **When the owner decides**, implement it in a PR, then delete the entry (record lasting choices under "Key decisions" in `CLAUDE.md`).

Review items that are already decided and only wait for a later step live in `CLAUDE.md` ("Open review items carried forward"), not here.

---

## 1. `@klecx` inside a private Ask thread

- **Found:** 2026-11-10, review of F2.3 (PR #112).
- **Where:** `syncMentionsAndNotes` in `server/services/mentions.ts` (`canShare: false`); the notes list in `server/services/notes.ts`.

**The situation.** A member has a private Ask thread (only they can see it). Inside it they comment on a passage of the answer and write `@klecx …`.

**Today.** The comment stays private (a child can't be more visible than its private parent, an F2.2 rule). A Klecx note **is** recorded. That note is workspace-wide, like every note: its instruction and the quoted passage are sent with later prompts for everyone, and both appear in the "Klecx notes" list that every workspace member can open. "View in context" doesn't work for other members, because they can't open the private thread. `@user` mentions in a private thread are ignored (plain text, no notification).

**Why it's open.** The quoted passage comes from an answer only the author could see, so recording the note shows a piece of a private answer to the whole workspace. But the author explicitly asked Klecx to remember it, and refusing would make `@klecx` unusable in private threads.

**Options.**

| | Option | Effect |
|---|---|---|
| A | Keep it (today) | Works everywhere; the quote of a private answer becomes visible to the workspace. |
| B | Refuse | `@klecx` in a private thread returns an error ("Make the thread visible to the workspace first"). Nothing leaks; one more rule for users to learn. |
| C | Record it without the quote | The note is saved with the instruction only (shown as a general note, "View in context" hidden for others). Nothing private is shown; the note loses the passage it refers to. |
| D | Personal notes | The note applies only to the author's own prompts and is listed only for them. Cleanest privacy; needs a new note scope (schema, prompt loading, UI). |

**If nothing is decided:** stays at A.

---

## 2. Heavily styled Word files, and PDFs, as workspace documents

- **Found:** 2026-11-12, review of F3.1 (PR #118).
- **Where:** `server/files/to-markdown.ts` (`docxToMarkdown`), `lib/documents/workspace-document-types.ts`, `components/markdown/document-image.tsx`.

**The situation.** The goal of documents is: attach a file, work on it with the AI and other members (comments, Asks, quick fixes, edits by hand), then download the corrected document. Everything in that chain (highlights, the AI's context, quick fixes in F3.2/F3.3, exports) works on one Markdown text per document.

**Today.** A `.docx` is converted to Markdown once, at upload. What survives: headings, paragraphs, bold/italic/strikethrough, lists, links, tables (first row becomes the header; merged cells are spread over their columns; several paragraphs in a cell are joined with a line break). What is lost: fonts, colours, sizes, alignment, page layout, headers/footers, footnote layout, text boxes, Word equations, tracked changes and Word comments. Pictures are not imported: each becomes a placeholder box showing its description. The original file is kept and can be downloaded unchanged ("Download original"). The corrected text can be exported as Word/PDF/Markdown with Klecx's own styling, not the original's. **PDFs can't be added as documents** (owner decision 2026-11-12, see `CLAUDE.md`); they can be attached to a message.

**Why it's open.** A user who uploads a branded report gets back a plain document. Whether that matters depends on who the feature is for (drafting and reviewing content, or producing the final formatted file).

**Options.**

| | Option | Effect |
|---|---|---|
| A | Keep it (today) | Content-first. Simple, every feature works on every document. Say so in the UI at upload ("Formatting is simplified; the original file is kept"). |
| B | A + import pictures | Store the file's pictures as attachments and show them in place. Medium work (storage, limits, share pages, exports). Styling is still lost. |
| C | A + "apply to original" on download | On download, write the corrected text back into the original `.docx` paragraph by paragraph, keeping each paragraph's style. Keeps the look for text edits; fragile when paragraphs are added, removed or tables change. Large work; needs its own step. |
| D | Rich-text documents | Store documents as styled HTML (or a block model) instead of Markdown, with a rich editor. Highest fidelity; changes highlights, AI context, quick fixes and exports. A redesign, not a fix. |
| E | PDFs: show the pages, annotate the text | Render the PDF pages with a text layer and anchor highlights to page + text. Faithful view, but a second anchoring model and no editing or corrected download. Only worth it if PDFs must be reviewable. |

**If nothing is decided:** stays at A, PDFs stay blocked. Recommended next step if fidelity matters: B first (cheap, visible), then C as a dedicated step after F3.3.
