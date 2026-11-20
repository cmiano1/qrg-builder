# Lessons learned (tool traps already hit)

Each item captures a trap already encountered, paired with the working pattern. Add new discoveries here.

## Install and environment

- **Never run `npm install --omit=optional`.** It drops platform native binaries for `sharp` and `@napi-rs/canvas`,
  breaking screenshot annotation and PDF-to-PNG rendering. Run plain `npm install`, then `npm run check`.
- **Node.js 22+ LTS is required** (`pdfjs-dist` and the built-in `node --test` runner require Node 22 or newer).
- **Video tools are opt-in:** run `npm run add-video` in the Kit folder (~400 MB for `ffmpeg` and `ffprobe`).
- **Use cross-shell CLI flags:** pass `--scratch`, `--only="<prefix> NN "`, `--include-hold`, and
  `--allow-rebuild-over-edits` to `build_qrgs.js` so commands work identically in PowerShell, CMD, bash, and zsh
  (legacy environment variables remain supported for backward compatibility).
- **Never `require()` `build_qrgs.js` to check syntax.** Requiring it runs a real build. Run `node --check <file>`.
  Requiring a Guide Source (`guides/NN.js`) is safe.
- **Paths with spaces or `&`:** quote every path argument. On Windows under Git Bash, pass native Windows paths
  (`"C:/Users/..."`, not `/c/Users/...`) to external tools like `ffmpeg` or optional Word COM, and keep scratch files
  in the project's `_work/` folder instead of `/tmp`.
- **Windows 260-character path limit:** keep render folders short. The Kit uses short `<set>_<NN>_<stamp>` folder names
  and `<set>_<NN>_p01.png` file names for this reason.
- **Regex hygiene in agent-written scripts:** use `String.match` or `matchAll` instead of regex `.exec(...)` loops.
- **Literal backslash escapes:** construct non-ASCII character checks with `String.fromCharCode(...)` (as `pack_skill.js`
  and `qa_qrgs.js` do) so source files remain pure ASCII and free of stray em/en dashes.
- **Scanning for em/en dashes across the Skill:** run `node "<skill>/kit/scripts/pack_skill.js"` (or `npm test` in
  `kit/`) to verify zero em/en dashes across every text file in `qrg-builder/`.

## Rendering, proofing, and Office

- **LibreOffice headless profile isolation:** `lib/render.js` always passes `-env:UserInstallation=<fresh temp file URI>`
  and deletes the temporary profile afterward so background Renders never collide with open desktop LibreOffice windows.
- **Font parity across Word, Google Docs, and LibreOffice:** keep `Calibri` as the default font. LibreOffice maps
  `Calibri` to its bundled metric-compatible `Carlito` font automatically.
- **Windows LibreOffice Portable:** invoke the inner `App\libreoffice\program\soffice.com` (never `soffice.exe`, which
  detaches immediately, and never `LibreOfficePortable.exe`). `lib/render.js` handles this automatically.
- **Linux LibreOffice AppImage without FUSE:** `lib/render.js` automatically retries with `--appimage-extract-and-run`
  when `libfuse2` is absent on a restricted machine.
- **Optional Windows Word COM fallback (`tools/word_render.ps1`):** invokes `ExportAsFixedFormat` late-bound via
  `InvokeMember` with two arguments (`[string]` path and `[int]17`) so Word does not hang. Never kill `WINWORD.EXE` or
  desktop LibreOffice while a user may have open documents.
- **Offline proofing (`harper.js`) is a mechanical floor:** it catches real typos and grammar slips offline without
  Word, and respects approved client UI labels and acronyms in `qa_dictionary.txt`. Always read `_work/qa_text_NN.txt`
  to check meaning, clarity, and factual accuracy.
- **A build stops if the prior build is open in Word or LibreOffice** (the OS blocks moving it to `_archive/`). Ask the
  user to close it first.
- **Hand edits outside the build:** if someone edits a built `.docx`, the build guard stops the next build. Diff the
  XML (unzip both `.docx` files and compare `word/document.xml`, headers, footers, numbering, and images), render both,
  ask what else changed, fold every edit into `guides/NN.js`, then rebuild with `--allow-rebuild-over-edits`.
- **Open `.xlsx` OK Lists:** Excel locks open workbooks. Save and close the `.xlsx` sheet before running
  `build_ok_list.js`, or review directly in the Local Browser Review UI (`node <K>/scripts/review_ui.js`) without Excel.

## Google Docs conversion

- **Tables:** set DXA widths on the table, column grid, and every cell summing to the `6.5 in` (`9360` twips) US Letter
  content width with fixed layout; percentage widths alone collapse columns in Google Docs.
- **Tabs:** insert real XML tab elements, never typed tab characters.
- **Spacing and borders:** use proportional line spacing (no exact line heights) and borders at least 1/2 pt.
- **Heading keep-with-next:** set `keepNext` on each heading paragraph directly (Google Docs drops style-only values).
- **Images:** inline pictures only with alt text; no floating images, text boxes, or shapes.
- `tools/gdocs_lint.js` checks every rule above (invoked by `qa_qrgs.js`). Verify real round-trips with
  `tools/gdocs_roundtrip.js`.

## Page layout

- **Keep steps intact:** each step keeps its lines together (`keepLines`), steps before a figure keep with it
  (`keepNext` via `word/numbering.xml` decimal list metadata), callout rows use `cantSplit`, and a blank gap paragraph
  separates adjacent tables. Rely on `lib/docx_helpers.js` instead of manual page breaks.
- **Visual inspection is mandatory:** scripts cannot spot awkward wraps or cramped pages. Read every rendered page PNG.

## Recordings

- **Whisper on long silences:** pass `-mc 0` so transcripts do not loop one phrase across silent stretches.
- **Contact-sheet tile timestamps can drift:** always extract the exact frame with `extract_video_frame.js --fast-seek`
  and inspect it before using it.
- **Screen-shared meetings:** crop to the application page only (strip speaker tiles, meeting chrome, and taskbar/dock),
  and recheck crops whenever presenters switch screens.

## Process

- **Evergreen text vs. dated project docs:** zero dates inside QRGs (no "Last updated" line); `MM/DD/YYYY` belongs only
  in work logs, briefs, and state files.
- **Session words leak into guides:** add project-specific internal words to `qa.extraBanned` in `qrg.config.json`.
- **Rebuilding after an OK breaks the Review Lock:** freeze guides already picked OK and log follow-up improvements for
  the next round.
- **Keep state files aligned:** if a project has a hub state file, update its QRG row in the same pass as `_QRG - state.md`.
