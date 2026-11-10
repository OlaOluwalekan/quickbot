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
