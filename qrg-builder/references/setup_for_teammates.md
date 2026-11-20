# Setup for a teammate (first time)

About 15 minutes. You end with a working Skill and Kit on Windows, macOS, or Linux, plus one worked example QRG built,
checked, proofed, and rendered.

## 1. What you need

| Need | Why | Check |
|---|---|---|
| Windows 10/11, macOS, or Linux | Every Kit script runs natively on all three operating systems | |
| Node.js 22 or newer (LTS) | Runs every Kit script, offline proofing, PNG rasterization, and the Browser Review UI | `node --version` |
| LibreOffice (free, no admin rights required) | Converts `.docx` builds to PDF for visual Renders and optional PDF Send Copies (see Section 2) | `npm run check` |
| AI coding tool (optional) | Claude Code, Antigravity, Codex, or Cursor reads `SKILL.md` and runs the loop; standalone Node.js CLI also works | |

No paid desktop Microsoft Word or Excel, no Python, no ImageMagick, and no system ffmpeg are required. (If LibreOffice
is not installed on Windows and desktop Microsoft Word is already installed, the Kit automatically uses Word as a
fallback for `.docx` to PDF conversion.)

## 2. Install LibreOffice without admin rights

The Kit auto-detects LibreOffice in priority order, runs it with an isolated temporary profile (so it never interferes
with open desktop documents), and maps `Calibri` to LibreOffice's bundled metric-matched `Carlito` font.

