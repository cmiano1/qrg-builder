---
name: qrg-builder
description: Build Quick Reference Guides (QRGs, job aids, work instructions, step-by-step how-to guides) as Word files from training recordings, screenshots, and notes, with a config-driven generator, screenshot annotator, QA, Word render, review locks, an OK List for the reviewer, and clean send copies. Use when the user wants to set up a QRG project, write or fix a QRG, annotate QRG screenshots, run QRG QA or renders, lock guides for review, build the OK List, or make send copies. Triggers include "QRG", "quick reference guide", "job aid", "work instruction", "how-to guide for end users", "OK List", "send copies".
---

# QRG builder

One QRG = one task, one Word file, written for the person who does the task. The kit in `kit/` builds every guide
from a small guide file plus annotated screenshots, checks it, renders it through Word, and carries it through a
review gate so only the exact file the reviewer read can be sent.

Why it is built this way: guides change many times before go-live, and reviewers lose trust fast when a "fixed"
guide comes back with new errors. So the generator is the master, every check is a script, and a guide is locked
by hash once the reviewer is shown it.

## Ground rules (always)

- **Draft locally, publish by hand.** Write only inside the project folder. Never write to a shared drive, Google
  Workspace, email, or chat. Send copies land in the project's `_send/` folder; a person moves them.
- **Facts only.** A step goes in a guide only when it is shown (you checked the frame or screenshot) or stated (the
  process owner said it). Anything else is left out and logged as a question. Never hedge in a guide.
- **Generator is master.** Never hand-edit a built .docx. The build stops if one was edited after it was built.
  If the user edited one, diff it, fold the edits into the guide file, then rebuild (`references/lessons_learned.md`).
- **House style:** no em or en dashes, American English, plain words, MM/DD/YYYY in prose, bold for on-screen labels.
  File names: `{Name} - {STATUS} {YYYYMMDD-HHMM}.ext`.
- **Environment:** Windows, Git Bash, Node 20+, desktop Word (renders and proofing go through Word COM via
  `powershell.exe`). No Python needed. Syntax-check a build script with `node --check`; never `require()` one
  (requiring a build script runs a real build).
- **A render is not a pass.** After every render, read every page PNG yourself.

## Where things are

| Path | What |
|---|---|
| `kit/` | The kit: `build_qrgs.js`, `qa_qrgs.js`, `lib/`, `scripts/`, `tools/`, `templates/`. Full reference: `kit/README.md` |
| `kit/tools/README.md` | Screenshot, video, Word, and Google-safety helpers |
| `references/content_rules.md` | How to write a guide: sections, steps, figures, captions, callouts, tone |
| `references/screenshot_rules.md` | Picking frames, cropping, badges, redaction, cut-aways |
| `references/evidence_and_questions.md` | Shown or stated, source order, left-out items, questions, conflicts |
| `references/definition_of_done.md` | The checklist a guide must pass before it is locked |
| `references/review_and_release.md` | Render, lock, OK List, picks, fix rounds, send copies |
| `references/lessons_learned.md` | Tool traps already hit and how to avoid them |
| `references/unit_addendum_template.md` | Per-set facts and limits (copy into the project) |
| `references/agent_rules_template.md` | Shared rules for helper agents when several build at once |
| `references/setup_for_teammates.md` | First-time setup for another consultant |
| `kit/playbook/build_playbook.js` | Builds the QRG Playbook (Word), the plain-language version of this process for the team. Edit the generator, never the .docx |

Read `content_rules.md` and `screenshot_rules.md` before writing the first guide in a session.

## 1. Set up a project (once)

From Git Bash (the kit path is where this skill lives, usually `~/.claude/skills/qrg-builder/kit`):

```sh
node ~/.claude/skills/qrg-builder/kit/scripts/init_project.js --dir="<project folder>" --project="<Client or project>" \
  --set=UNIT1-INV --label="Unit 1 Investigator" --unit-line="Unit 1 | Investigator" --install
cd "<project folder>"
node qrg_kit/scripts/check_kit.js
node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example
```

- `--kit=copy` (default) copies the kit into `<project>/qrg_kit/`, so the project keeps its kit version and a teammate
  needs only the project folder. `--kit=skill` runs from the skill folder instead. `--upgrade-kit` moves a project to
  the skill's current kit (the old copy goes to `_archive_backups/`).
- Add another audience later with the same command and a new `--set`. An existing set keeps its settings.
- Video tools (frames, captions, contact sheets from recordings) need `npm run add-video` in the kit folder (about 400 MB).
- Never install with `npm install --omit=optional`: it drops sharp's Windows image library and the annotator stops.
- Build, QA, and render the example once (section 2) before real work. It proves Word, sharp, and the lint all work.
- Fill in `qa_names.txt` with every person's name seen in the sources, and `qa.extraBanned` in `qrg.config.json`
  with internal system names and code words that must not reach a reader.
