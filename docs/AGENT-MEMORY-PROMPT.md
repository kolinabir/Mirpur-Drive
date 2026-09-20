# Paste-ready onboarding prompt: how any agent should use memory here

Paste everything between the lines into a fresh session, a subagent, or any
new assistant working on this repo. It teaches where durable knowledge lives
and how to add to it. Nothing below depends on chat history surviving.

---

## Memory rules for this project

You are working in the repository root
(Mirpur 3D). This project assumes any session can end mid-task, so NOTHING
important may live only in a conversation. There are two memory stores and
they are not interchangeable.

### 1. Repo docs — the shared, permanent record (default; commit these)

Anything about the WORLD, the CODE, or a DECISION goes in `docs/`. Read in
this order before you touch anything:

1. `docs/HANDOFF.md` — start here, always. What the project is, how to run
   it, the file-by-file map, the working arrangement, the pass history table.
2. `docs/PAUSE-STATE.md` and `docs/RESUME-PROMPT.md` — where the last
   session stopped and how to pick up.
3. `docs/briefs/*.md` — one brief per work pass: the measured facts, the
   contract, the acceptance tests, and the file fences for that pass. If a
   brief exists for what you are doing, it is authoritative; do not
   re-derive constants it already measured.
4. The topic doc for whatever you are touching (`docs/METRO-REVIEW.md`,
   `docs/INTERIOR-PASS.md`, `docs/WALKABLE-INTERIOR-DESIGN.md`,
   `docs/TRAIN-INTERIOR.md`, `docs/PLATFORM-HEIGHT.md`, …).
5. `reference/**` — real-world photos and specs. Owner photos beat SPECs
   where they conflict (`reference/metro/OWNER-PHOTOS-2026-09-07.md`).
   Anything under a `refonly/` folder is LOOK-ONLY: never shipped, never
   used as a texture, never committed.

When you finish a pass, write what you did into its topic doc and append one
row to the table in `docs/HANDOFF.md`. Record what is still WRONG as
honestly as what works — an unrecorded known bug costs the next agent a day.

### 2. Claude's own memory directory — cross-session facts about the work

`~/.claude/projects/<this-project-slug>/memory/`

This is local to this machine and is NOT committed. Use it only for things
that would not make sense in the repo: who the owner is and how they like to
work, standing corrections they have given you, and pointers to outside
resources. One fact per file:

```markdown
---
name: short-kebab-case-slug
description: one line, used to decide whether to recall this later
metadata:
  type: user | feedback | project | reference
---

The fact itself. For feedback/project, follow with **Why:** and
**How to apply:** lines. Link related memories with [[their-name]].
```

Then add ONE line to `MEMORY.md` in that directory:
`- [Title](file.md) — hook`. `MEMORY.md` is an index only; never put the
content itself there.

- `user` — who the owner is, their expertise, their preferences.
- `feedback` — how they want you to work, corrections and confirmed
  approaches, always with the reason.
- `project` — goals and constraints not derivable from the code or git log.
  Convert relative dates to absolute ones ("today" is worthless later).
- `reference` — links to dashboards, sources, tickets.

### What NOT to store

Do not write a memory for anything the repo already records: code structure,
past fixes, git history, or what a doc in `docs/` says. Do not store what
only matters inside one conversation. Before saving, check for an existing
file that covers it and UPDATE that instead of creating a near-duplicate;
delete memories that turn out to be wrong.

### How to treat what you recall

Recalled memories describe what was true WHEN WRITTEN. If one names a file,
a constant, a function or a flag, verify it still exists before you act or
advise on it — this codebase gets rebased under itself (constants have been
renamed and levels re-based between passes). Repo docs beat memories; the
running code beats both.

### Working arrangement

Opus/Fable acts as advisor: diagnoses, measures, writes the brief, reviews.
Sonnet acts as executor: makes the change, verifies it in a real browser
with screenshots, writes the doc, reports back. Every pass declares FILE
FENCES — the files it may touch — and respects everyone else's. Never
`git commit` unless the owner asks. There are frequently uncommitted owner
edits in the working tree: never revert or reformat them.

---
