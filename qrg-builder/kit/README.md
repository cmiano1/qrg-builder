# QRG Kit

A cross-platform, config-driven Node.js Kit that builds Quick Reference Guides (QRGs) as Standard US Letter Word
(`.docx`) Working Deliverables, verifies Google Docs safety and writing rules, runs offline spelling and grammar
proofing, renders visual PDFs and page PNGs without Microsoft Office, enforces SHA-256 Review Locks across a Local
Browser Review UI and `.xlsx` OK List, and stages clean-named Final Deliverable Send Copies.

Process rules and AI instructions live in the Skill: `../SKILL.md` and `../references/`. This file is the technical
reference for `qrg.config.json` and every Kit script.

Requires Node.js 22 or newer (LTS) on Windows, macOS, or Linux. Build, QA, offline proofing, PNG rasterization, and the
Browser Review UI need zero desktop Office software; visual `.docx` to PDF Renders use auto-detected headless
LibreOffice (including no-admin Windows PortableApps, macOS `~/Applications`, and Linux AppImage, with an optional
Windows Word fallback).

```sh
npm install            # never pass --omit=optional (it drops platform binaries for sharp and @napi-rs/canvas)
npm run check          # syntax, Node 22+, native/WASM packages, renderer discovery: should end "RESULT: kit ready"
npm test               # built-in Node test runner (node --test): end-to-end Kit, render, proof, review UI, packaging
npm run add-video      # optional video extraction tools only (ffmpeg + ffprobe, about 400 MB)
```

## Layout of a project

```
<project>/
  qrg.config.json                  the single project-specific settings file
  qa_names.txt                     people's names QA looks for (one per line)
  qa_dictionary.txt                approved product names, acronyms, and UI labels for offline proofing
  qrg_kit/                         pinned copy of this Kit + package-lock.json (copy mode); or run from Skill folder
  sets/<set id>/
    guides/NN.js                   one Guide Source per file
    assets/<assetKey>NN/           src/ (immutable source PNGs), out/ (annotated), annotate.json
    _work/                         build log, QA text extracts (qa_text_NN.txt), scratch builds
  QRGs/<label>/                    live builds: "<prefix> NN - <Title> - <STATUS> <YYYYMMDD-HHMM>.docx"
    _archive/                      older builds (version history)
  review/
    render/<set>_<NN>_<stamp>/     PDF, page PNGs, render.json (SHA-256 of exact rendered .docx)
    locks.json                     one Review Lock per guide (with history)
    review_state.json              auto-saved Browser Review UI picks and comments
    QRG OK List - DRAFT <stamp>.xlsx
    notes.json, send_hold.json     optional reviewer guidance and release holds
  _send/<sendFolder>/              clean-named Send Copies (.docx default; + .pdf with --with-pdf), manifests, _replaced/
  _QRG - state.md, _QRG work log.md
```

A guide code is `<set id> NN`, for example `UNIT1-INV 05`.

## qrg.config.json

Found by `--config=<path>`, then `QRG_CONFIG`, then the current folder or any parent, then one level above the Kit
folder. Paths inside the file are relative to its own folder. Keys starting with `_` are notes and are ignored.

| Key | Default | Meaning |
|---|---|---|
| `project` | `Project` | Shown in the Browser Review UI and `.xlsx` OK List |
| `author` | `Change Management` | Written as document author and `lastModifiedBy`; clean scan flags any other `lastModifiedBy` as an outside edit |
| `status` | `DRAFT` | Status token in live file names; capital letters only |
| `page` | `letter` | Standard US Letter (`8.5 x 11 in`, `1 in` margins, `6.5 in` content width) only; A4 is rejected |
| `font` | `Calibri` | Single body font everywhere (Google-safe; auto-mapped to bundled `Carlito` in LibreOffice) |
| `palette` | red and gray | `accent`, `heading`, `grey`, `light`, `tip`, `warn` as 6-digit hex without `#`. `accent` also styles screenshot callout boxes and the Browser Review UI |
| `sections` | Purpose ... Troubleshooting | Section order enforced by `qa_qrgs.js` |
| `figureMaxHeightIn` | `5.25` | Figure height cap in inches; a Guide Source can override with `figMaxH` |
| `sets[]` | | One entry per audience Set (below) |
| `qa.names` | `[]` | People's names banned from QRGs (combined with `qa.namesFile`, default `qa_names.txt`) |
| `qa.dictionary` | `[]` | Approved client UI labels, product names, and acronyms for offline `harper.js` proofing (combined with `qa.dictionaryFile`, default `qa_dictionary.txt`) |
| `qa.idPatterns` | ticket IDs like `ABC-123` | Regex sources for internal tracking IDs |
| `qa.styleAllow` | `[]` | Exact phrases the style check skips (for example an actual screen label saying "Grey") |
| `qa.extraBanned` | `[]` | `[{ "label", "pattern", "flags" }]` for internal system names and code words |
| `qa.sessionWords` | built-in list | Regex source replacing the default session and build word list |
| `render.soffice` | `null` | Optional explicit path to `soffice` / `soffice.com` / AppImage (overridden by `QRG_SOFFICE` env var) |
| `review.dir` | `review` | Renders, Review Locks, saved review state, and `.xlsx` OK Lists |
| `review.sendDir` | `_send` | Local staging folder for Send Copies |
| `review.sendKeepNumber` | `false` | Keep `NN` in clean Send Copy file names |
| `review.withPdf` | `false` | Stage verified locked Render PDFs alongside Word Send Copies by default (override per run with `--with-pdf` or `--no-pdf`) |

