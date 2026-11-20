# QRG Kit tools

Helpers for screenshots, video recordings, Google Docs safety, and optional Windows rendering fallback. Each tool reads
its sources and never modifies them. Run from the project root as `node qrg_kit/tools/<tool>` (copy mode) or with
`<skill>/kit/tools/<tool>`. Every tool prints usage when run without arguments.

Video tools require the optional video add-on: `npm run add-video` inside the Kit folder (about 400 MB). All screenshot
and Google-safety tools run on Windows, macOS, and Linux with zero desktop Office software.

## Screenshots

| Tool | What it does | Usage |
|---|---|---|
| `annotate_screenshot.js` | Crops, redacts, and draws brand-accent callout boxes (`palette.accent` from `qrg.config.json`, fallback `#C8122C`) with numbered badges sized against Standard US Letter `6.5 in` content width. Writes `out/provenance.json`. | `node annotate_screenshot.js "<assets/keyNN/annotate.json>" [--grid] [--config=<path>] [--accent=<hex>\|--color=<hex>]` |
| `cutaway_screenshot.js` | Torn-edge cut-away for wide, shallow screens: keeps referenced controls and joins segments with a visible white tear plus a segment map. | `node cutaway_screenshot.js --src <src.png> --out <derived.png> --keep 0-745,1290-1420 [--crop l,t,w,h] [--axis x\|y] [--pad t,r,b,l]` |
| `image_contact_sheet.js` | Builds one labeled sheet of still captures for sorting a batch. | `node image_contact_sheet.js <out.png> <img> [img ...] [--tile 360] [--cols 3]` |
| `extract_snagx_png.js` | Extracts the main PNG from Snagit `.snagx` captures. | `node extract_snagx_png.js <out_dir> <capture.snagx> [...] [--overwrite] [--list]` |

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

- `crop` uses source pixels; `redact` and `boxes` use post-crop pixels. `--grid` writes a 50 px grid copy for picking
  coordinates.
- Callout color resolves in priority order: `--accent`/`--color` CLI flag, manifest `"accent"`/`"color"`, `palette.accent`
  in the discovered `qrg.config.json`, then standalone fallback `#C8122C`.
- `n` is the step number. `badge`: `tl`, `tr`, `bl`, `br`, `l`, `r`, `t`, `b`, `in`, or `none`.
- `"draw": false` places only the badge (for a capture that already has a highlight box). `{x, y, n}` without `w`/`h`
  centers a badge at `x, y`.
- `badgeIn` (inches) with `guide` sizes every badge consistently by reading each figure's width from its `afig()` call
  against Standard US Letter `6.5 in` content width. Small crops upscale so edges stay crisp (`minDpi`, default `220`).
  `figMaxIn` (default `5.25`) matches the figure height cap; `printIn` on a figure overrides its width.
- Re-run the whole manifest after any edit, then inspect every output PNG.

### Cut-away, then annotate

1. `node cutaway_screenshot.js --src src/wide.png --out src/wide_cut.png --keep 0-745,1290-1420`
2. Use `wide_cut.png` as the figure's `src` in `annotate.json` with no `crop`. Translate box `x` values using
   `wide_cut.png.cutaway.json`: `out = seg.outFrom + (v - seg.from)`.

## Recordings

| Tool | What it does | Usage |
|---|---|---|
| `extract_captions_vtt.js` | Extracts an embedded caption track from a meeting recording as WebVTT with exact timestamps. | `node extract_captions_vtt.js <video.mp4> [...] [--force] [--out-dir <dir>]` |
| `window_contact_sheet.js` | Samples one frame every N seconds across a short window, labeled with timestamps. | `node window_contact_sheet.js "<video>" --from 01:02:00 --to 01:06:00 --every 10 --out "<dir>"` |
| `video_index.js` | Creates a visual index of a short video (uniform, interval, or scene sampling) with `index.json`. | `node video_index.js "<video>" --out "<dir>" [--mode scene --threshold 0.30 --max 60]` |
| `extract_video_frame.js` | Extracts one exact full-quality frame at a timestamp (the figure source). | `node extract_video_frame.js "<video>" <hh:mm:ss.mmm or seconds> "<out.png>" --overwrite --fast-seek` |

Coarse to fine: search captions first, generate a short window sheet, pull the exact frame with `--fast-seek`, then
inspect it. Quote paths containing spaces or `&` (on Windows, pass native Windows paths like `"C:/Users/..."` to
ffmpeg). Never use a contact-sheet tile as a figure.

## Google safety

| Tool | What it does | Usage |
|---|---|---|
| `gdocs_lint.js` | Verifies Standard US Letter (`8.5 x 11 in`) and checks `.docx` rules that break in Google Docs (fixed DXA table widths, real tabs, proportional spacing, inline images with alt text, single font, borders >= 1/2 pt, heading keep-with-next, no text boxes/shapes). `qa_qrgs.js` runs it automatically. | `node gdocs_lint.js --page=letter --full-width "<file.docx>"` |
| `gdocs_lint_selftest.js` | Mutates a clean `.docx` in memory to verify every lint rule fires (run as part of `npm test`). | `node gdocs_lint_selftest.js "<clean build.docx>"` |
| `gdocs_roundtrip.js` | Compares a local `.docx` build against a copy downloaded back from Google Docs. | `node gdocs_roundtrip.js "<local.docx>" "<google copy.docx>" [--out=<report.txt>]` |

Upload to Google Docs by hand into a private folder, and save the downloaded copy in a new empty folder before comparing.

## Optional Windows Word fallback

| Tool | What it does | Usage |
|---|---|---|
| `word_render.ps1` | Optional Windows-only `.docx` to PDF fallback via desktop Word COM (invisible, read-only), used automatically by `lib/render.js` only when LibreOffice is absent on Windows. | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File word_render.ps1 -In "<abs docx>" -Out "<abs pdf>" [-UpdateFields] [-UpdateTOC]` |

Always prefer the Kit scripts instead of calling this directly: `scripts/render_guides.js` auto-detects headless
LibreOffice cross-platform, converts PDF pages to PNGs purely in Node.js (`pdfjs-dist` + `@napi-rs/canvas`), holds the
render lock, and writes `render.json`. Offline proofing runs purely in Node.js via `scripts/proof_guides.js`
(`harper.js`) with zero PowerShell or Word dependencies.
