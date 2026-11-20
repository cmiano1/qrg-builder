# Content rules: how to write a QRG

A QRG is a short, evergreen, Standard US Letter Word guide for one task, for one role in one unit. It is a desk
reference for anyone in the role, now or a year from now. It is not a record of a training class, and it is not a design
document.

These rules come from real reviewer comments on real guide sets. Each one exists because a reviewer flagged its
absence. The QA (`qa_qrgs.js`) checks the ones a script can check; you check the rest by reading the rendered pages.

## 1. Facts only

1. **A step goes in only if it is shown or stated.** Shown: you saw it happen in a recording frame, a screenshot,
   or a test login, and you checked the frame. Stated: the process owner said it (in a meeting, a comment, or a
   chat answer). See `evidence_and_questions.md`.
2. **Unconfirmed steps are left out, never hedged.** No "TBD", "check with", "[confirm]", "probably", "should",
   or reviewer flags in a guide. Each left-out item goes in the work log's "Left out until answered" table with
   the question that would settle it.
3. **No invented process.** Do not write team rules ("your unit decides when"), nice-to-have advice, or best
   practice that nobody stated. If a rule is a team agreement the system does not enforce, say so plainly
   ("The system does not stop this. The team rule is ...") and only when the process owner stated it.
4. **Teach what the newest real screen shows.** When a deck, a document, and a recording disagree, the newest real
   screen wins, and the conflict goes in the work log.
5. **Never teach practice-site behavior.** If a demo or test site behaves differently from the real one (a
   missing button, test data, an admin banner), teach the real behavior or leave the step out.

## 2. Evergreen text

- Zero dates inside evergreen QRG text and no "Last updated" line (QA rejects dates in guide text). Use `MM/DD/YYYY`
  only in work logs (`_QRG work log.md`), briefs, and state files (`_QRG - state.md`).
- No session references or attendee or trainer names in guide text.
- Never the words session, training, recording, walkthrough, sandbox, UAT, TBD, trainer, trainee, reviewer, dry run,
  facilitator (the QA fails on them; `qa.sessionWords` can change the list per project).
- Role names only: "the Supervisor", "the system administrator", "Support Staff". Never a person's name. Put every
  name you see in the sources in `qa_names.txt` so the QA catches it.
- No guide numbers in the text ("Guide 03", "INV-03"). Numbers are for file names and come off at delivery.

## 3. No cross-references

- Never name another guide by title or number, and no "Related guides" section. Titles change after delivery and
  the old name stays behind in every other guide. The QA fails on any other guide title in the set.
- If another task matters, name it in plain words ("check the case for duplicates first") or give the steps.

## 4. Sections, in order, in every guide

| Section | What goes there |
|---|---|
| Purpose | One or two sentences: what the task is and why the reader does it. |
| Who does this | **Who:** the role. **When:** the trigger that tells the reader it is time. |
| Before you start | What must be true first: access, a record in a given status, a document at hand. |
| Steps | One continuous numbered list, grouped under short h3 headings. |
| What happens next | What the reader sees when it worked, and what happens downstream (who is told, what changes). |
| Troubleshooting | A two-column table, Situation and What to do, widths [3400, 5800]. |

The order comes from `qrg.config.json` `sections`, and the QA checks it. Change it there, per project, only if the
reviewer asks.

## 5. Steps

- **One click, one step** for the processes the reviewer calls important. A step is a short imperative:
  "Click **Save**." "In **Status**, select **Closed**."
- **Bold the on-screen label**, spelled exactly as the screen shows it (case, spacing, punctuation). If you think
  the screen label is wrong, keep it as shown and raise it as a question; do not silently "fix" what the screen says.
- **One numbered list per guide**, continuous across h3 headings and figures. Do not restart at 1 in each part.
- Name things fully in prose: "the **Case Participants** list on the case record", not "the list"; "the case
  owner", not "they".