Each Set entry:

| Key | Meaning |
|---|---|
| `id` | Letters, digits, hyphens. Used in guide codes and `--set=` |
| `label` | Human name; default output and send folder name |
| `prefix` | Starts every file name (unique per project, file-name safe) |
| `unitLine` | Subtitle line printed under each guide title |
| `footerTag` | Printed after the title in the footer |
| `dir` | Folder for Guide Sources and assets |
| `out` | Folder for live `.docx` builds |
| `assetKey` | Asset folder prefix before `NN` (default: `id` without hyphens) |
| `sendFolder` | Subfolder under `review.sendDir` (default: `label` / `id`) |

## Guide Sources

`sets/<id>/guides/NN.js` exports a function that receives the helpers and returns the guide object. Start one with
`scripts/new_guide.js`; the template carries the writing rules in its header.

```js
module.exports = (H) => {
  const { h2, h3, para, num, bullet, callout, refTable, titleBlock, afig } = H;
  const K = H.key("03");
  return {
    title: "Log a Call on a Case",
    subtitle: "Case record, Activity tab",
    build() {
      const b = [];
      b.push(...titleBlock(this.title, this.subtitle));
      b.push(h2("Purpose"), para("..."));
      // ...
      b.push(num("Click **Log a Call**."));
      b.push(...afig(K, "unit1inv03_f01_case.png", "Figure 1. The Activity tab on a case (step 1)", 6.0));
      return b;
    },
  };
};
```

| Helper | Use |
|---|---|
| `h2(text)`, `h3(text)` | Section heading, sub-heading (keep with next) |
| `para(text, { after, keepNext })` | Paragraph |
| `num(text)` | Numbered step in the single continuous list |
| `bullet(text, level)` | Bullet item |
| `callout(text, "tip" \| "note" \| "warn")` | TIP, NOTE, or IMPORTANT box |
| `refTable(headers, rows, widths)` | Fixed-width table; Troubleshooting uses `[3400, 5800]` |
| `titleBlock(title, subtitle)` | Title, subtitle, unit line (spread it) |
| `afig(K, png, caption, widthIn)` | Figure and caption (spread it); keep on one line with `K` first |

`**bold**` works in every text helper. Optional guide keys: `file` (default `<prefix> NN - <title>`), `hold: true`
(skipped unless `--include-hold` or `QRG_INCLUDE_HOLD=1`), `figMaxH` (inches), `keepRun` (QA only). `R()`
(cross-references) throws on purpose.

## Scripts

Run from anywhere under the project. Replace `<K>` with `qrg_kit` (copy mode) or `<skill>/kit` (skill mode). Every Kit
script auto-detects its own Skill/Kit root relative to `__dirname`.

