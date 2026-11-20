// build_playbook.js: builds the QRG Playbook, a Word guide to the team's QRG process for consultants, change managers,
// and reviewers who do not read code. It uses the same house-style helpers as the guides (lib/docx_helpers.js), so it
// is Google-safe in the same ways: real headings, fixed-width tables, real tabs, alt text, one body font.
// The generator is the master. Do not hand-edit the built file; change this script and rebuild.
// Usage (from anywhere):
//   node build_playbook.js ["<out folder>"] [--status=DRAFT]
// Output: "<out folder>/QRG Playbook - <STATUS> <YYYYMMDD-HHMM>.docx" (default out folder: the current folder).
// Pictures: playbook/assets/example_page_01.png and _02.png are the two rendered pages of the worked example guide
// (scripts/new_guide.js --example). Rebuild them only if the example guide changes.
// Check after a build:  node tools/gdocs_lint.js --page=letter --full-width --fonts="Calibri,Courier New" "<file>"
const fs = require("fs");
const path = require("path");
const { stamp, arg } = require("../lib/config");
const { makeHelpers } = require("../lib/docx_helpers");

const KIT = path.resolve(__dirname, "..");
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8")).version;
const STATUS = arg("status") || "DRAFT";
if (!/^[A-Z]+$/.test(STATUS)) { console.error("STOP: --status must be capital letters"); process.exit(2); }
const OUT_DIR = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) || ".");
const ASSETS = path.join(__dirname, "assets");
const DOT = String.fromCharCode(0xB7); // middle dot, as in the guide footers

const cfg = {
  author: "Change Management", page: "letter", font: "Calibri", figureMaxHeightIn: 7.0,
  palette: { accent: "C00000", heading: "8B0000", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
};
const H = makeHelpers(cfg, {});
const { h2, h3, para, num, bullet, callout, refTable, titleBlock, afig, Paragraph, TextRun, ShadingType } = H;

// A command block: one shaded Courier New paragraph per line, kept together on one page.
function code(lines) {
  return lines.map((l, i) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    indent: { left: 240 },
    keepLines: true,
    ...(i < lines.length - 1 ? { keepNext: true } : {}),
    spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 140 : 0 },
    children: [new TextRun({ text: l, font: "Courier New", size: 17 })],
  }));
}

