# Review and release

The review gate guarantees that the exact build the reviewer inspected is the exact Final Deliverable staged for
release. Every change after approval breaks the Review Lock visibly, so the reviewer only rereads guides that actually
changed.

```
 build -> QA -> proof -> Render -> read pages -> LOCK -> Browser Review UI or .xlsx OK List
                                                   ^                     |
                                                   | "Fix before sending"|
                                                   +-- fix, rebuild, QA, proof, Render, read pages, relock
                                                                         |
                                                                    "OK to send"
                                                                         v
                                                      Send Copies (.docx default; + PDF if requested) -> publish by hand
```

## 1. Roles

| Role | Does |
|---|---|
| Builder (consultant or helper agents) | Authors Guide Sources, annotates screenshots, builds, runs QA and proofing, renders, inspects pages, logs questions |
| Lead (one person or lead session) | Applies Review Locks, launches/exports the OK List, stages Send Copies, updates state |
| Reviewer (change manager or process owner) | Inspects rendered pages for each locked QRG and records calls and comments |
| Publisher (a person) | Delivers staged Send Copies from `_send/` to the shared or client location by hand |

## 2. Render

`node <K>/scripts/render_guides.js --set=<id> [NN ...]` converts each live Working Deliverable `.docx` to PDF via
auto-detected headless LibreOffice (standard install, Windows LibreOffice Portable `soffice.com`, macOS `~/Applications`,
Linux AppImage, `QRG_SOFFICE` / `render.soffice`, or optional Windows Word fallback) and rasterizes per-page PNGs purely
in Node.js (`pdfjs-dist` + `@napi-rs/canvas`). Outputs land in `review/render/<set>_<NN>_<stamp>/` with `render.json`
recording the SHA-256 of the exact `.docx` rendered.

LibreOffice always runs with an isolated temporary `-env:UserInstallation` profile so open desktop documents are never
affected. One Render runs at a time under the machine-wide render lock. Inspect every rendered PNG before locking.

## 3. Review Lock

```sh
node <K>/scripts/lock_guides.js --check --set=<id>
node <K>/scripts/lock_guides.js --how="first build, QA clean, pages read" --set=<id> [NN ...]
```

A Review Lock records the guide code, file name, SHA-256, matching Render PDF and page count, timestamp, and `--how`
summary shown to the reviewer. Locking refuses any build with a missing or stale Render, a QA finding, a hand edit
outside the build, a missing build-log entry, or a `client_ready_scan.js` blocker. Relocking preserves prior locks in
`history`.

Write `--how` so the reviewer immediately knows what changed: `"fix round 2: reviewer comments on steps 4 and 7; Figure 3 recropped"`.

## 4. Dual review surface: Browser Review UI and `.xlsx` OK List

Both review surfaces share one pure review-state, SHA-256 lock verification, and carry-forward engine backed by
`review/`. Reviewers can use either surface without losing decisions.

### Option A: Local Browser Review UI (no Excel required)

```sh
node <K>/scripts/review_ui.js [--port=<N>] [--no-open] [--set=<id>]
```

- Serves a local web app strictly on `127.0.0.1` (switching automatically to a free local port if the default port is
  busy) and opens in Chrome, Edge, Safari, or Firefox.
- Shows live progress counters, filter chips (`All`, `Waiting for OK`, `OK to send`, `Needs fix`, `Changed / Unlocked`),
  `Check these spots` guidance, rebuilt banners, and rendered US Letter page PNGs side by side with the decision buttons.
- Every pick (`OK to send`, `OK to send, note for later`, `Fix before sending`) and comment auto-saves directly to
  `review/` with atomic write-verify-rename. Locked-broken or unlocked builds disable approval buttons.
- Includes one-click **Export .xlsx OK List** (saves a timestamped workbook in `review/`) and **Stage Send Copies**
  (opens a confirmation modal with the *"Also include matching PDF copies alongside the Word (.docx) Send Copies?"*
  checkbox).

### Option B: `.xlsx` OK List (spreadsheet handoff)

```sh
node <K>/scripts/build_ok_list.js [--set=<id>] [--prior="<sheet.xlsx>" | --prior=none]
```