- **Windows (no admin rights):** download LibreOffice Portable (PortableApps) and unpack it into
  `%USERPROFILE%\LibreOfficePortable` (or `PortableApps\`, `Apps\`, `Tools\`, `Desktop\`, or `Documents\`). The Kit
  invokes the inner `App\libreoffice\program\soffice.com` directly (never `soffice.exe` or `LibreOfficePortable.exe`).
  Standard installs in `C:\Program Files\LibreOffice` are also detected automatically.
- **macOS (no admin rights):** download the LibreOffice `.dmg` and drag `LibreOffice.app` into `~/Applications` (or
  `/Applications` if you have admin rights).
- **Linux (no admin rights):** download the LibreOffice AppImage into `~/Applications/` or `~/.local/bin/` and mark it
  executable (`chmod +x LibreOffice-*.AppImage`). If FUSE is unavailable on a locked-down machine, the Kit automatically
  retries with `--appimage-extract-and-run`. Distro installs (`soffice` on `PATH`) are also detected automatically.
- **Custom path override:** set the `QRG_SOFFICE` environment variable to the `soffice` (or `soffice.com`) path, or add
  `"render": { "soffice": "<path>" }` in `qrg.config.json`.
- **No renderer yet?** Building `.docx` files, running `qa_qrgs.js`, and running offline `proof_guides.js` still succeed
  without LibreOffice; `render_guides.js` prints a plain-English setup guide if no renderer is found.

## 3. Get the Skill (zip or Git)

Choose either installation method. Every Kit script auto-detects the Skill folder relative to its own file path.

### Option A: Skill zip

A teammate packages a clean zip (`QRG Builder Skill - <stamp>.zip`) with:

```sh
node "<skill>/kit/scripts/pack_skill.js" "<out folder>"
```

1. Save the zip in a new, empty folder.
2. Unzip it so you have a `qrg-builder/` folder (containing `SKILL.md`, `references/`, and `kit/`) placed in your AI
   tool's skills folder or any local folder for standalone CLI use (see table below). Rename any older `qrg-builder/`
   folder first.

### Option B: Git clone

Clone the team repository and point your AI tool at `<repo>/qrg-builder/` (by copying or symlinking `qrg-builder/` into
your AI tool's skills folder, or running Kit scripts directly from `<repo>/qrg-builder/kit/`). Pull updates later with
`git pull`.

### Where each tool loads the Skill

| Tool | Typical location for `qrg-builder/` |
|---|---|
| Claude Code | User skills folder (`<home>/.claude/skills/qrg-builder/`) or project `.claude/skills/qrg-builder/` |
| Antigravity | Global skills folder (`<home>/.gemini/config/skills/qrg-builder/` or `<home>/.gemini/antigravity/skills/qrg-builder/`) or workspace `.agents/skills/qrg-builder/` |
| Codex | User skills folder (`<home>/.codex/skills/qrg-builder/`) or workspace `.agents/skills/qrg-builder/` |
| Cursor | User skills folder (`<home>/.cursor/skills/qrg-builder/`) or workspace `.agents/skills/qrg-builder/` |
| Standalone Node.js CLI | Any local folder (for example `<home>/tools/qrg-builder/` or your Git clone) |

### Install packages and run the health check

From any terminal (Windows PowerShell, Command Prompt, Git Bash, macOS Terminal, or Linux shell), replace `<skill>` with
your `qrg-builder` path:

```sh
cd "<skill>/kit"
npm install
npm run check
```

`npm run check` should end with `RESULT: kit ready`. Never pass `--omit=optional` to `npm install` (it drops platform
native binaries for `sharp` and `@napi-rs/canvas`). Only if you pull frames from video recordings, also run
`npm run add-video` (about 400 MB).

## 4. Start a project and verify the worked example

All Kit commands use cross-shell CLI flags that work identically in PowerShell, Command Prompt, bash, and zsh:

```sh
node "<skill>/kit/scripts/init_project.js" --dir="<project folder>" --project="<Client>" \
  --set=UNIT1-INV --label="Unit 1 Investigator" --unit-line="Unit 1 | Investigator" --install
cd "<project folder>"
node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example
node qrg_kit/build_qrgs.js --set=UNIT1-INV --scratch --only="Unit 1 Investigator 01 "
node qrg_kit/qa_qrgs.js --set=UNIT1-INV 01 --scratch
node qrg_kit/scripts/proof_guides.js "sets/UNIT1-INV/_work/scratch/<the new .docx>"
node qrg_kit/scripts/render_guides.js --file="sets/UNIT1-INV/_work/scratch/<the new .docx>"
```

Open the page PNGs in `_work/render_scratch/` and inspect them. Delete the example guide (`sets/UNIT1-INV/guides/01.js`
and `sets/UNIT1-INV/assets/UNIT1INV01/`) before authoring your real guide 01.

What `init_project.js` created:

| Path | What |
|---|---|
| `qrg.config.json` | Project name, Sets, US Letter house style, brand `palette.accent`, QA word lists, optional `render.soffice`, `review.withPdf` |
| `qrg_kit/` | Project-pinned copy of the Kit plus its `package-lock.json` |
| `sets/<id>/guides/`, `sets/<id>/assets/` | Guide Sources and screenshots |
| `QRGs/<label>/` | Live Working Deliverables (older builds archived in `_archive/`) |
| `review/` | Renders, `locks.json`, saved review state, `.xlsx` OK Lists |
| `qa_names.txt`, `qa_dictionary.txt` | Banned people's names; approved client UI labels and acronyms for offline proofing |
| `_QRG - state.md`, `_QRG work log.md` | Project state and dated (`MM/DD/YYYY`) work log |

## 5. Working with an AI tool or standalone CLI

- **With Claude Code, Antigravity, Codex, or Cursor:** open your AI tool in the project folder and ask in plain English,
  for example "Set up a QRG project for Unit 2 Supervisors", "Write QRG 03 from the part 2 recording at 01:10 to 01:25",
  "Launch the Browser Review UI", or "Stage Send Copies". The Skill loads `SKILL.md` and the reference files and never
  publishes outside `_send/`.
- **Without an AI tool (standalone Node.js CLI):** every step is a plain Node command in any terminal. See `SKILL.md` for
  the workflow, `qrg_kit/README.md` for every script option, the 2-page Quick-Start QRG for a desk cheat sheet, and the
  11-page Team Playbook for the full non-technical guide. Launch `node qrg_kit/scripts/review_ui.js` to review rendered
  pages in your browser without Excel, or run `node qrg_kit/scripts/build_ok_list.js` to export an `.xlsx` OK List.

## 6. Upgrading a project to a newer Kit

Update your Skill folder (unzip the newer zip or run `git pull`), run `npm install && npm run check` inside `<skill>/kit`,
then upgrade a project:

```sh
node "<skill>/kit/scripts/init_project.js" --dir="<project folder>" --set=<any existing set> --upgrade-kit
```

The prior `qrg_kit/` copy moves to `_archive_backups/`. Rebuild one guide and visually compare it with its prior Render
before rebuilding the rest.

## 7. If something fails

| You see | Do |
|---|---|
| `STOP: the kit's packages are not installed` | Run `npm install` inside the Kit folder named in the message |
| `sharp` or `@napi-rs/canvas` does not load | Run `npm install` again without `--omit=optional`, then `npm run check` |
| `No DOCX-to-PDF renderer was found` | Install no-admin LibreOffice (Section 2) or set `QRG_SOFFICE` / `render.soffice` in `qrg.config.json` |
| Linux AppImage fails with a FUSE error | Ensure the AppImage is executable (`chmod +x`); the Kit automatically retries with `--appimage-extract-and-run` |
| A render waits a long time | Another Render holds the machine-wide render lock; it clears automatically when finished or after 10 minutes if stale |
| `STOP: ... was edited after it was built` | Diff the hand-edited `.docx`, fold edits into `guides/NN.js`, then rebuild with `--allow-rebuild-over-edits` |
| `STOP: ... is open in Excel` | Save and close the `.xlsx` OK List, or use `node qrg_kit/scripts/review_ui.js` in your browser |
| `page "a4" is not supported` | Keep `"page": "letter"` in `qrg.config.json` (Standard US Letter `8.5 x 11 in` only) |