- A step the reader may skip says when: "If the contact is new, click **New Contact**."
- Every step is something the reader can do now. Background goes in Purpose, a callout, or What happens next.

## 6. Prose tone

- Purpose, notes, What happens next, and Troubleshooting are professional and mostly third person, using the
  project's own terms (the role names, record names, list views, and queues the users see). Never "someone".
- Plain words, short sentences. No filler (leverage, robust, seamless, delve, elevate, unlock, tapestry).
- American English: "gray" not "grey", "organize" not "organise", "toward" not "towards". Zero dates inside QRG prose
  (use `MM/DD/YYYY` only in work logs, briefs, and state files). No em or en dashes anywhere: use a colon, comma,
  period, or parentheses.
- **Check boxes:** "select" and "clear" (or "check" and "uncheck"), never "tick" or "untick".
- **Quoted on-screen messages:** a quoted or bolded message in the middle of a sentence drops its own final
  period ("When the window says **Case Reopened successfully**, click **Exit**."). A message that ends its own
  sentence keeps one period.

## 7. Callouts

`callout(text, "tip" | "note" | "warn")` prints a one-cell box labeled TIP, NOTE, or IMPORTANT.

- TIP: a shortcut or a way to avoid rework. NOTE: a fact the reader needs that is not a step. IMPORTANT: something
  that causes harm or rework if missed (data loss, a record sent to the wrong person, an action that cannot be undone).
- Keep callouts few. Three IMPORTANT boxes in one guide means none of them stands out.
- A callout right under a heading keeps with what follows; the build handles it.

## 8. Figures and captions

- Put each figure right after the steps it shows. A figure carries badges only for steps that come before it in
  the same section. If a later section needs the same screen, make a second figure from the same source frame with
  only that section's badge numbers. Never point a step at a figure in another section.
- Badge numbers are step numbers. Caption form, exactly:
  `Figure N. <what it shows> (step 5)`, `(steps 5 and 6)`, or `(steps 5 to 7)`. The QA matches caption steps to the
  badges in `annotate.json` by image hash.
- Number figures in order. After you insert or remove steps or figures, renumber every figure and every
  "(steps ...)" reference, including any in Before you start.
- Every section with clicks has its own screenshot when a source shows the screen. Give a less-cropped
  establishing view the first time the reader meets a page, then tighter crops.
- If no source shows a click, write the step and skip the figure. Log it as a later improvement. Never use a
  wrong screen.
- Call `afig(K, "<out png>", "<caption>", <width in>)` on one line, with K first; the annotator reads the width
  from that line to size badges.

## 9. Troubleshooting

- Each row is a situation the reader can see ("The **Submit** button is gray") and what to do about it.
- Use problems that were shown or stated: questions asked in training, errors seen in recordings, support tickets.
- "Contact the system administrator" is a fair answer when it is the real answer; say what to tell them.

## 10. Titles and file names

- A title is a task name in title case, short: "Log a Call on a Case". It is in the file name and the footer.
- No file-name-unsafe characters (`\ / : * ? " < > | # % &`). Commas and parentheses become words or are dropped.
- Keep `title: "..."` as a plain one-line string in the guide file (the QA reads it).
- Once a guide has a live build, change its title only if you must; then move its old live build to `_archive/`
  by hand, since the build only archives files with the same name.

## 11. Unit fit

- Use each unit's own app name, list views, queues, folders, and template names as its screens show them.
- Do not copy one unit's content into another unit's guide (its list names, its sharing rules, its extra steps).
- Prefer frames from the same unit. A frame from another unit is fine when the screen shows no unit name or
  unit-only label (crop or redact it). Say so in the figure's `note` in `annotate.json`.
- When the same fix applies to the same guide in several units, make it in every unit, unless that unit's guide is
  frozen (already sent or under review). Then list it for the next round.
- Per-set facts and limits go in a unit addendum (`unit_addendum_template.md`).
