# Shared brief for helper agents (template)

Use this when several helper agents build or fix guides at the same time. Copy it into the project's `_work/`
folder, fill in the angle brackets, and give every helper the same file plus its own scope line. A helper starts
fresh: this brief is all it knows, so name every path.

---

# <Round name>: shared brief for every helper (<MM/DD/YYYY>)

Project root: `<abs path>`. Kit: `<abs path to qrg_kit>` (called `$K` below). Deadline: <date and time>.
Read `<skill>/references/content_rules.md`, `screenshot_rules.md`, and `definition_of_done.md`, and the unit
addendum for your set(s), before you write anything.

## 1. Source of truth

- <the reviewer's comments, verbatim, and where to read them; or the task list and sources for a first build>
- Every comment is handled: done, or skipped with a reason in your report. Do not drop any.
- <process owner answers that govern this round, quoted>

## 2. Your scope

| Helper | Guides |
|---|---|
| <name> | <set id NN, ...; plus the same fix in <other sets> where the same problem exists> |

"Where the same problem exists" means: read the sibling guide and its rendered pages; fix the same text, marker,
or missing screenshot. Do not rewrite a sibling that is already right. Report each sibling as changed, or
"checked, no change needed" with the reason.

## 3. Do not touch

- Guides off limits this round: <being reviewed now; picked OK and copied for sending>. If your fix applies to one,
  list it in your report under "Later pass".
- Guides other helpers own right now: <list>.
- `review/` (locks, OK List sheets, send copies), the state files, the work log, and `qrg.config.json`: the lead does
  locks, the OK List, send copies, and state updates.
- Anything outside the project folder. No cloud writes, email, or chat.
- Never hand-edit a `.docx`. Never use `--allow-rebuild-over-edits` (or `ALLOW_REBUILD_OVER_EDITS=1`); if the guard
  stops a build, stop that guide and report it. Never kill desktop LibreOffice, Word, or Excel.
- Never `require()` a build script (it runs a build); syntax-check with `node --check`.

## 4. Shared files and locks

- Each guide file `guides/NN.js` and its `assets/<key>NN/` folder has one owner (you, for your scope). Edit those
  directly.
- Any shared file (`qrg.config.json`, `lib/`, a helper used by several guides) is edited only under the build lock:
  `node $K/scripts/with_lock.js build node <your edit script.js>`. Prefer reporting the change to the lead.
- Builds and renders take their own locks (`build_qrgs.js`, `render_guides.js`). `proof_guides.js` runs offline
  in-process and needs no lock. Keep each job short (4 guides or fewer), so other helpers are not kept waiting.
- Put your working files under `_work/<round>/<your name>/`.
- Check free disk space before pulling many frames; stop below <N> GB and report it.

## 5. Per guide

Brief, screenshots, guide file, scratch build and QA, render and read every page, live build and QA, proof, render
and read every page (SKILL.md, the per-guide loop). Add a dated note at the top of the guide file:
`// Updated <MM/DD/YYYY> (<round>): <what changed>; sources: <recording, time, shown or stated>.`
Do not rewrite older history lines.

## 6. Your report

Write `_work/<round>/reports/<your name>.md`, per guide:
- New live file name, page count (old to new), render folder.
- Each comment: done, partly, or skipped, and how.
- Facts added, each labeled shown (source, time, frame checked) or stated (who).
- Screenshots skipped because no source shows the click.
- Proof flags: fixed, or false positive.
- Later pass (frozen guides with the same problem).
- Questions, few and specific, grouped by who answers.

End your final message with a 5-line summary. Do not lock guides: the lead locks them after reading your report and
the rendered pages.