function body() {
  const b = [];
  let secN = 0;
  const sec = (t) => h2(++secN + ". " + t);
  b.push(...titleBlock("QRG Playbook", "How our team builds, checks, and releases Quick Reference Guides",
    "For consultants, change managers, and reviewers  |  Kit " + KIT_VERSION));

  // 1
  b.push(sec("What this playbook covers"));
  b.push(para("A Quick Reference Guide (QRG) is a short Word job aid for one task, for one role in one unit. A reader "
    + "keeps it open beside the system and follows it step by step. This playbook explains how the team makes QRGs so "
    + "that every guide reads the same way, every step is accurate, and the reviewer reads each version once."));
  b.push(para("The process runs on two things: the **qrg-builder** skill for Claude Code (instructions Claude follows) "
    + "and the **QRG kit** (Node scripts that build, check, render, and release the guides). You can run the whole "
    + "process with Claude Code, or run each command yourself."));
  b.push(refTable(["Part", "What it is for"], [
    ["Sections 2 to 4", "Why the process works the way it does, who does what, and the end-to-end flow"],
    ["Sections 5 to 8", "What a finished guide looks like, and the writing, screenshot, and evidence rules"],
    ["Section 9", "The review gate: lock, OK List, fix rounds, send copies"],
    ["Sections 10 to 12", "Setting up, starting a new project, and working with Claude Code"],
    ["Sections 13 and 14", "Fixing common problems, and where to find the full rules"],
  ], [2600, 6760]));

  // 2
  b.push(sec("Why we do it this way"));
  b.push(para("QRGs are a change-management instrument, not just documentation. Each rule in this playbook protects "
    + "one of three things: the reader's trust in the guides, the reviewer's time, and the guides' usefulness after "
    + "go-live."));
  b.push(h3("Where QRGs sit in ADKAR"));
  b.push(para("QRGs build Knowledge and Ability. They do not create Awareness or Desire, and they cannot make up for "
    + "missing ones. A guide handed to someone who does not know why the change is happening is filed and forgotten.", { keepNext: true }));
  b.push(refTable(["ADKAR element", "What builds it", "What the QRG process adds"], [
    ["Awareness", "Sponsor and leader messages on why the change is happening", "Nothing directly. Check that the why-message went out before guides land."],
    ["Desire", "Leaders and unit leads; what changes for the user and why it is worth it", "Nothing directly. Short, accurate guides lower the cost of trying the new way."],
    ["Knowledge", "Training, demos, guides", "The steps in the order the screen shows them, with marked screenshots."],
    ["Ability", "Practice on a real login, floor support, guides at the desk", "One action per step, written for use at the desk, with troubleshooting for real problems."],
    ["Reinforcement", "Leaders checking use, metrics, updates when the system changes", "Evergreen text, a review gate for every change, a version history, and a list for the next round."],
  ], [1700, 3500, 4160]));
  b.push(callout("Guides are not a substitute for Awareness and Desire. Before the first guides go out, confirm with the "
    + "change lead that the why-message and the leader messages have landed.", "warn"));
  b.push(h3("The three things the rules protect"));
  b.push(bullet("**Trust.** Readers follow a guide literally. One wrong step makes them doubt every other guide. So a "
    + "step goes in only when it was shown on screen or stated by the process owner, and a gap is left out and logged "
    + "as a question, never guessed."));
  b.push(bullet("**Reviewer time.** Reviewers are often busy client leads. The lock and the OK List make each "
    + "version one exact file, so the reviewer reads it once, and any change after an OK is visible."));
  b.push(bullet("**Life after go-live.** Guides stay in use long after training ends. So they carry no session "
    + "references, names, or dates, and they never point at other guides by title (titles change)."));
  b.push(h3("Systems effects to watch"));
  b.push(bullet("A fix in one unit's guide usually applies to the same guide in the other units. The rule is the same "
    + "fix everywhere, except guides that are frozen (under review or already sent), which go on the next round's list."));
  b.push(bullet("A reviewer's comment often states a general rule (\"markers stay in their own section\"). Apply it to "
    + "every guide you touch, and add it to the project's rules so the next guide starts right."));
  b.push(bullet("A hand edit in a Word file is lost at the next build, or blocks it. That is why the generator is the "
    + "master and reviewers comment on the OK List instead of in Word."));

  // 3
  b.push(sec("Roles"));
  b.push(refTable(["Role", "Usually", "Does", "Does not"], [
    ["Builder", "A consultant, often with Claude Code", "Gathers evidence, writes guides, makes screenshots, builds, checks, renders, reads every page, logs questions", "Lock guides or make send copies"],
    ["Lead", "One person (or one Claude session) per project", "Locks guides, builds the OK List, makes send copies, keeps the state file current", "Give the OK to send"],
    ["Process owner", "Client business owner", "Answers scope and process questions, settles conflicts between sources", "Format or proof guides"],
    ["Reviewer", "Change manager or client reviewer", "Reads each locked PDF, picks a call and comments on the OK List", "Edit the Word files"],
    ["Publisher", "A person on the team", "Moves send copies to the shared or client location", "Skip the gate"],
    ["Claude Code", "Assistant to the builder and lead", "Runs the loop, drafts, checks, reports, asks questions", "Publish, send email, or write to cloud folders"],
  ], [1500, 2200, 3700, 1960]));

  // 4
  b.push(sec("The flow, end to end"));
  b.push(para("Each stage has a gate. Work moves on only when the gate is met.", { keepNext: true }));
  b.push(refTable(["Stage", "What happens", "Output", "Gate"], [
    ["1. Scope", "Task list per role and unit, out-of-scope list, and the screenshot privacy rule", "Unit addendum", "Process owner agrees the task list"],
    ["2. Evidence", "Captions searched, frames pulled and checked, process owner answers", "A brief per guide, questions by who answers", "Every step is shown or stated"],
    ["3. Draft", "Guide file, marked screenshots, scratch build, automated QA, Word render", "Scratch Word file, page images", "QA clean, every page read"],
    ["4. Live build", "Build, QA, Word proof, clean scan, render", "Live Word file and PDF", "Definition of done met"],
    ["5. Lock", "The lead records the exact file (its SHA-256 fingerprint) and how this version was reached", "Lock record", "The lock refuses anything unchecked"],
    ["6. OK List", "The reviewer reads each PDF and picks a call", "OK List workbook", "The reviewer's call"],
    ["7. Fix round", "Every comment handled, guides rebuilt, relocked, new OK List", "New OK List", "Back to stage 5"],
    ["8. Send copies", "Clean-named copies of guides picked OK whose file still matches its lock", "Local send folder and manifest", "File unchanged since its lock"],
    ["9. Publish", "A person moves the copies to the shared or client location", "Delivered guides", "People only"],
  ], [1450, 3610, 2200, 2100]));

  // 5
  b.push(sec("What a finished guide looks like"));
  b.push(para("Every guide has the same six sections, in this order. The automated QA checks the order.", { keepNext: true }));
  b.push(refTable(["Section", "What goes there"], [
    ["Purpose", "One or two sentences: what the task is and why the reader does it"],
    ["Who does this", "**Who:** the role. **When:** the trigger that tells the reader it is time"],
    ["Before you start", "What must be true first: access, a record in a given status, a document at hand"],
    ["Steps", "One continuous numbered list, grouped under short headings, with marked screenshots"],
    ["What happens next", "What the reader sees when it worked, and what happens downstream"],
    ["Troubleshooting", "A two-column table: the situation the reader sees, and what to do"],
  ], [2400, 6960]));
  b.push(para("The two pages below are the worked example that comes with the kit. Its screen is a drawing made by "
    + "the kit, not a real system, so it can be shared freely.", { keepNext: true }));
  b.push(...afig(ASSETS, "example_page_01.png", "Figure 1. Page 1 of the example guide: title block, the first three sections, and the first steps with a marked screenshot", 5.0));
  b.push(bullet("The badge numbers on the screenshot match the step numbers, and the caption names those steps."));
  b.push(bullet("On-screen labels are bold and spelled exactly as the screen shows them."));
  b.push(bullet("The footer carries the guide title and the unit, and the page number at the right margin."));
  b.push(...afig(ASSETS, "example_page_02.png", "Figure 2. Page 2 of the example guide: more steps, a TIP, What happens next, and Troubleshooting", 5.0));
  b.push(bullet("The step list continues from page 1 (steps 3 to 5); it does not restart under each heading."));
  b.push(bullet("The figure only marks steps from its own section, and sits right after them."));
  b.push(bullet("Troubleshooting rows describe what the reader sees, then what to do about it."));

  // 6
  b.push(sec("Writing rules, short version"));
  b.push(para("The full rules, with the reason for each, are in the skill's content rules. These are the ones reviewers "
    + "flag most.", { keepNext: true }));
  b.push(num("**Facts only.** A step goes in only when it is shown or stated. Unconfirmed steps are left out and logged with a question, never hedged (no TBD, \"check with\", or \"probably\").", "steps"));
  b.push(num("**One click, one step.** A short imperative: \"Click **Save**.\" \"In **Status**, select **Closed**.\"", "steps"));
  b.push(num("**Bold the on-screen label,** spelled as the screen shows it. If the label looks wrong, keep it and raise a question.", "steps"));
  b.push(num("**One continuous step list** per guide. Badge numbers are step numbers.", "steps"));
  b.push(num("**Evergreen.** No people's names, dates, session references, or guide numbers. Role names only.", "steps"));
  b.push(num("**No cross-references** to other guides by title or number. Name the task in plain words instead.", "steps"));
  b.push(num("**Professional tone,** mostly third person, using the client's own names for apps, lists, and queues.", "steps"));
  b.push(num("**House style.** American English, no em or en dashes, \"select\" and \"clear\" for check boxes, \"gray\" not \"grey\".", "steps"));
  b.push(num("**Few callouts.** TIP for a shortcut, NOTE for a needed fact, IMPORTANT for harm or rework if missed.", "steps"));
  b.push(num("**Unit fit.** Each unit's own names and content. The same fix goes into every unit's copy of a guide, except frozen ones.", "steps"));
  b.push(callout("No invented process. If the system allows something the team does not want, the guide says so plainly "
    + "and teaches the team rule, but only a rule the process owner or unit lead actually stated.", "note"));

  // 7
  b.push(sec("Screenshot rules, short version"));
  b.push(bullet("**Coarse to fine.** Search the captions for the task, look at a short window of the recording, pull the exact frame, then look at it before you use it. Never use a contact-sheet tile as a figure."));
  b.push(bullet("**Frame order.** Your own captures of the real system first, then recordings from the same unit and role, then another unit's screen only when no unit name or unit-only label shows."));
  b.push(bullet("**Crop off** the browser bar, taskbar, meeting controls, chat, and admin banners. The first view of a page is a wide, establishing shot; later views can be tighter."));
  b.push(bullet("**Wide, shallow screens** (a toolbar, a long row of fields) are not shrunk to page width. Use the kit's torn-edge cut-away to keep every control the steps name."));
  b.push(bullet("**A red box and a numbered badge** on each click. All badges in a guide print at the same size."));
  b.push(bullet("**Privacy is decided once per project** with the reviewer and written in the unit addendum. Redaction is a white box in the figure settings; source images are never edited. Real customer personal data never goes in a figure."));
  b.push(bullet("**No source, no figure.** If no frame shows a click, write the step without a figure and log it for later. Never use a wrong screen."));

  // 8
  b.push(sec("Evidence and questions"));
  b.push(para("Every claim in a guide has a known source, and every gap becomes a specific question to a named role.", { keepNext: true }));
  b.push(refTable(["Label", "Means", "Example"], [
    ["Shown", "You looked at the frame, screenshot, or live screen yourself", "Recording part 2 at 01:12:40, frame checked"],
    ["Stated", "Words only: captions, transcript, the process owner's answer, meeting notes", "Process owner, written answer"],
    ["Other-unit", "Shown, but on another unit's screen with no unit label visible", "Unit 2 recording at 00:41:10"],
  ], [1500, 4300, 3560]));
  b.push(h3("When sources disagree"));
  b.push(para("Follow this order and log the conflict: (1) the process owner's decision, (2) the unit lead's or reviewer's "
    + "comments, (3) real screens, newest first, (4) guides already approved for another unit, for shared screens only, "
    + "(5) older documents such as decks and design notes. A deck says what was planned; a recent screen shows what was "
    + "built. If the newest screen contradicts the process owner, ask."));
  b.push(h3("Questions"));
  b.push(para("Group open questions by who answers them, so one message clears a batch: the process owner (scope and "
    + "what to teach), the build team (system behavior and permissions), the unit lead (team rules), and the reviewer "
    + "(format and tone). Write each question so the answer can go straight into the guide: one fact, yes or no or a "
    + "short value. Ten sharp questions get answered; forty vague ones do not."));

  // 9
  b.push(sec("Review and release"));
  b.push(para("The gate exists so the file the reviewer reads is the exact file that gets sent. Without it, a guide gets "
    + "\"one more small fix\" after the OK, nobody rereads it, and the error ships under the reviewer's name."));
  b.push(h3("Lock"));
  b.push(para("The lead locks a guide after its pages were read. The lock records the file's SHA-256 fingerprint, its "
    + "render, and a short note on how this version was reached (for example \"fix round 2: comments on steps 4 and 7\"). "
    + "The lock refuses a file that has no render from that exact file, has a QA finding, was edited after it was "
    + "built, or has tracked changes, comments, hidden text, or highlighting."));
  b.push(h3("OK List"));
  b.push(para("The OK List is an Excel workbook with one row per guide, a PDF link, a Word link, the lock note, and what "
    + "to check first. Each row has a status:", { keepNext: true }));
  b.push(refTable(["Status", "Means", "The reviewer"], [
    ["Done, waiting for OK", "Locked, and the file is unchanged since its lock", "Reads the PDF and picks a call"],
    ["Lock broken", "The file changed after it was locked", "Waits for a relock"],
    ["Not locked", "Still being built or checked", "Skips it"],
  ], [2400, 4000, 2960]));
  b.push(para("The reviewer picks one call per row and can add a comment:", { keepNext: true }));
  b.push(refTable(["Your call", "What happens"], [
    ["OK to send", "A send copy is made"],
    ["OK to send, note for later", "A send copy is made; the comment goes on the next round's list"],
    ["Fix before sending", "The comment goes into a fix round; the guide comes back on a new OK List"],
  ], [3200, 6160]));
  b.push(para("**Carry-forward.** Each new OK List copies the earlier calls and comments, but only for a guide whose "
    + "locked file has not changed. A rebuilt guide comes back blank, marked as changed, with its earlier call shown, so "
    + "the reviewer rereads it."));
  b.push(callout("For the reviewer: work in the newest OK List only; save and close it before the next one is built (the "
    + "script stops if it is open); comment in the sheet, not in the Word file.", "tip"));
  b.push(h3("Fix rounds"));
  b.push(num("Copy the reviewer's comments out of the sheet word for word.", "steps2"));
  b.push(num("Handle every comment: done, or skipped with a reason the reviewer will see. None is dropped.", "steps2"));
  b.push(num("Make the same fix in the same guide in the other units, unless that guide is frozen.", "steps2"));
  b.push(num("Where the reviewer gave new wording, keep the meaning and fix any typos.", "steps2"));
  b.push(num("Rebuild, QA, render, read every page, relock with a note naming the round, and build a new OK List.", "steps2"));
  b.push(h3("Send copies"));
  b.push(para("Send copies are made only for guides picked OK to send whose file still matches its lock, and that are "
    + "not on hold. Their names drop the guide number, status, and time stamp. They land in a local send folder with a "
    + "manifest. An earlier copy the script made is moved aside, never deleted. Then a person moves the copies to the "
    + "shared or client location. Claude Code never does this step."));

  // 10
  b.push(sec("Setting up for the first time"));
  b.push(refTable(["You need", "Why"], [
    ["Windows 10 or 11 with desktop Microsoft Word", "Word renders the guides to PDF and checks spelling and grammar"],
    ["Git for Windows (Git Bash)", "The commands are written for Git Bash"],
    ["Node.js 20 or newer", "Every kit script is Node"],
    ["Claude Code (optional)", "Runs the process for you from plain requests"],
  ], [4000, 5360]));
  b.push(num("Get the skill zip (\"QRG Builder Skill - <stamp>.zip\") from a teammate. Save it in its own new, empty folder.", "steps3"));
  b.push(num("Unzip it into the **.claude\\skills** folder in your Windows user folder, so you have **.claude\\skills\\qrg-builder**. Make the skills folder first if it is not there.", "steps3"));
  b.push(num("In Git Bash, install the packages and run the health check. It should end with **RESULT: kit ready**.", "steps3", true));
  b.push(...code(["cd ~/.claude/skills/qrg-builder/kit", "npm install", "npm run check"]));
  b.push(callout("Never run npm install with --omit=optional. It drops the image library's Windows part, and screenshots "
    + "stop working. The video tools are a separate, larger download (about 400 MB): npm run add-video, only if you will "
    + "pull frames from recordings.", "warn"));
  b.push(h3("Getting a newer kit"));
  b.push(para("One person on the team owns the skill. When the kit changes, the owner raises its version number, packs a new "
    + "zip (the pack step checks for dashes and for client and people's names first), and shares it. You rename your old "
    + "**qrg-builder** folder, unzip the new one, and run **npm install** and **npm run check** again. Each project keeps the "
    + "kit copy it was built with until you move it with **--upgrade-kit** (see the skill's setup notes). Rebuild one guide "
    + "and compare it with its last build before you rebuild the rest."));

  // 11
  b.push(sec("Starting a new project"));
  b.push(para("One command makes the project folder, its settings file, a copy of the kit, and the state and work-log "
    + "files. It never overwrites anything that exists.", { keepNext: true }));
  b.push(...code([
    "node ~/.claude/skills/qrg-builder/kit/scripts/init_project.js \\",
    "  --dir=\"C:/Users/<you>/Projects/<Client> QRGs\" --project=\"<Client>\" \\",
    "  --set=UNIT1-INV --label=\"Unit 1 Investigator\" \\",
    "  --unit-line=\"Unit 1 | Investigator\" --install",
  ]));
  b.push(para("Then build the worked example once, to prove the setup end to end:", { keepNext: true }));
  b.push(...code([
    "cd \"C:/Users/<you>/Projects/<Client> QRGs\"",
    "node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example",
    "QRG_SCRATCH=1 QRG_ONLY=\"Unit 1 Investigator 01 \" \\",
    "  node qrg_kit/build_qrgs.js --set=UNIT1-INV",
    "node qrg_kit/qa_qrgs.js --set=UNIT1-INV 01 --scratch",
    "node qrg_kit/scripts/render_guides.js \\",
    "  --file=\"sets/UNIT1-INV/_work/scratch/<the new .docx>\"",
  ]));
  b.push(para("Open the page images in **_work/render_scratch** and look at them. Then delete the example guide (its guide file and its assets folder) before you write your real guide 01."));
  b.push(h3("What you set per project"));
  b.push(refTable(["Setting", "Where", "Example"], [
    ["Project name, sets (one per audience), file prefix, unit line, footer tag", "qrg.config.json", "Set UNIT1-INV, prefix \"Unit 1 Investigator\""],
    ["People's names the guides must never contain", "qa_names.txt", "Every attendee and trainer name you see in the sources"],
    ["Internal system names and code words to ban", "qrg.config.json, qa.extraBanned", "A project code name"],
    ["Task list, out of scope, privacy rule, who answers what", "A unit addendum per set", "Copied from the skill's template"],
  ], [3700, 2600, 3060]));
  b.push(para("What you do not change per project: the six sections (unless the reviewer asks), the facts-only rule, and "
    + "the review gate."));

  // 12
  b.push(sec("Working with Claude Code"));
  b.push(para("Open Claude Code in the project folder and ask in plain words. Claude Code picks up the skill when a request "
    + "mentions a QRG, a quick reference guide, a job aid, or a work instruction. If it does not, say \"use the qrg-builder skill\".", { keepNext: true }));
  b.push(refTable(["You ask", "Claude Code does"], [
    ["\"Set up a QRG project for Unit 2 Supervisors\"", "Runs the setup, adds the set, and reports what it made"],
    ["\"Write QRG 03 from the part 2 recording, 01:10 to 01:25\"", "Searches the captions, pulls and checks frames, writes and builds the guide, runs every check, reads every page, and lists what it left out with questions"],
    ["\"Lock the Unit 1 guides and build the OK List\"", "Checks each guide, locks the ones that pass, explains any refusal, and builds the sheet"],
    ["\"Make the send copies\"", "Does a dry run first, makes the copies, and tells you where they are"],
  ], [3700, 5660]));
  b.push(h3("What the skill tells it not to do"));
  b.push(bullet("Publish anything, send email, or write to Google Drive or any shared or client folder. Every file stays local until a person moves it."));
  b.push(bullet("Guess a step. A step with no evidence is left out and comes back to you as a question."));
  b.push(bullet("Hand-edit a built Word file, or rebuild over someone's hand edits without folding them into the guide file first."));
  b.push(callout("These are instructions Claude Code follows, not a technical block. If your Claude Code can write to Google "
    + "Drive, a shared folder, or email, read what it proposes before you approve it, or deny those tools in your Claude Code "
    + "settings.", "note"));
  b.push(para("For a large batch, Claude Code can split the work across several helper agents. Each helper gets the same "
    + "written brief and its own list of guides; only the lead locks guides and builds the OK List."));

  // 13
  b.push(sec("Troubleshooting"));
  b.push(refTable(["Situation", "What to do"], [
    ["A script says the kit's packages are not installed", "Run **npm install** in the kit folder it names"],
    ["Screenshots fail with a message about sharp", "Run **npm install** again without --omit=optional, then **npm run check**"],
    ["The health check says Word is not registered for COM", "Install desktop Word. The web version cannot render"],
    ["A render waits a long time", "Another render holds the Word lock. It frees itself when that run ends, or after 10 minutes if a run crashed"],
    ["A build stops because the Word file was edited after it was built", "Someone edited the output. Compare it with the last build, fold the edits into the guide file, then rebuild"],
    ["The OK List shows Lock broken", "The file changed after its lock. Read the new pages and relock before the reviewer picks"],
    ["The reviewer commented in the Word file", "Copy the comments into the fix list, fix them in the guide file, rebuild. Never send the commented file"],
    ["Two sources disagree on a step", "Follow the source order in section 8 (When sources disagree), log the conflict, and ask if the newest screen contradicts the process owner"],
    ["No recording shows a click", "Write the step without a figure, log it as a later improvement, and add it to the watch list for the next session"],
  ], [3600, 5760]));

  // 14
  b.push(sec("Where to find more"));
  b.push(refTable(["File (in the skill folder)", "Read it for"], [
    ["SKILL.md", "The full process Claude Code follows, with every command"],
    ["references/content_rules.md", "Every writing rule, with the reason for each"],
    ["references/screenshot_rules.md", "Finding frames, cropping, boxes and badges, privacy"],
    ["references/evidence_and_questions.md", "Shown or stated, source order, the left-out table, conflicts"],
    ["references/definition_of_done.md", "The checklist a guide must pass before it is locked"],
    ["references/review_and_release.md", "Lock, OK List, fix rounds, send copies, in detail"],
    ["references/setup_for_teammates.md", "Setup step by step, including PowerShell use"],
    ["references/lessons_learned.md", "Problems seen on real projects and how they were fixed"],
    ["kit/README.md", "Every setting and every script option"],
  ], [3900, 5460]));
  return b;
}

(async () => {
  const doc = H.makeDocument({ docTitle: "QRG Playbook", footerLeft: "QRG Playbook  " + DOT + "  Kit " + KIT_VERSION, body });
  const buf = await H.pack(doc);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "QRG Playbook - " + STATUS + " " + stamp() + ".docx");
  if (fs.existsSync(out)) { console.error("STOP: " + path.basename(out) + " already exists. Wait a minute and rerun."); process.exit(2); }
  fs.writeFileSync(out, buf);
  console.log("wrote " + out + " (" + Math.round(buf.length / 1024) + " KB, kit " + KIT_VERSION + ")");
})();
