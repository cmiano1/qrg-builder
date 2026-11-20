---
name: qrg-builder
description: Build and release Quick Reference Guides (QRGs) as Standard US Letter Word (.docx) Working Deliverables and Final Deliverables from recordings, screenshots, and notes. Use to set up a QRG project, author or revise a Guide Source, annotate screenshots, run QA and offline proofing, generate visual Renders (LibreOffice + pure-Node PNGs), apply SHA-256 Review Locks, review in the Local Browser Review UI or .xlsx OK List, or stage Send Copies (.docx default plus optional PDF). Triggers: "QRG", "quick reference guide", "job aid", "work instruction", "how-to guide for end users", "OK List", "Browser Review UI", "Send Copies".
---

# QRG Builder

One QRG = one task, one Standard US Letter Word file (`8.5 x 11 in`), written for one role. The Kit in `kit/` builds
every Working Deliverable from a Guide Source plus annotated screenshots, verifies Google Docs compatibility and writing
rules, runs offline spelling and grammar proofing, generates visual Renders, and enforces SHA-256 Review Locks so only
the exact approved build becomes a Send Copy.

Works identically on Windows, macOS, and Linux in Claude Code, Antigravity, Codex, Cursor, or standalone Node.js CLI with
zero paid Microsoft Office or admin-install requirements.

## Ground rules (always)

- **Draft locally, publish by hand.** Write only inside the project folder. Never write to a shared drive, Google
  Workspace, email, or chat. Stage Final Deliverable Send Copies in `_send/`; a person delivers them.
- **Facts only.** Include a step only when it is shown (frame or live screen verified) or stated (process owner
  confirmed). Leave unconfirmed items out and log specific questions in `_QRG work log.md`. Never hedge in a QRG.
- **Generator is master.** Edit the Guide Source (`guides/NN.js`), never a built `.docx`. `build_qrgs.js` stops if a
  live `.docx` was edited after its build; diff it, fold every edit into the Guide Source, then rebuild with
  `--allow-rebuild-over-edits` (`references/lessons_learned.md`).
- **House style and dates.** Standard US Letter (`8.5 x 11 in`, `1 in` margins, `Calibri`), American English, plain
  words, bold on-screen labels, zero em or en dashes. **Zero dates inside evergreen QRGs** (no "Last updated" line);
  use `MM/DD/YYYY` only in work logs, briefs, and state files. Live file names: `{Name} - {STATUS} {YYYYMMDD-HHMM}.docx`.
- **Environment.** Windows, macOS, or Linux; Node.js 22+ LTS; cross-shell CLI flags (`--scratch`, `--only=...`,
  `--include-hold`, `--allow-rebuild-over-edits`, `--with-pdf`). Renders use auto-detected headless LibreOffice
  (standard install, Windows LibreOffice Portable, macOS `~/Applications`, Linux AppImage, `QRG_SOFFICE` /
  `render.soffice`, or optional Windows Word fallback) plus pure-Node PNG rasterization. Proofing runs offline in Node
  (`harper.js` + `qa_dictionary.txt`). Syntax-check scripts with `node --check`; never `require()` `build_qrgs.js`
  (requiring it runs a real build).
- **Read every rendered page.** A Render is never a pass by itself: visually inspect every page PNG before locking.

## Where things are

Open each reference when its trigger branch applies:

| Path | Open when |
|---|---|
| `references/setup_for_teammates.md` | First-time machine setup (Windows, macOS, Linux; zip or Git install; no-admin LibreOffice; Claude Code, Antigravity, Codex, Cursor, or standalone CLI) |
| `references/content_rules.md` | Before authoring or revising the first Guide Source in a run (sections, steps, captions, callouts, tone, dates) |
| `references/screenshot_rules.md` | Before selecting video frames, cropping, redacting, or writing `annotate.json` |
| `references/evidence_and_questions.md` | Resolving conflicting sources, labeling shown vs. stated facts, or logging open questions |
| `references/definition_of_done.md` | Verifying a live build before applying a Review Lock |
| `references/review_and_release.md` | Running Renders, Review Locks, Browser Review UI, `.xlsx` OK Lists, fix rounds, or Send Copies |
| `references/lessons_learned.md` | Debugging hand edits, LibreOffice/font quirks, Google Docs round-trips, or recording issues |
| `references/unit_addendum_template.md` | Copying per-Set audience, privacy, and scope rules into a new project |
| `references/agent_rules_template.md` | Dispatching multiple helper agents in parallel |
| `kit/README.md` | Looking up any `qrg.config.json` key or Kit script option |
| `kit/tools/README.md` | Running screenshot, video, Google-safety, or optional Windows fallback tools |
| `kit/playbook/build_playbook.js` | Rebuilding the 11-page Team Playbook (`.docx`) for non-technical teammates |
| `kit/playbook/build_quickstart_qrg.js` | Rebuilding the 2-page Quick-Start QRG (*"Make QRGs with the QRG Builder Skill"*) |

## 1. Set up a project (once)

Run from any terminal (`<skill>` is wherever you unpacked or cloned `qrg-builder`; every Kit script auto-detects its
Skill root relative to itself):

```sh
node "<skill>/kit/scripts/init_project.js" --dir="<project folder>" --project="<Client or project>" \
  --set=UNIT1-INV --label="Unit 1 Investigator" --unit-line="Unit 1 | Investigator" --install
cd "<project folder>"
node qrg_kit/scripts/check_kit.js
node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example
```

- `--kit=copy` (default) copies the Kit and its pinned `package-lock.json` into `<project>/qrg_kit/`. `--kit=skill`
  runs from the Skill folder. `--upgrade-kit` upgrades `<project>/qrg_kit/` (moving the prior copy to `_archive_backups/`).
- Add another Set later with the same command and a new `--set`; existing Sets keep their configuration.
- Video extraction tools are optional: run `npm run add-video` in the Kit folder (~400 MB).
- Always run plain `npm install` (omitting optional dependencies drops native `sharp` and `@napi-rs/canvas` binaries).
- Fill in `qa_names.txt` (people's names to keep out of QRGs), `qa_dictionary.txt` (approved client UI labels, product
  names, and acronyms for offline proofing), `qa.extraBanned`, and `palette.accent` in `qrg.config.json`.
- If the project has a `_PROJECT_STATE.md` hub, add a row pointing to `_QRG - state.md`.
- Before writing guide 01, confirm the audience per Set, task list, sources, process-question owners, and reviewer; record
  them in `_QRG - state.md` and each Set's unit addendum.

**Done when:** `check_kit.js` ends `RESULT: kit ready` and the worked example builds, passes QA, proofs, and renders cleanly.

## 2. The per-guide loop

Run commands from the project root. Replace `<K>` with `qrg_kit` (copy mode) or `<skill>/kit` (skill mode).

1. **Brief.** Record the task, role, trigger, sources (recording and timestamps or captures), and out-of-scope items.
   Search captions first, then verify frames (`kit/tools/README.md`).
2. **Scaffold.** `node <K>/scripts/new_guide.js --set=<id> NN "<Title>" "<Subtitle>"`. Keep titles short, in title
   case, with no `\ / : * ? " < > | # % &`.
3. **Annotate screenshots.** Place immutable source PNGs in `assets/<key>NN/src/`, configure `annotate.json`, and run
   `node <K>/tools/annotate_screenshot.js "<set dir>/assets/<key>NN/annotate.json"` (`--grid` aids coordinate picking;
   callout color reads `palette.accent` from `qrg.config.json`). Visually inspect every output PNG.
4. **Author Guide Source.** Edit `<set dir>/guides/NN.js` per `references/content_rules.md`. Remove every `TODO`.
5. **Scratch build, QA, and meaning check.**
   `node <K>/build_qrgs.js --set=<id> --scratch --only="<prefix> NN "` (include the trailing space after `NN`), then
   `node <K>/qa_qrgs.js --set=<id> NN --scratch`. Fix every FAIL at its source, and read `<set dir>/_work/qa_text_NN.txt`
   yourself to verify meaning, clarity, and factual accuracy.
6. **Scratch Render and visual inspection.**
   `node <K>/scripts/render_guides.js --file="<scratch docx>"`. Inspect every page PNG against `references/definition_of_done.md`.
