# Evidence, questions, and conflicts

A guide is only as good as the evidence behind each step. Readers follow it literally, and a wrong step costs them
time and costs the project trust in every other guide. So every claim has a known source, and every gap becomes a
specific question to a named role.

## 1. Shown or stated

Label every claim in your brief and work log:

| Label | Means | Example |
|---|---|---|
| **shown** | You looked at the frame, screenshot, or live screen yourself | "shown: recording part 2 at 01:12:40, frame checked" |
| **stated** | Words only: captions, a transcript, the process owner's answer, meeting notes | "stated: process owner, chat answer 03/14/2027" |
| **other-unit** | Shown, but on another unit's screen | "other-unit shown: Unit 2 recording at 00:41:10, no unit label on screen" |

When a claim rests on captions or notes (who did a step, on which login, what a button or status said), pull the
frame at that time and look before you call it shown. Do not skip this to save time.

## 2. Source order

When sources disagree, follow this order, and log the conflict:

1. The process owner's decision (in writing, or stated in a meeting you can cite).
2. Unit feedback: the unit lead's or the client reviewer's comments on a guide.
3. Real screens: recordings and captures of the real system, newest first.
4. Guides already approved for another unit (for shared screens only).
5. Older documents: decks, design notes, user stories.

A deck or a design note says what was planned. A recent screen shows what was built. Teach what the screen shows.
If the newest screen contradicts the process owner, ask; do not pick one silently.

## 3. Left out until answered

A step, field, rule, or figure that is not shown or stated is left out of the guide. In the work log:

| Guide | Left out | Why | Question | Who answers |
|---|---|---|---|---|
| UNIT1-INV 04 | What happens after **Submit** | Recording cuts away before the confirmation | After Submit, what does the case Status change to, and who is told? | Build team |

Write the question so the answer can go straight into the guide: one fact per question, yes or no or a short value
where possible. When it is answered, add the step, rebuild, and move the row to Done with the source.

## 4. Questions by who answers

Group open questions by the person or role who can answer, so one message per person clears a batch:

- **Process owner:** scope, wording, what to teach, which unit a rule applies to.
- **Build team:** system behavior, configuration, permissions, automation, bugs.
- **Unit lead:** team rules and day-to-day process the system does not enforce.
- **Reviewer:** format, tone, screenshots, what counts as done.

Keep the list short and specific. Ten sharp questions get answered; forty vague ones do not.

## 5. Team rules

When the system allows something the team does not want (for example closing your own case), the guide teaches the
team rule, and says plainly that the system does not stop it: "The system does not stop this, so follow the team
rule: ...". Only write a team rule the process owner or unit lead stated. Never claim a permission limit unless a
frame shows it.

## 6. Watch list for the next session

If more training or testing sessions are coming, keep a watch list: things to confirm on screen next time. For
each, give the guide, what to look for, and what changes in the guide if it differs. After the session, check each
item against the new recording, then update the guides and clear the list.

## 7. Dry-run check

Steps that can only be confirmed by clicking once on a real login (a role-specific button, an email that should
arrive). List them with the guide, the steps, the login needed, and the expected result. Record the result in the
work log, and fix the guide if it differs.

## 8. Conflicts

| ID | Guide | Source A says | Source B says | Followed | Why | Status |
|---|---|---|---|---|---|---|

Give each conflict an ID so later notes can refer to it. Keep resolved ones; they explain why a guide says what it says.

## 9. Out of scope

Keep a per-set out-of-scope list in the unit addendum: tasks this role does not do, tasks dropped by the process
owner, and features not live yet. A guide for an out-of-scope task is not built; it goes in the work log's
"Not built" table with what would unblock it.
