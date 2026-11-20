# Lessons learned (tool traps already hit)

Each line is a trap someone already fell into, with the working way. Add to it when you find a new one.

## Install and environment

- **Never `npm install --omit=optional`.** It also drops sharp's Windows image library (`@img/sharp-win32-x64`), and
  every image tool fails. Use a plain `npm install`, then `npm run check`.
- **Video tools are opt-in:** `npm run add-video` in the kit folder (about 400 MB for ffmpeg and ffprobe). The base
  install is about 60 MB.
- **Never `require()` a build script to check its syntax.** Requiring `build_qrgs.js` runs a real build. Use
  `node --check <file>`. Requiring a guide file (`guides/NN.js`) is fine.
- **Git Bash paths for Windows tools:** pass media paths to ffmpeg and Word as `"C:/Users/..."`, not `/c/Users/...`
  (the tool silently finds nothing). Quote every path with spaces or `&`.
- **`/tmp` is two different places:** Git Bash maps it to its own temp folder, but Node reads `/tmp` as `C:\tmp`.
  Put scratch files in a project `_work/` folder.
- **Windows path length:** keep render folders short. A long guide title in a folder name pushed page paths past 260
  characters and the PDF-to-PNG step wrote nothing. The kit's render folders use short codes for this reason.
- **Regex in a script written by an agent:** use `String.match` or `matchAll`. Some security hooks block any file
  that contains the regex exec method call, even in a comment.
- **Literal backslash escapes** (for example a dash-check regex) can be decoded by the tool layer before the file is
  written. Build the backslash with `String.fromCharCode(92)` in the script.
- **Finding non-ASCII characters** (dashes, smart quotes) from Git Bash: `LC_ALL=C grep -n '[^ -~]' "<file>"`.

## Word and Office

- **Word PDF export from PowerShell:** call `ExportAsFixedFormat` late-bound through `InvokeMember` with exactly two
  plain arguments (a `[string]` path and `[int]17`). A direct `$doc.ExportAsFixedFormat($pdf, 17)` call hung Word with
  no dialog on some Office builds. `tools/word_render.ps1` already does this.
- **Never kill WINWORD.EXE** while the user may have Word open. If a render hangs, find the hidden Word the run
  started and close only that one.
- **A build stops if the guide's prior build is open in Word** (it cannot move a file Word holds to `_archive/`).
  Ask the user to close it.
- **Word's grammar check over COM is a floor,** not a full edit. It misses things the cloud Editor catches and flags
  real UI labels. Read every flag in context.
- **Hand edits in Word:** if the user edits a built file, the next build stops on the guard. Diff the XML (unzip
  both files and compare `word/document.xml`, headers, footers, numbering, and images), render both, ask the user
  what else they changed, fold every edit into the guide file, then rebuild with `ALLOW_REBUILD_OVER_EDITS=1`.
- **Excel files the user has open** cannot be read safely. `build_ok_list.js` stops if the earlier sheet is open.

## Google conversion (when guides are uploaded to Google Docs)

- **Tables:** give the table, the column grid, and every cell DXA widths that sum to the content width, with fixed
  layout. A percentage width alone made Google draw a one-letter-wide column.
- **Tabs:** a real tab element, never a tab character typed in the text. Google deleted the typed tab in a footer.
- **No exact line spacing** (Google has multiples only). Borders 1/2 pt or more (Google thickens thinner ones).
- **keepNext on each heading paragraph itself,** not only in the style: Google drops it from the style.
- **Alt text on every picture.** Inline pictures only; no floating ones, text boxes, or shapes.
- `tools/gdocs_lint.js` checks all of these; `qa_qrgs.js` runs it. After a real upload, compare the Google copy with
  `tools/gdocs_roundtrip.js`.

## Page layout

- **Steps split by a page break** read badly: each step keeps its lines together, the steps just before a figure
  keep with it, a callout row never splits, and a small empty paragraph separates two adjacent tables (Word draws
  touching tables as one box). The kit's helpers do all of this; do not work around them with manual page breaks.
- **A script check cannot see wrap overlap** or a crowded page. Read every page that changed.

## Recordings

- **Whisper on recordings with long silences:** add `-mc 0` (no carried-over context). Without it, transcripts
  looped one phrase for minutes.
- **Contact-sheet tile labels can drift** from exact frame times. Pull the exact frame and check it.
- **Multi-hour recordings:** always use `--fast-seek` with `extract_video_frame.js`. Without it the seek decodes from
  the start.
- **A screen-shared meeting recording** scales the shared screen inside the meeting frame, with speaker tiles and
  the taskbar around it. Crop to the application page only, and check every frame (the layout shifts when the
  presenter changes).

## Process

- **Session or build words leak into guides** ("in today's session", "as shown in the training"). The QA catches
  the common ones; add project-specific ones to `qa.extraBanned`.
- **Reviewers read rendered pages, not guide files.** So should you, every time.
- **A rebuild after an OK breaks the OK.** That is the point of the lock. Freeze guides that are picked OK, and
  list later changes for the next round instead of rebuilding them.
- **Two state files must never disagree.** If a project has a hub state file, update the QRG stream row in the
  same pass as `_QRG - state.md`.
