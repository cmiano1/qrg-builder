# Screenshot rules

Screenshots are where most reviewer comments land. A wrong screen, a badge on the wrong control, or an unreadable
crop costs more trust than a typo. Commands are in `kit/tools/README.md`.

## 1. Finding the frame (coarse to fine)

Never inspect a long video frame by frame, and never pull every frame.

1. **Captions or transcript first.** Check the video for an embedded caption track before transcribing
   (`ffprobe`, look for `codec_type=subtitle`; `tools/extract_captions_vtt.js` pulls it out). Caption timing is
   usually accurate; caption wording often is not (names, acronyms, product terms).
2. **Search the captions** for the task ("log a call", "new contact"), and note the times.
3. **Look at a short window** around each time with `tools/window_contact_sheet.js` (a few minutes, one tile every
   5 to 30 seconds). Do not run scene sampling over a multi-hour video.
4. **Pull the exact frame** from the original video with `tools/extract_video_frame.js ... --fast-seek`, straight
   into `assets/<key>NN/src/`. A contact-sheet tile is never a figure.
5. **Look at the frame** before you use it. Check that it shows the screen the step names, on the right role's
   login, in the right unit.

## 2. Which frames to use (in order)

1. Your own captures of the real system, logged in as the role the guide is for.
2. Recording frames from a session for the same unit and role.
3. Frames from another unit or role, only when the screen shows no other unit's name, app name, queue, folder, or
   record type (crop or redact it).

Never use a frame that shows a personal email inbox, a chat window, or a meeting window. Avoid frames with an admin
"Logged in as" banner; crop it off if the rest is right. Avoid frames with test data that looks wrong to a real
user ("asdf", "Test Test") when a better frame exists.

## 3. Cropping

- **Crop off:** browser tabs and address bar, the OS taskbar or dock, meeting controls, video tiles, and admin banners.
- **Do not overcrop.** The reader needs to know where they are. The first figure of a page is an establishing
  view (most of the page); later figures can be tighter.
- **Wide, shallow screens** (a toolbar, a long row of fields) shrink until the text cannot be read when shown at
  page width. Do not crop away a control the steps name. Use a torn-edge cut-away instead
  (`tools/cutaway_screenshot.js`): keep the parts that matter, join them with a visible white tear, and keep every
  control the steps name.
- **Very tall crops** get narrow because figure height is capped (5.25 in by default). Crop tighter, or split the
  screen into two figures.
- **Small crops stay small.** Pass a width to `afig()` (a full-width figure is 6.5 in). Do not blow a small crop
  up to page width.
- No mouse pointer in the middle of the image unless it sits on the control being clicked.

## 4. Boxes and badges

- A brand-accent box (`palette.accent` from `qrg.config.json`, red by default) on what to click, with a numbered badge. **Badge number = step number.**
- Put `"badgeIn": 0.24` and `"guide": "../../guides/NN.js"` in every `annotate.json`. Then every badge prints at
  the same size across the guide, and small crops are upscaled so edges stay sharp. Re-run the whole manifest after
  any change, so all figures in the guide match.
- A badge never covers the label it points at, and badges never overlap each other. Move the badge (`tl`, `tr`,
  `bl`, `br`, `l`, `r`, `t`, `b`, `in`) or widen the box.
- A badge only marks steps that come before the figure in the same section (`content_rules.md` section 8).
- Use `--grid` to get a 50 px grid copy for picking coordinates. Box and redact coordinates are post-crop pixels.
- Look at every output PNG: the box sits on the right control, the number is right, nothing is covered.

## 5. Privacy

Decide this once per project with the reviewer, and write it in the unit addendum:

- Whether people's names, email addresses, record numbers, and addresses may show as captured, or must be redacted.
  (A common split: names and record numbers show as captured, real staff email addresses are covered with a white box.)
- Redaction is a white box in `annotate.json` `redact`, never an edit of the source PNG.
- Real client or customer personal data (a member's health details, a claimant's address) should not be in a
  figure at all. Find another frame.

## 6. Provenance

- Source PNGs in `src/` are never edited. Every derived figure is made by a script from `annotate.json` (and
  `cutaway_screenshot.js` for cut-aways), so any figure can be rebuilt.
- Each figure's `note` says what it shows, its source file or video, and the time
  (for example `"Log a Call form, recording part 2 at 01:12:40, frame checked"`).
- The annotator writes `out/provenance.json` (source, crop, redactions, boxes, output).
