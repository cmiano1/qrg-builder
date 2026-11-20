# Definition of done (per guide)

A guide is done when every box below is true for the live build. Then it can be locked
(`review_and_release.md`). A clean script run is necessary but not enough: half of this list can only be checked by
reading the rendered pages.

## Scripts (all must pass)

- [ ] `qa_qrgs.js --set=<id> NN` ends `RESULT: clean` (it includes the Google lint).
- [ ] `proof_guides.js` flags were each fixed or noted as a false positive (a UI label, a step fragment, a TIP label).
- [ ] `client_ready_scan.js` shows no blocker (tracked changes, comments, hidden text, highlight, yellow shading).
- [ ] `render_guides.js` rendered the live file with no error, and its render matches the file (SHA-256).
- [ ] Every figure was made by `annotate_screenshot.js` from `annotate.json`, with `badgeIn` and `guide` set.

## Content (read the guide file and the QA text extract)

- [ ] Every step is shown or stated, and the brief or work log says which.
- [ ] Nothing hedged: no TBD, "check with", "probably", or reviewer notes. Every gap is in "Left out until answered".
- [ ] No person's name, date, session word, guide number, or other guide's title.
- [ ] All six sections, in order. Who does this has a Who and a When.
- [ ] One continuous step list. Each step is one action, a short imperative, with on-screen labels in bold and spelled
      as on screen.
- [ ] What happens next says what the reader sees when it worked and what happens downstream.
- [ ] Troubleshooting rows are real situations, each with a real fix.
- [ ] American English, no em or en dashes, "select" and "clear" for check boxes, quoted messages punctuated right.
- [ ] Unit fit: this unit's names for apps, lists, queues, and templates; no other unit's content.

## Pages (render and read every page PNG)

- [ ] Each figure sits right after the steps it shows, on the same page or the next.
- [ ] Badge numbers match the step numbers printed next to them, and only steps from the same section.
- [ ] Badges are the same size across the guide, sharp, and do not cover their labels or each other.
- [ ] The first view of each page is an establishing shot; no crop hides a control a step names.
- [ ] Small UI text in every figure can be read at 100% zoom.
- [ ] No mouse pointer in the middle of an image (unless on the button being clicked); no inbox, chat, banner, or
      browser chrome.
- [ ] No heading alone at the bottom of a page. No step split across pages. Tables whole, or split with the header
      row repeated.
- [ ] Footer shows the title and the page number at the right margin.

## Log and state

- [ ] Work log Done row: live file name, pages, figures with sources, checks run.
- [ ] Left-out items and questions logged, grouped by who answers.
- [ ] `_QRG - state.md` updated (and the hub row, if the project has a hub).
