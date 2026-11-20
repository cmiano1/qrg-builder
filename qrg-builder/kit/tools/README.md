# QRG kit tools

Helpers for screenshots, recordings, Word, and Google safety. Each one reads its sources and never changes them.
Run them from the project root as `node qrg_kit/tools/<tool>` (copy mode) or with the skill kit path. Every tool
prints its usage when run with no arguments, and its header comment has the full detail.

Video tools need the video add-on: `npm run add-video` in the kit folder (about 400 MB). Word tools need Windows
and desktop Word.

## Screenshots

| Tool | What it does | Usage |
|---|---|---|
| `annotate_screenshot.js` | Crops, redacts, and draws red boxes with numbered badges, from `annotate.json`. Writes `out/provenance.json`. | `node annotate_screenshot.js "<assets/key NN/annotate.json>" [--grid]` |
| `cutaway_screenshot.js` | Torn-edge cut-away for a wide, shallow screen: keeps the parts the steps name, joins them with a visible tear. Writes a segment map so box coordinates can be moved. | `node cutaway_screenshot.js --src <src.png> --out <derived.png> --keep 0-745,1290-1420 [--crop l,t,w,h] [--axis x\|y] [--pad t,r,b,l]` |
| `image_contact_sheet.js` | One labeled sheet of many still images, for sorting a batch of captures. | `node image_contact_sheet.js <out.png> <img> [img ...] [--tile 360] [--cols 3]` |
| `extract_snagx_png.js` | Copies the main PNG out of Snagit `.snagx` captures. | `node extract_snagx_png.js <out_dir> <capture.snagx> [...] [--overwrite] [--list]` |

### annotate.json

```json
{
  "srcDir": "src", "outDir": "out", "displayWidth": 600,
  "badgeIn": 0.24, "guide": "../../guides/03.js",
  "figures": [
    { "src": "case_page.png", "out": "unit1inv03_f01_case.png",
      "note": "Case page, recording part 2 at 01:12:40, frame checked",
      "crop": { "left": 0, "top": 120, "width": 1600, "height": 800 },
      "redact": [ { "x": 1200, "y": 40, "w": 260, "h": 24, "fill": "#ffffff" } ],
      "boxes": [ { "x": 210, "y": 64, "w": 120, "h": 36, "n": 3, "badge": "tr" } ] }
  ]
}
```

- `crop` is in source pixels; `redact` and `boxes` are in post-crop pixels. `--grid` writes a 50 px grid copy for picking them.
- `n` is the step number. `badge`: `tl`, `tr`, `bl`, `br`, `l`, `r`, `t`, `b`, `in`, or `none`.
- `"draw": false` on a box places only the badge (for a source that already has a box). `{x, y, n}` with no w and h
  draws a badge centered at x, y.
- `badgeIn` (inches) with `guide` (path to the guide file) sizes every badge to print the same size, reading each
  figure's width from its `afig()` call. Small crops are upscaled 2x so edges stay sharp (`minDpi`, default 220).
  `figMaxIn` (default 5.25) matches the figure height cap; `printIn` on a figure overrides its width.
- Re-run the whole manifest after any change, then read every output PNG.

### Cut-away, then annotate

1. `node cutaway_screenshot.js --src src/wide.png --out src/wide_cut.png --keep 0-745,1290-1420`
2. Use `wide_cut.png` as the figure's `src` in `annotate.json`, with no `crop`. Move box x values with the segment
   map in `wide_cut.png.cutaway.json`: `out = seg.outFrom + (v - seg.from)`.

## Recordings

| Tool | What it does | Usage |
|---|---|---|
| `extract_captions_vtt.js` | Pulls an embedded caption track out of a meeting recording as WebVTT, timing kept exactly. | `node extract_captions_vtt.js <video.mp4> [...] [--force] [--out-dir <dir>]` |
| `window_contact_sheet.js` | One frame every N seconds in a short window, labeled with times. For choosing a frame. | `node window_contact_sheet.js "<video>" --from 01:02:00 --to 01:06:00 --every 10 --out "<dir>"` |
| `video_index.js` | A visual index of a whole video (uniform, interval, or scene sampling) with `index.json`. Use on short videos only. | `node video_index.js "<video>" --out "<dir>" [--mode scene --threshold 0.30 --max 60]` |
| `extract_video_frame.js` | The exact frame at a time, full quality. This is the figure source. | `node extract_video_frame.js "<video>" <hh:mm:ss.mmm or seconds> "<out.png>" --overwrite --fast-seek` |

Coarse to fine: captions first, then a short window sheet, then the exact frame, then look at it. Pass video paths
as `"C:/Users/..."` from Git Bash. Always `--fast-seek` on long recordings. A contact-sheet tile is never a figure.

## Word (Windows only)

| Tool | What it does | Usage |
|---|---|---|
| `word_render.ps1` | DOCX to PDF through Word, invisible, read-only on the source. | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File word_render.ps1 -In "<abs docx>" -Out "<abs pdf>" [-UpdateFields] [-UpdateTOC]` |
| `pdf_to_png.ps1` | PDF pages to PNGs with the built-in Windows PDF renderer. | `... -File pdf_to_png.ps1 -In "<abs pdf>" -OutDir "<short abs dir>" -Scale 150` |
| `word_proof.ps1` | Word's spelling and grammar flags as JSON. | `... -File word_proof.ps1 -List "<abs list.txt>" -Out "<abs out.json>"` |

Use the kit scripts instead of calling these directly: `scripts/render_guides.js` and `scripts/proof_guides.js` take
the render lock, keep paths short, and record what was rendered. If you must call one directly, run it under
`node scripts/with_lock.js render ...`. Use absolute paths and short output folders (Windows 260-character limit).

## Google safety

| Tool | What it does | Usage |
|---|---|---|
| `gdocs_lint.js` | Checks a DOCX for what breaks in Google Docs conversion (table widths, typed tabs, exact spacing, floating pictures, alt text, fonts, thin borders, heading keep-with-next). `qa_qrgs.js` runs it. | `node gdocs_lint.js --page=letter --full-width "<file.docx>"` |
| `gdocs_lint_selftest.js` | Proves each lint rule still fires. Run after editing the lint. | `node gdocs_lint_selftest.js "<clean build.docx>"` |
| `gdocs_roundtrip.js` | Compares a local build with the copy downloaded back from Google Docs. | `node gdocs_roundtrip.js "<local.docx>" "<google copy.docx>" [--out=<report.txt>]` |

The upload to Google is done by a person, into a private folder. Save the downloaded copy in its own new, empty
folder before comparing it.
