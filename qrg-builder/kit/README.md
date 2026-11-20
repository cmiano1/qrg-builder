# QRG kit

A config-driven kit that builds Quick Reference Guides as Word files, checks them, renders them through Word, and
carries them through a review gate (lock, OK List, send copies). The process and the writing rules are in the
skill: `../SKILL.md` and `../references/`. This file is the technical reference: every config key and every script.

Needs Node 22 or newer (LTS). Build and QA run on Windows, macOS, and Linux without desktop Word.

```sh
npm install            # about 60 MB. Never with --omit=optional (it drops sharp's platform image library)
npm run check          # syntax, Node 22+, packages: should end "RESULT: kit ready"
npm test               # built-in Node test runner: end-to-end worked example + Google Docs lint self-test
npm run add-video      # only for the video tools (about 400 MB)
```

## Layout of a project

```
<project>/
  qrg.config.json                  the only project-specific settings file
  qa_names.txt                     people's names the QA looks for (one per line)
  qrg_kit/                         this kit (copy mode); or run from the skill folder (skill mode)
  sets/<set id>/
    guides/NN.js                   one guide body per file
    assets/<assetKey>NN/           src/ (source PNGs, never edited), out/ (annotated), annotate.json
    _work/                         build log, QA text extracts, scratch builds
  QRGs/<label>/                    live builds: "<prefix> NN - <Title> - <STATUS> <YYYYMMDD-HHMM>.docx"
    _archive/                      older builds (the version history)
  review/
    render/<set>_<NN>_<stamp>/     PDF, page PNGs, render.json (SHA-256 of the file rendered)
    locks.json                     one lock per guide (with history)
    QRG OK List - DRAFT <stamp>.xlsx
    notes.json, send_hold.json     optional
  _send/<sendFolder>/              clean-named send copies, send manifests, _replaced/
  _QRG - state.md, _QRG work log.md
```

A guide code is `<set id> NN`, for example `UNIT1-INV 05`.

## qrg.config.json

Found by `--config=<path>`, then `QRG_CONFIG`, then the current folder or any parent, then the folder above the
kit. Paths in it are relative to its own folder. Keys starting with `_` are notes and are ignored.

| Key | Default | Meaning |
|---|---|---|
| `project` | `Project` | Shown on the OK List |
| `author` | `Change Management` | Written as the document author and last-modified-by. The clean scan reads any other last-modified-by as a hand save. |
| `status` | `DRAFT` | In every file name; capital letters only |
| `page` | `letter` | Standard US Letter (`8.5 x 11 in`, `1 in` margins, `6.5 in` content width) only; A4 is rejected |
| `font` | `Calibri` | The one font used everywhere (Google-safe) |
| `palette` | red and gray | `accent`, `heading`, `grey`, `light`, `tip`, `warn` as hex without # |
| `sections` | Purpose ... Troubleshooting | Section order the QA checks |
| `figureMaxHeightIn` | `5.25` | Figure height cap; a guide can override with `figMaxH` |
| `sets[]` | | One per audience (below) |
| `qa.names` | `[]` | People's names a guide must never contain (plus `qa.namesFile`, default `qa_names.txt`) |
| `qa.idPatterns` | ticket IDs like `ABC-123` | Regex sources for internal tracking IDs |
| `qa.styleAllow` | `[]` | Exact phrases the style check skips (a screen label that really says "Grey") |
| `qa.extraBanned` | `[]` | `[{ "label", "pattern", "flags" }]` for internal system names and code words |
| `qa.sessionWords` | built-in list | A regex source that replaces the session and build word list |
| `review.dir` | `review` | Renders, locks, OK List sheets |
| `review.sendDir` | `_send` | Local send copies |
| `review.sendKeepNumber` | `false` | Keep NN in send names |

Each set:

| Key | Meaning |
|---|---|
| `id` | Letters, digits, hyphens. Used in guide codes and `--set=` |
| `label` | Human name; also the default output and send folder name |
| `prefix` | Starts every file name (unique per project, file-name safe) |
| `unitLine` | The line under each guide title |
| `footerTag` | After the title in the footer |
| `dir` | Folder for guides and assets |
| `out` | Folder for live builds |
| `assetKey` | Asset folder name before NN (default: id without hyphens) |
| `sendFolder` | Folder under the send folder (default: the id) |

## Guide files

`sets/<id>/guides/NN.js` exports a function that gets the helpers and returns the guide. Start one with
`scripts/new_guide.js`; the template has the rules in its header.

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
| `para(text, { after, keepNext })` | A paragraph |
| `num(text)` | A numbered step in the one continuous list |
| `bullet(text, level)` | A bullet |
| `callout(text, "tip" \| "note" \| "warn")` | TIP, NOTE, or IMPORTANT box |
| `refTable(headers, rows, widths)` | A table; Troubleshooting uses `[3400, 5800]` |
| `titleBlock(title, subtitle)` | Title, subtitle, unit line (spread it) |
| `afig(K, png, caption, widthIn)` | Figure and caption (spread it); one line, K first |