7. **Live build and QA.**
   `node <K>/build_qrgs.js --set=<id> --only="<prefix> NN "` then `node <K>/qa_qrgs.js --set=<id> NN`.
8. **Offline proofing and AI meaning review.**
   `node <K>/scripts/proof_guides.js --set=<id> NN` runs offline `harper.js` spelling and grammar checks backed by
   `qa_dictionary.txt`. Fix real errors, add valid client terms to `qa_dictionary.txt`, and review `_work/qa_text_NN.txt`
   for clarity and accuracy.
9. **Live Render and visual inspection.**
   `node <K>/scripts/render_guides.js --set=<id> NN`. Visually inspect every rendered page PNG.
10. **Log and update state.** Add a Done row, left-out items, questions, and conflicts to `_QRG work log.md` (using
    `MM/DD/YYYY`), and update `_QRG - state.md`.

Fix issues at the earliest source: crop/badges in `annotate.json`, prose in `guides/NN.js`, recurring layout issues in
`lib/docx_helpers.js`. Then rebuild and re-render.

**Done when:** every checkbox in `references/definition_of_done.md` passes for the live build.

## 3. Review and release

Full detail: `references/review_and_release.md`.

```sh
node <K>/scripts/render_guides.js --set=<id>
node <K>/scripts/lock_guides.js --check --set=<id>
node <K>/scripts/lock_guides.js --how="first build, QA clean, pages read" --set=<id>
```

Choose either (or both) review surfaces; both enforce identical SHA-256 Review Locks and carry-forward rules:

- **Local Browser Review UI (no Excel required):**
  `node <K>/scripts/review_ui.js` opens locally on `127.0.0.1` with rendered US Letter pages side by side. Picks and
  comments auto-save into `review/`, and the UI can export `.xlsx` OK Lists or stage Send Copies directly.
- **`.xlsx` OK List (spreadsheet handoff):**
  `node <K>/scripts/build_ok_list.js` writes `review/QRG OK List - DRAFT <stamp>.xlsx`, reconciling any saved Browser
  Review UI picks with prior sheets.

**Fix rounds:** read reviewer comments verbatim, resolve every item, rebuild, QA, proof, render, inspect every page PNG,
relock with a `--how` summary, and refresh the review surface. Unchanged locked guides carry forward automatically;
rebuilt guides reset blank with their earlier call shown.

**Final Deliverable Send Copies (explicit confirmation required):**
Clean-named Word (`.docx`) Send Copies are staged by default. **Before running `make_send_copies.js`, ask the user:**
*"Do you also want matching PDF copies alongside the Word (.docx) Send Copies?"*

```sh
# Default (Word .docx only):
node <K>/scripts/make_send_copies.js --dry
node <K>/scripts/make_send_copies.js

# When matching PDFs are requested (or set review.withPdf: true in qrg.config.json):
node <K>/scripts/make_send_copies.js --dry --with-pdf
node <K>/scripts/make_send_copies.js --with-pdf

node <K>/scripts/client_ready_scan.js "<send copy.docx>"
```

**Done when:** approved, verified Send Copies exist in `_send/`, `client_ready_scan.js` reports zero blockers, and you
have told the user the exact local `_send/` paths so a person can deliver them.

## 4. Several helper agents at once

Give every helper a brief from `references/agent_rules_template.md`: one owner per Guide Source, shared file edits run
under `node <K>/scripts/with_lock.js build ...`, and renders automatically serialize under the machine-wide render lock
(`proof_guides.js` runs in-process without needing a lock). Only the lead locks guides, builds OK Lists, or stages Send
Copies.

## 5. Finish a session

- Update `_QRG - state.md` (plus the hub row if one exists) and `_QRG work log.md` (with `MM/DD/YYYY` dates).
- Report to the user: guides built or revised (file names and page counts), checks run and outcomes, left-out items and
  questions that unblock them, and the next command.
- Log general Kit bugs in the work log "Tool problems" table; when fixing the Skill Kit, bump `kit/package.json` so
  `--upgrade-kit` surfaces the upgrade.