- If the project has a `_PROJECT_STATE.md` hub, add a row for `_QRG - state.md` in the same session.

Interview the user before the first guide if these are not known: the audience per set, the task list (one guide
each), the sources per task (recordings, captures, notes, a test login), who answers process questions, and who
gives the OK to send. Record them in `_QRG - state.md` and a unit addendum.

## 2. The per-guide loop

Commands run from the project root. `K=qrg_kit` (copy mode) or the skill kit path (skill mode).

1. **Brief.** Write down the task, the reader, the trigger, the sources (recording, timestamps), and anything out of
   scope. Search captions first, then check frames (`kit/tools/README.md`).
2. **Start the guide.** `node $K/scripts/new_guide.js --set=<id> NN "<Title>" "<Subtitle>"`. Titles are task names in
   title case, short, with no `\ / : * ? " < > | # % &`.
3. **Screenshots.** Pull exact frames, put them in `assets/<key>NN/src/` (never edit a source), describe each figure
   in `annotate.json`, then `node $K/tools/annotate_screenshot.js "<set dir>/assets/<key>NN/annotate.json"`
   (`--grid` helps pick box coordinates). Read every output PNG.
4. **Write the guide file** (`<set dir>/guides/NN.js`) by `references/content_rules.md`. Remove every TODO.
5. **Scratch build and QA.**
   `QRG_SCRATCH=1 QRG_ONLY="<prefix> NN " node $K/build_qrgs.js --set=<id>` (the trailing space matters), then
   `node $K/qa_qrgs.js --set=<id> NN --scratch`. Fix every FAIL at its source. Read `_work/qa_text_NN.txt`: the
   QA cannot judge meaning.
6. **Render the scratch build and read every page.**
   `node $K/scripts/render_guides.js --file="<scratch docx>"`. Check the definition of done.
7. **Live build.** `QRG_ONLY="<prefix> NN " node $K/build_qrgs.js --set=<id>`, then `node $K/qa_qrgs.js --set=<id> NN`.
8. **Proof.** `node $K/scripts/proof_guides.js --set=<id> NN`. Fix real flags; note false positives (UI labels,
   fragments in steps).
9. **Render the live build and read every page.** `node $K/scripts/render_guides.js --set=<id> NN`.
10. **Log it** in `_QRG work log.md` (Done row, left-out items, questions by who answers, conflicts). Update
    `_QRG - state.md`.

Fix problems at the earliest source: a bad crop in `annotate.json`, a wording problem in the guide file, a layout
problem that repeats across guides in `lib/docx_helpers.js`. Then rebuild and re-render.

## 3. Review and release

Full detail: `references/review_and_release.md`.

```sh
node $K/scripts/render_guides.js --set=<id>                 # a render from the exact live file
node $K/scripts/lock_guides.js --check --set=<id>           # report only
node $K/scripts/lock_guides.js --how="first build, QA clean, pages read" --set=<id>
node $K/scripts/build_ok_list.js                            # review/QRG OK List - DRAFT <stamp>.xlsx
# the reviewer picks OK to send / OK to send, note for later / Fix before sending, saves, closes
node $K/scripts/make_send_copies.js --dry                   # then without --dry
node $K/scripts/client_ready_scan.js "<send copy.docx>"     # last look before a person moves them
```

- Lock only after the pages were read. A lock refuses a file with no matching render, a QA finding, a hand edit,
  or a clean-scan blocker.
- A fix round: read the reviewer's comments verbatim, fix, rebuild, QA, render, read pages, relock, build a new
  OK List. Picks carry forward only for unchanged files; a rebuilt guide comes back blank with its earlier call shown.
- Send copies are made only for "OK to send" picks whose file still matches its lock. Stop there and tell the user
  where they are. The user moves them.

## 4. Several agents at once

When helper agents build in parallel, give each one a brief built from `references/agent_rules_template.md`:
one owner per guide file, shared files edited only under `node $K/scripts/with_lock.js build ...`, every Word job
under the render lock (the kit scripts take it themselves), and a report per helper. The lead locks guides and
builds the OK List; helpers never do.

## 5. Finish a session

- Update `_QRG - state.md` (and the hub row if there is one) and the work log.
- Report to the user: guides built or changed (file names, page counts), checks run and their results, items left
  out and the questions that would unblock them, and the next command.
- Kit problems found: note them in the work log "Tool problems" table, and fix the skill kit if the fix is general.
  Bump `kit/package.json` version when the kit changes, so `--upgrade-kit` shows the difference.
