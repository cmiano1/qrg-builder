# Definition of done (per QRG)

A QRG is ready for a Review Lock (`review_and_release.md`) when every item below holds for the live Working Deliverable.
Passing scripts is necessary but not sufficient: read the extracted text and visually inspect every rendered page PNG.

## Scripts (all must pass)

- [ ] `qa_qrgs.js --set=<id> NN` ends `RESULT: clean` (includes Google Docs lint and Standard US Letter `8.5 x 11 in` check).
- [ ] `proof_guides.js --set=<id> NN` (offline `harper.js` + `qa_dictionary.txt`) flags were fixed, added to `qa_dictionary.txt` if valid client terms, or noted as intentional step fragments.
- [ ] `client_ready_scan.js` reports zero blockers (no tracked changes, comments, hidden text, highlight, or yellow shading).
- [ ] `render_guides.js` rendered the live build cleanly (headless LibreOffice or optional Windows Word fallback + pure-Node PNGs) with matching `render.json` SHA-256.
- [ ] Every figure was built by `annotate_screenshot.js` from `annotate.json` with `badgeIn` and `guide` set (brand accent from `palette.accent`).

## Content (read Guide Source and `_work/qa_text_NN.txt` for meaning and accuracy)

- [ ] Every step is shown or stated, with its source recorded in the brief or work log.
- [ ] Nothing hedged: no TBD, "check with", "probably", or reviewer notes. Gaps live in `_QRG work log.md` under "Left out until answered".
- [ ] Zero people's names, zero dates (no "Last updated" line; use `MM/DD/YYYY` only in logs, briefs, and state files), zero session words, zero guide numbers, and zero other guide titles.
- [ ] All six sections in configured order; `Who does this` states both **Who** and **When**.
- [ ] One continuous numbered step list; each step is one short imperative with exact bold on-screen labels.
- [ ] `What happens next` states immediate visible confirmation and downstream effects.
- [ ] `Troubleshooting` rows pair real observable situations with concrete fixes.
- [ ] American English, zero em or en dashes, "select" and "clear" for check boxes, quoted messages punctuated cleanly.
- [ ] Unit fit: only this Set's apps, lists, queues, and templates.

## Pages (visually inspect every rendered page PNG)

- [ ] Each figure sits right after the steps it shows, on the same page or the next.
- [ ] Badge numbers match step numbers in the same section and match caption step numbers.
- [ ] Badges print at uniform size, stay sharp, and never cover labels or other badges.
- [ ] First screen view is an establishing shot; no crop hides a referenced control; small UI text is legible at 100% zoom.
- [ ] No stray mouse pointer (unless on the clicked control); no inbox, chat, admin banner, taskbar/dock, or browser chrome.
- [ ] No orphaned heading at page bottom, no step split across pages, tables intact or repeating headers.
- [ ] Footer shows title, Set tag, and page number aligned at the right margin.

## Log and state

- [ ] `_QRG work log.md` Done row records live file name, page count, figure sources, and checks run (dated `MM/DD/YYYY`).
- [ ] Left-out items and open questions logged and grouped by owner.
- [ ] `_QRG - state.md` updated (and project hub row if present).
