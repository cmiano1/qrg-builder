# Setup for a teammate (first time)

About 15 minutes. You end with a working kit and one example guide built, checked, and rendered.

## 1. What you need

| Need | Why | Check |
|---|---|---|
| Windows 10 or 11 | Word renders and proofing use Word through COM | |
| Desktop Microsoft Word | Renders to PDF and the grammar check | Word opens from the Start menu |
| Git for Windows (Git Bash) | The commands below are written for Git Bash | `git --version` in Git Bash |
| Node.js 20 or newer | Every kit script is Node | `node --version` |
| Claude Code (optional) | The skill tells Claude how to run the whole process | `claude --version` |

The kit needs no Python, ImageMagick, LibreOffice, or system ffmpeg. Build and QA also run on a Mac or Linux; only
renders and proofing need Windows and Word.

## 2. Get the skill

You get it as a zip (`QRG Builder Skill - <stamp>.zip`) from a teammate, made with
`node ~/.claude/skills/qrg-builder/kit/scripts/pack_skill.js "<out folder>"`.

1. Save the zip in its own new, empty folder. Unzip it into `C:\Users\<you>\.claude\skills\` (the zip holds one
   folder, `qrg-builder\`, with `SKILL.md`, `references\`, and `kit\` inside). If `qrg-builder\` is already there,
   rename the old one first.
2. In Git Bash:
   ```sh
   cd ~/.claude/skills/qrg-builder/kit
   npm install
   npm run check
   ```
   `npm run check` should end `RESULT: kit ready`. Do not use `npm install --omit=optional` (it breaks the image
   library on Windows).
3. Only if you will pull frames from recordings: `npm run add-video` (about 400 MB).

## 3. Start a project

```sh
node ~/.claude/skills/qrg-builder/kit/scripts/init_project.js --dir="C:/Users/<you>/Projects/<Client> QRGs" \
  --project="<Client>" --set=UNIT1-INV --label="Unit 1 Investigator" --unit-line="Unit 1 | Investigator" --install
cd "C:/Users/<you>/Projects/<Client> QRGs"
node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example
QRG_SCRATCH=1 QRG_ONLY="Unit 1 Investigator 01 " node qrg_kit/build_qrgs.js --set=UNIT1-INV
node qrg_kit/qa_qrgs.js --set=UNIT1-INV 01 --scratch
node qrg_kit/scripts/render_guides.js --file="sets/UNIT1-INV/_work/scratch/<the new .docx>"
```

Open the PNGs in `_work/render_scratch/` and look at them. If all of this worked, the kit is ready. Delete the
example guide (`sets/UNIT1-INV/guides/01.js` and `sets/UNIT1-INV/assets/UNIT1INV01/`) before your real guide 01.

What `init_project.js` made:

| Path | What |
|---|---|
| `qrg.config.json` | Project name, sets, house style, QA word lists. The only project-specific settings file. |
| `qrg_kit/` | A copy of the kit, so this project keeps the kit version it was built with |
| `sets/<id>/guides/`, `sets/<id>/assets/` | Guide files and screenshots |
| `QRGs/<label>/` | The Word files (one live build per guide; older builds in `_archive/`) |
| `review/` | Renders, locks, OK List sheets |
| `qa_names.txt` | People's names that must never appear in a guide |
| `_QRG - state.md`, `_QRG work log.md` | Where the project stands; questions, left-out items, conflicts |

## 4. Working with Claude Code

Open Claude Code in the project folder and ask for what you need, for example "Set up a QRG project for Unit 2
Supervisors", "Write QRG 03 from the part 2 recording at 01:10 to 01:25", or "Build the OK List". The skill loads
on words like QRG, quick reference guide, job aid, and work instruction. It follows `SKILL.md` and the reference
files, and it never publishes: send copies stay in `_send/` for you to move.

## 5. Working without Claude Code

Everything is a Node command. `SKILL.md` lists the loop, `qrg_kit/README.md` lists every script and option, and the
QRG Playbook (Word) walks through the process for people who do not read code. In PowerShell instead of Git Bash,
set environment variables first: `$env:QRG_SCRATCH="1"; $env:QRG_ONLY="Unit 1 Investigator 01 "; node qrg_kit/build_qrgs.js --set=UNIT1-INV`
(then `Remove-Item Env:QRG_SCRATCH, Env:QRG_ONLY`).

## 6. Moving a project to a newer kit

`node ~/.claude/skills/qrg-builder/kit/scripts/init_project.js --dir="<project>" --set=<any existing set> --upgrade-kit`.
The old kit copy goes to `_archive_backups/`. Rebuild one guide and compare it with the last build before rebuilding
the rest.

## 7. If something fails

| You see | Do |
|---|---|
| `STOP: the kit's packages are not installed` | `npm install` in the kit folder it names |
| `sharp does not load` | `npm install` again without `--omit=optional`, then `npm run check` |
| `Word is not registered for COM` | Install desktop Word; the web version cannot render |
| A render waits a long time | Another render holds the lock. It frees itself when that run ends, or after a crash it is stale and gets taken over |
| `STOP: ... was edited after it was built` | Someone edited the Word file. Fold the edits into the guide file first (`lessons_learned.md`, Hand edits) |
| `STOP: ... is open in Excel` | Save and close the OK List, then rerun |