| Script | What | Main options |
|---|---|---|
| `build_qrgs.js` | Builds QRGs for a Set; archives prior builds; writes build log; stops if a live `.docx` was edited outside the build or is locked open. | `--set=<id>`, `--scratch`, `--only="<prefix> NN "`, `--include-hold`, `--allow-rebuild-over-edits` (legacy env vars also supported) |
| `qa_qrgs.js` | Google Docs lint, US Letter enforcement, structure, numbering/page-break rules, footer, figure/badge hash match, text checks. Writes `_work/qa_text_NN.txt`. Exits 1 on any finding. | `--set=<id> [NN] [--scratch] [--file=<docx>]` |
| `scripts/init_project.js` | Initializes a project or adds a Set. Never overwrites existing files. | `--dir --project --set --label --prefix --unit-line --footer-tag --asset-key --out --kit=copy\|skill --upgrade-kit --install` |
| `scripts/new_guide.js` | Scaffolds a Guide Source and asset folder, or seeds the worked example. | `--set=<id> NN "<Title>" ["<Subtitle>"]`, `--set=<id> --example` |
| `scripts/check_kit.js` | Cross-platform health check (also `npm run check`). | |
| `scripts/render_guides.js` | Renders `.docx` to PDF (auto-detected LibreOffice or optional Windows Word fallback) and per-page PNGs in Node (`pdfjs-dist` + `@napi-rs/canvas`), under the render lock. | `--set=<id> [NN ...]`, `"<code>" ...`, `--force`, `--scale=N`, `--file=<docx> [--out=<dir>]` |
| `scripts/proof_guides.js` | Offline English spelling and grammar proofing (`harper.js` + `qa_dictionary.txt`). Advisory (exits 0). | `--set=<id> [NN ...]`, `"<file.docx>" ...` |
| `scripts/client_ready_scan.js` | Reports blockers (tracked changes, comments, hidden text, highlight, yellow shading) and text lines worth checking. | `[--set=<id>]`, `"<file.docx>" ...`, `--out=<json>` |
| `scripts/lock_guides.js` | Records a SHA-256 Review Lock after verifying Render, QA, build log, and clean scan. | `--check`, `--how="<note>"`, `--set=<id> [NN ...]`, `"<code>" ...` |
| `scripts/review_ui.js` | Starts the Local Browser Review UI (`127.0.0.1`) for side-by-side page review, auto-saving picks/comments, exporting `.xlsx` OK Lists, and staging Send Copies. | `[--port=<N>]`, `--no-open`, `[--set=<id>]` |
| `scripts/build_ok_list.js` | Builds a reconciled `.xlsx` OK List with carry-forward from prior sheets and Browser Review UI state. | `[--set=<id>]`, `--prior="<sheet>"` or `--prior=none`, `[--out="<file.xlsx>"]` |
| `scripts/make_send_copies.js` | Stages clean-named Word (`.docx`) Send Copies (plus verified Render `.pdf` when `--with-pdf` or `review.withPdf: true`) for approved, verified locks. | `["<sheet>" ...]`, `--dry`, `--list`, `--with-pdf`, `--no-pdf`, `--all-locked` (with `--dry`) |
| `scripts/with_lock.js` | Runs a command under the build or render lock. | `build <command ...>`, `render <command ...>` |
| `scripts/pack_skill.js` | Scans every text file in `qrg-builder/` for em/en dashes and client words, then zips `qrg-builder/` (Skill Kit only). | `"<out folder>"`, `[--out="<file.zip>"]`, `[--words="A,B"]`, `[--words-file=<file>]`, `[--force]` |
| `playbook/build_playbook.js` | Builds the 11-page Team Playbook (`.docx`) in Skill Kit house style. Lint with `--fonts="Calibri,Courier New"`. | `["<out folder>"] [--out="<file.docx>"] [--status=DRAFT]` |
| `playbook/build_quickstart_qrg.js` | Builds the 2-page Quick-Start QRG (*"Make QRGs with the QRG Builder Skill"*) using standard QRG rules and `Calibri` only. | `["<out folder>"] [--out="<file.docx>"] [--status=DRAFT]` |

Additional tools (screenshots, recordings, Google Docs lint, optional Windows fallback): `tools/README.md`.

## Locks

| Lock | Where | Held by |
|---|---|---|
| `render` | `~/.qrg_kit/render.lock` (machine-wide; `QRG_RENDER_LOCK` overrides) | `render_guides.js`, `with_lock.js render` |
| `build` | `<project>/_work/_build.lock` | live `build_qrgs.js` runs, `with_lock.js build` |

A lock older than its stale window (10 minutes for `render`, 15 minutes for `build`) is treated as left by a crashed
process and cleared automatically. `with_lock.js` sets `QRG_HOLDS_<KIND>_LOCK=1` so nested Kit scripts do not deadlock.

## Versions and pinned packages

`package.json` `version` is the Kit version (`2.0.0`, requiring Node.js `>=22`). `init_project.js` copies the Kit and
its `package-lock.json` into a project; `--upgrade-kit` replaces a project's copy (archiving the old copy in
`_archive_backups/`).

- **`docx` is exact-pinned to `8.5.0`** because `lib/docx_helpers.js` depends on `docx` v8 constructor shapes
  (`ImageRun`, `numbering.config`, `lastModifiedBy`) that changed in `docx` 9.x, and `pack()` plus
  `tools/gdocs_lint_selftest.js` inspect and normalize generated OOXML parts. Any future upgrade must pass `npm test`
  (including `gdocs_lint_selftest.js`) and visual page-render checks.
- **`harper.js` is exact-pinned to `3.2.0`** because Automattic marks the package early-access; pinning keeps offline
  proofing behavior and `harper.js/binaryInlined` loading deterministic across teammates.

## Source of truth

The generator is the master: this Kit, each Guide Source (`guides/NN.js`), and `annotate.json`. Built `.docx` files are
disposable outputs. Never hand-edit one; if someone did, diff and fold every change into the Guide Source before
rebuilding with `--allow-rebuild-over-edits`.