Writes `review/QRG OK List - DRAFT <stamp>.xlsx` with one row per live QRG, reconciling any picks already saved in the
Browser Review UI with the newest earlier `.xlsx` sheet. Each row shows Status, PDF and Word links, page count, `--how`
note, `Check these spots`, locked file and hash, and the **Your call** / **Your comment** input columns:

- **Done, waiting for OK:** locked and SHA-256 verified; ready for a pick.
- **Lock broken:** the live `.docx` changed or disappeared after locking; relock before picking.
- **Not locked:** still being built or checked.

Optional `review/notes.json` adds `Check these spots` guidance (`{ "<code>": { "check": "...", "how": "..." } }`).
Optional `review/send_hold.json` holds a guide out of Send Copies (`{ "<code>": { "reason": "..." } }`).

**Carry-forward:** unchanged locked guides automatically carry forward their prior call and comment. Any rebuilt guide
resets to blank with `Changed since last sheet = Yes` and its earlier call and comment displayed verbatim so the
reviewer re-inspects the change. Earlier calls survive intermediate sheets built during a fix round. Close an `.xlsx`
OK List in Excel before rebuilding a new sheet.

## 5. Fix rounds

1. Read the reviewer's comments verbatim (from the Browser Review UI or `.xlsx` OK List).
2. Handle every comment: complete it, or record a clear reason if deferred. Drop none.
3. Apply the same fix to matching guides in sibling Sets unless a sibling is frozen (already approved and staged); list
   frozen siblings for the next round.
4. Preserve the reviewer's meaning while fixing typos or grammar in suggested phrasing.
5. Fix, rebuild, run `qa_qrgs.js` and `proof_guides.js`, review `_work/qa_text_NN.txt`, render, visually inspect every
   page PNG, relock with `--how`, and refresh the Browser Review UI or build a new `.xlsx` OK List.
6. Fold any general rule stated in a comment into the unit addendum (and the Kit if universal).

For multi-agent fix rounds, issue one shared brief from `references/agent_rules_template.md`.

## 6. Send Copies (Word default, optional PDF)

Clean-named Word (`.docx`) Final Deliverables are staged by default. **Before staging Send Copies, ask the user
explicitly whether matching PDF copies (from the exact locked Render) are also needed.**

```sh
# Word (.docx) Send Copies only (default):
node <K>/scripts/make_send_copies.js --dry
node <K>/scripts/make_send_copies.js

# Word (.docx) + matching verified Render PDFs:
node <K>/scripts/make_send_copies.js --dry --with-pdf
node <K>/scripts/make_send_copies.js --with-pdf

# Override review.withPdf: true for a single Word-only run:
node <K>/scripts/make_send_copies.js --no-pdf

# Final automated check before human delivery:
node <K>/scripts/client_ready_scan.js "<send copy.docx>"
```

- Accepts picks from the Browser Review UI saved state, an `.xlsx` OK List, or both reconciled cleanly (explicit sheet
  arguments take precedence in order given).
- Stages only guides marked `OK to send` or `OK to send, note for later` whose Review Lock matches the live build's
  SHA-256 and that are not in `send_hold.json`.
- Clean file names drop the guide number, status, and timestamp: `<prefix> - <Title>.docx` (plus `.pdf` when
  `--with-pdf` or `review.withPdf: true` is active). Set `review.sendKeepNumber: true` in `qrg.config.json` to retain `NN`.
- Copies land in `_send/<sendFolder>/` with `send_manifest_<stamp>.json` recording SHA-256 hashes (for both `.docx` and
  `.pdf` when paired). Prior Send Copies created by the Kit rotate into `_replaced/` with a timestamp; unknown files
  with the same name halt the run.
- Stop after staging and verification. Tell the user the exact `_send/` paths so a person delivers them.

## 7. After release

- Move `OK to send, note for later` comments into `_QRG work log.md` for the next round.
- Any post-release edit goes through the complete gate again (build, QA, proof, Render, inspect, lock, approve, stage).
- Retain `_archive/`, prior OK Lists in `review/`, and `_replaced/` copies as the project's audit trail.
