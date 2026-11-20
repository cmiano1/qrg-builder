# Review and release

The review gate exists so that the file the reviewer reads is the exact file that gets sent. Without it, a guide
gets "one more small fix" after the OK, nobody rereads it, and the error ships under the reviewer's name. With
it, every change after an OK is visible, and the reviewer only rereads what actually changed.

```
 build -> QA -> render -> read pages -> LOCK -> OK List -> reviewer picks -> send copies -> moved by hand
                                         ^                       |
                                         |  "Fix before sending" |
                                         +-- fix, rebuild, QA, render, read pages, relock
```

## 1. Roles

| Role | Does |
|---|---|
| Builder (you, or helper agents) | Builds, checks, renders, and reads pages. Logs questions. |
| Lead (one person or session) | Locks guides, builds the OK List, makes send copies, updates state. Only the lead does these. |
| Reviewer (often the change manager or process owner) | Reads each locked PDF and picks a call on the OK List. |
| Publisher (a person) | Moves send copies to the shared or client location by hand. Never the agent. |

## 2. Render

`node $K/scripts/render_guides.js --set=<id> [NN ...]` renders each live build through Word to PDF and page PNGs in
`review/render/<set>_<NN>_<stamp>/`, with `render.json` (the SHA-256 of the exact file rendered). Read every page.
One Word render runs at a time on the machine (the render lock), and a hung Word stops the run after 5 minutes per
file without killing any Word window you have open.

## 3. Lock

```sh
node $K/scripts/lock_guides.js --check --set=<id>                                   # report only
node $K/scripts/lock_guides.js --how="first build, QA clean, pages read" --set=<id> [NN ...]
```

A lock records the guide code, file name, SHA-256, the render and its page count, the time, and the `--how` note
(how this version was reached). The reviewer sees the note on the OK List. A guide is refused when it has no
render from that exact file, the QA finds anything, it was edited after it was built, it is not in the build log,
or the clean scan finds a blocker. A relock keeps the earlier lock in the lock's history.

Write `--how` so the reviewer knows what to look at: "fix round 2: reviewer comments on steps 4 and 7; Figure 3
recropped".

## 4. OK List

`node $K/scripts/build_ok_list.js` writes `review/QRG OK List - DRAFT <stamp>.xlsx`: one row per guide, with
Status, a PDF link, a Word link, pages, how this version was reached, check these spots, the locked file and hash,
and two input columns, **Your call** and **Your comment**.

- **Done, waiting for OK:** locked and unchanged. The reviewer can pick.
- **Lock broken:** the file changed after it was locked. Relock it before the reviewer picks.
- **Not locked:** still being built or checked.

Optional `review/notes.json` adds what to look at first per guide: `{ "<code>": { "check": "...", "how": "..." } }`.
Optional `review/send_hold.json` keeps a guide out of send copies: `{ "<code>": { "reason": "..." } }`.

**Carry-forward.** Each new sheet copies Your call and Your comment from the newest earlier sheet, but only for a
row whose locked file is the same file. A rebuilt guide comes back blank, with Changed since last sheet = Yes and
the earlier call shown in Check these spots, so the reviewer rereads it. Earlier calls survive a sheet built while
a fix was still in progress. The script stops if the earlier sheet is open in Excel, so unsaved picks are never
left behind. Tell the reviewer to work in the newest sheet only, and to save and close it before the next is built.

## 5. Fix rounds

1. Read the reviewer's comments verbatim (copy them out of the sheet; do not paraphrase from memory).
2. Every comment is handled: done, or skipped with a reason the reviewer will see. None is dropped.
3. When a fix applies to the same guide in other sets, make it there too, unless that guide is frozen (picked OK
   and already copied for sending). List frozen ones for the next round.
4. Where the reviewer gave replacement wording, keep the meaning and fix the typos and grammar.
5. Fix, rebuild, QA, render, read every page, relock with a `--how` that names the round and the comments, and
   build a new OK List.
6. When a reviewer states a rule in a comment ("markers stay in their own section"), apply it to every guide you
   touch, add it to the project's unit addendum or rules, and fold it into the kit if it is general.

With several helper agents in a fix round, write one shared brief (`agent_rules_template.md`) that lists each
helper's guides, the guides that are off limits (being reviewed now, or already OK'd), and the report each helper
returns.

## 6. Send copies

```sh
node $K/scripts/make_send_copies.js --dry          # newest OK List; shows what would be copied and why not
node $K/scripts/make_send_copies.js
node $K/scripts/client_ready_scan.js "<send copy.docx>" ...
```

- Copies only rows picked "OK to send" or "OK to send, note for later" whose lock is current, whose file is still
  the live build with the locked SHA-256, and that are not on hold.
- Names drop the number, status, and stamp: `<prefix> - <Title>.docx` (`review.sendKeepNumber` keeps the number).
- Copies land in `_send/<sendFolder>/` with `send_manifest_<stamp>.json`. A send copy this script made earlier
  (for example the version sent before a fix) moves to `_replaced/` with a stamp; it is never deleted. Any other file
  with the same name stops the run. When a copy replaces one already sent, send the new one too.
- Stop there. Tell the user where the copies are. The user moves them to the shared or client location.

## 7. After release

- "Note for later" comments go in the work log as the next round's list.
- A guide that changes after it was sent goes through the whole gate again (lock, OK List, pick, send copy).
- Keep old builds in `_archive/`, old sheets in `review/`, and replaced send copies in `_replaced/`. They are the
  version history.