`**bold**` works in every text helper. Optional guide keys: `file` (default `<prefix> NN - <title>`), `hold: true`
(not built unless `--include-hold` or `QRG_INCLUDE_HOLD=1`), `figMaxH` (inches), `keepRun` (QA only). `R()` (cross-references) throws
on purpose.

## Scripts

All run from anywhere under the project. `K` is `qrg_kit` (copy mode) or the skill kit path.

| Script | What | Main options |
|---|---|---|
| `build_qrgs.js` | Builds guides for a set; moves the prior build to `_archive/`; writes the build log. Stops if a live build was hand-edited or is open in Word. | `--set=<id>`, `--scratch`, `--only="<prefix> NN "`, `--include-hold`, `--allow-rebuild-over-edits` (legacy env vars `QRG_SCRATCH=1`, `QRG_ONLY`, `QRG_INCLUDE_HOLD=1`, `ALLOW_REBUILD_OVER_EDITS=1`, `QRG_ALLOW_REBUILD_OVER_EDITS=1` also work) |
| `qa_qrgs.js` | Google lint, structure, page-break rules, footer, figures against badges, text checks. Writes `_work/qa_text_NN.txt`. Exit 1 on any finding. | `--set=<id> [NN] [--scratch] [--file=<docx>]` |
| `scripts/init_project.js` | Sets up a project or adds a set. Never overwrites. | `--dir --project --set --label --prefix --unit-line --footer-tag --asset-key --out --kit=copy\|skill --upgrade-kit --install` |
| `scripts/new_guide.js` | Starts a guide file and its asset folder, or the worked example. | `--set=<id> NN "<Title>" ["<Subtitle>"]`, `--set=<id> --example` |
| `scripts/check_kit.js` | Health check (also `npm run check`). | |
| `scripts/render_guides.js` | Word render to PDF and PNGs, under the render lock. | `--set=<id> [NN ...]`, `"<code>" ...`, `--force`, `--scale=N`, `--file=<docx> [--out=<dir>]` |
| `scripts/proof_guides.js` | Word spelling and grammar flags, under the render lock. | `--set=<id> [NN ...]`, `"<file.docx>" ...` |
| `scripts/client_ready_scan.js` | Blockers (tracked changes, comments, hidden text, highlight) and text worth a look. | `[--set=<id>]`, `"<file.docx>" ...`, `--out=<json>` |
| `scripts/lock_guides.js` | Records the lock after checking render, QA, build log, and clean scan. | `--check`, `--how="<note>"`, `--set=<id> [NN ...]`, `"<code>" ...` |
| `scripts/build_ok_list.js` | The reviewer's OK List sheet, with carry-forward. | `[--set=<id>]`, `--prior="<sheet>"` or `--prior=none` |
| `scripts/make_send_copies.js` | Clean-named copies of OK'd, still-locked guides. | `["<sheet>" ...]`, `--dry`, `--list`, `--all-locked` (with `--dry`) |
| `scripts/with_lock.js` | Runs a command under the build or render lock. | `build <command ...>`, `render <command ...>` |
| `scripts/pack_skill.js` | Zips the skill for a teammate after a dash and word check. Run from the skill kit only. | `"<out folder>" [--words="A,B"] [--words-file=<file>] [--force]` |
| `playbook/build_playbook.js` | Builds the team's QRG Playbook (Word) with the kit's own house style. Skill kit only: `init_project.js` does not copy `playbook/` into projects. Lint it with `--fonts="Calibri,Courier New"` (code blocks). | `["<out folder>"] [--status=DRAFT]` |

Tools (screenshots, recordings, Word, Google lint): `tools/README.md`.

## Locks

| Lock | Where | Held by |
|---|---|---|
| render | `~/.qrg_kit/render.lock` (machine-wide; `QRG_RENDER_LOCK` overrides) | `render_guides.js`, `proof_guides.js`, `with_lock.js render` |
| build | `<project>/_work/_build.lock` | live `build_qrgs.js` runs, `with_lock.js build` |

A lock older than its stale time (10 minutes for render, 15 for build) is treated as left by a crashed run.
`with_lock.js` sets `QRG_HOLDS_<KIND>_LOCK=1`, so a kit script inside it does not wait for its own parent.

## Versions

`package.json` `version` is the kit version (`2.0.0`, requiring Node.js `>=22`). `init_project.js` copies the kit and
its `package-lock.json` into a project and reports the version; `--upgrade-kit` replaces a project's copy (the old copy
goes to `_archive_backups/`). Bump the version whenever the kit changes.

`docx` is exact-pinned to `8.5.0` in `package.json` (and locked via `package-lock.json`). `lib/docx_helpers.js` depends
on `docx` v8 constructor shapes (such as `ImageRun`, `numbering.config`, and `lastModifiedBy`) that changed in `docx`
9.x, and `pack()` plus `tools/gdocs_lint_selftest.js` inspect and transform generated OOXML parts. Keeping `8.5.0`
pinned ensures identical Google-Docs-safe XML across teammates; any future upgrade must pass `npm test` (including
`gdocs_lint_selftest.js`) and visual page-render verification.

## Source of truth

The generator is the master: this kit, the guide files, and `annotate.json`. A built .docx is disposable. Never
hand-edit one; if someone did, fold the edits into the guide file before the next build (the build guard stops
until you do).
