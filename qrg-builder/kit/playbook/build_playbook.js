// build_playbook.js: builds the QRG Playbook, a Word guide to the team's QRG process for consultants, change managers,
// and reviewers who do not read code. It uses the same house-style helpers as the guides (lib/docx_helpers.js), so it
// is Google-safe in the same ways: real headings, fixed-width tables, real tabs, alt text, US Letter margins.
// The generator is the master. Do not hand-edit the built file; change this script and rebuild.
// Usage (from anywhere):
//   node build_playbook.js ["<out folder>"] [--out="<file.docx>"] [--status=DRAFT]
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
const OUT_FILE = arg("out");
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
  b.push(para("A Quick Reference Guide (QRG) is a short, evergreen, Standard US Letter Word guide for one task, for one "
    + "role in one unit. A reader keeps it open beside the system and follows it step by step. This playbook explains "
    + "how the team makes QRGs so that every guide reads the same way, every step is accurate, and the reviewer reads "
    + "each version once."));
  b.push(para("The process runs on two things: the **qrg-builder** Skill (instructions followed by Claude Code, "
    + "Antigravity, Codex, or Cursor) and the **QRG Kit** (cross-platform Node.js scripts that build, check, proof, "
    + "render, review, and stage guides on Windows, macOS, and Linux without requiring paid Microsoft Office). Use the "
    + "companion 2-page Quick-Start QRG (**Make QRGs with the QRG Builder Skill**) as a desk cheat sheet."));
  b.push(refTable(["Part", "What it is for"], [
    ["Sections 2 to 4", "Why the process works the way it does, who does what, and the end-to-end flow"],
    ["Sections 5 to 8", "What a finished QRG looks like, and the writing, screenshot, and evidence rules"],
    ["Section 9", "The review gate: Review Lock, Browser Review UI and OK List, fix rounds, Send Copies"],
    ["Sections 10 to 12", "Cross-platform setup (zip or Git, no-admin LibreOffice), starting a project, and using any AI tool or CLI"],
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
  b.push(bullet("**Trust.** Readers follow a QRG literally. One wrong step makes them doubt every other guide. So a "
    + "step goes in only when it was shown on screen or stated by the process owner, and a gap is left out and logged "
    + "as a question, never guessed."));
  b.push(bullet("**Reviewer time.** Reviewers are often busy client leads. The Review Lock and dual review surfaces "
    + "(Local Browser Review UI and .xlsx OK List) tie each decision to one exact SHA-256 build, so unchanged guides "
    + "carry forward and only real changes need rereading."));
  b.push(bullet("**Life after go-live.** QRGs stay in use long after training ends. So they carry zero dates, zero "
    + "people's names, zero session references, and zero cross-references to other guides by title (titles change)."));
  b.push(h3("Systems effects to watch"));
  b.push(bullet("A fix in one Set's QRG usually applies to the matching QRG in sibling Sets. Make the same fix "
    + "everywhere except frozen guides (already approved and staged), which go on the next round's list."));
  b.push(bullet("A reviewer's comment often states a general rule (\"markers stay in their own section\"). Apply it to "
    + "every guide you touch, and add it to the project's rules so the next guide starts right."));
  b.push(bullet("A hand edit in a built Word file is lost at the next build, or blocks it. That is why the Guide Source "
    + "is master and reviewers record comments in the Browser Review UI or OK List instead of in Word."));

  // 3
  b.push(sec("Roles"));
  b.push(refTable(["Role", "Usually", "Does", "Does not"], [
    ["Builder", "A consultant, often with an AI coding assistant", "Gathers evidence, writes Guide Sources, annotates screenshots, builds, runs QA and proofing, renders, inspects pages, logs questions", "Lock guides or stage Send Copies"],
    ["Lead", "One person (or one lead session) per project", "Applies Review Locks, opens or exports the OK List, stages Send Copies, keeps the state file current", "Give the OK to send"],
    ["Process owner", "Client business owner", "Answers scope and process questions, settles conflicts between sources", "Format or proof guides"],
    ["Reviewer", "Change manager or client reviewer", "Inspects rendered pages in the Browser Review UI or .xlsx OK List and records calls and comments", "Edit the built Word files"],
    ["Publisher", "A person on the team", "Delivers staged Send Copies from _send/ to the shared or client location", "Skip the review gate"],
    ["AI assistant (optional)", "Claude Code, Antigravity, Codex, or Cursor", "Follows SKILL.md, runs Kit commands, reviews extracted text for clarity, reports findings", "Publish, send email, or write to cloud folders"],
  ], [1550, 2250, 3600, 1960]));

  // 4
  b.push(sec("The flow, end to end"));
  b.push(para("Each stage has a gate. Work moves on only when the gate is met.", { keepNext: true }));
  b.push(refTable(["Stage", "What happens", "Output", "Gate"], [
    ["1. Scope", "Task list per Set, out-of-scope list, brand accent color, and screenshot privacy rule", "Unit addendum and config", "Process owner agrees the task list"],
    ["2. Evidence", "Captions searched, frames pulled and verified, process owner answers", "Brief per QRG, questions by owner", "Every step is shown or stated"],
    ["3. Draft", "Guide Source, annotated screenshots, scratch build, automated QA, LibreOffice Render", "Scratch .docx, US Letter PNGs", "QA clean, every page inspected"],
    ["4. Live build", "Build, QA, offline proofing (harper.js + qa_dictionary.txt), AI clarity review, clean scan, Render", "Working Deliverable .docx, PDF, PNGs", "Definition of done met"],
    ["5. Lock", "Lead records the live file's SHA-256 fingerprint, matching Render, and how this version was reached", "Review Lock record", "Lock refuses anything unchecked"],
    ["6. Review", "Reviewer inspects US Letter pages in the Browser Review UI or .xlsx OK List and picks a call", "Saved picks or OK List sheet", "Reviewer's call recorded"],
    ["7. Fix round", "Every comment handled, guides rebuilt, proofed, rendered, relocked, refreshed", "Updated review view or sheet", "Back to stage 5"],
    ["8. Send Copies", "Clean-named Word (.docx) copies of OK'd, verified locks (+ optional PDFs when requested)", "Local _send/ folder and manifest", "SHA-256 unchanged since lock"],
    ["9. Publish", "A person moves staged Send Copies to the shared or client location", "Delivered Final Deliverables", "People only"],
  ], [1450, 3610, 2200, 2100]));

  // 5
  b.push(sec("What a finished guide looks like"));
  b.push(para("Every QRG is strictly Standard US Letter (8.5 x 11 in, 1 in margins, 6.5 in content width, Calibri font "
    + "for Google Docs and LibreOffice Carlito parity) with the same six sections in order. Automated QA enforces the "
    + "page size and section order.", { keepNext: true }));
  b.push(refTable(["Section", "What goes there"], [
    ["Purpose", "One or two sentences: what the task is and why the reader does it"],
    ["Who does this", "**Who:** the role. **When:** the trigger that tells the reader it is time"],
    ["Before you start", "What must be true first: access, a record in a given status, a document at hand"],
    ["Steps", "One continuous numbered list, grouped under short headings, with marked screenshots"],
    ["What happens next", "What the reader sees when it worked, and what happens downstream"],
    ["Troubleshooting", "A two-column table: the situation the reader sees, and what to do"],
  ], [2400, 6960]));
  b.push(para("The two pages below are the worked example that ships with the Kit. Its screen is drawn by the Kit "
    + "rather than captured from a real client system, so it can be shared freely.", { keepNext: true }));
  b.push(...afig(ASSETS, "example_page_01.png", "Figure 1. Page 1 of the example guide: title block, the first three sections, and the first steps with a marked screenshot", 5.0));
  b.push(bullet("The badge numbers on the screenshot match the step numbers, and the caption names those steps."));
  b.push(bullet("On-screen labels are bold and spelled exactly as the screen shows them."));
  b.push(bullet("The footer carries the guide title and the Set tag, and the page number at the right margin."));
  b.push(...afig(ASSETS, "example_page_02.png", "Figure 2. Page 2 of the example guide: more steps, a TIP, What happens next, and Troubleshooting", 5.0));
  b.push(bullet("The step list continues from page 1 (steps 3 to 5); it does not restart under each heading."));
  b.push(bullet("The figure only marks steps from its own section, and sits right after them."));
  b.push(bullet("Troubleshooting rows describe what the reader sees, then what to do about it."));

  // 6
  b.push(sec("Writing rules, short version"));
  b.push(para("The full rules, with the reason for each, are in the Skill's content rules. These are the ones reviewers "
    + "flag most.", { keepNext: true }));
  b.push(num("**Facts only.** A step goes in only when it is shown or stated. Unconfirmed steps are left out and logged with a question, never hedged (no TBD, \"check with\", or \"probably\").", "steps"));
  b.push(num("**One click, one step.** A short imperative: \"Click **Save**.\" \"In **Status**, select **Closed**.\"", "steps"));
  b.push(num("**Bold the on-screen label,** spelled as the screen shows it. If the label looks wrong, keep it and raise a question.", "steps"));
  b.push(num("**One continuous step list** per guide. Badge numbers are step numbers.", "steps"));
  b.push(num("**Evergreen text and date rule.** Zero dates inside QRGs (no \"Last updated\" line), zero people's names, zero session references, and zero guide numbers. Use MM/DD/YYYY dates only in work logs, briefs, and state files.", "steps"));
  b.push(num("**No cross-references** to other guides by title or number. Name the task in plain words instead.", "steps"));
  b.push(num("**Professional tone,** mostly third person, using the client's own names for apps, lists, and queues.", "steps"));
  b.push(num("**House style.** American English, zero em or en dashes, \"select\" and \"clear\" for check boxes, \"gray\" not \"grey\".", "steps"));
  b.push(num("**Few callouts.** TIP for a shortcut, NOTE for a needed fact, IMPORTANT for harm or rework if missed.", "steps"));
  b.push(num("**Unit fit.** Each Set's own names and content. The same fix goes into every Set's copy of a guide, except frozen ones.", "steps"));
  b.push(callout("Offline proofing (harper.js + qa_dictionary.txt) catches mechanical spelling and grammar slips without "
    + "Word, and reading _work/qa_text_NN.txt catches clarity or meaning gaps. Never skip reading the extracted text.", "note"));

  // 7
  b.push(sec("Screenshot rules, short version"));
  b.push(bullet("**Coarse to fine.** Search the captions for the task, look at a short window of the recording, pull the exact frame, then inspect it before using it. Never use a contact-sheet tile as a figure."));
  b.push(bullet("**Frame order.** Your own captures of the real system first, then recordings from the same Set and role, then another unit's screen only when no unit name or unit-only label shows."));
  b.push(bullet("**Crop off** the browser bar, OS taskbar or dock, meeting controls, chat, and admin banners. The first view of a page is a wide, establishing shot; later views can be tighter."));
  b.push(bullet("**Wide, shallow screens** (a toolbar, a long row of fields) are not shrunk to page width. Use the Kit's torn-edge cut-away to keep every control the steps name."));
  b.push(bullet("**Brand-accent box and numbered badge** on each click (styled automatically from palette.accent in qrg.config.json, red by default). All badges in a guide print at uniform size across the 6.5 in US Letter width."));
  b.push(bullet("**Privacy is decided once per project** with the reviewer and written in the unit addendum. Redaction is a white box in annotate.json; source images are never edited. Real customer personal data never goes in a figure."));
  b.push(bullet("**No source, no figure.** If no frame shows a click, write the step without a figure and log it for later. Never use a wrong screen."));

  // 8
  b.push(sec("Evidence and questions"));
  b.push(para("Every claim in a QRG has a known source, and every gap becomes a specific question to a named role.", { keepNext: true }));
  b.push(refTable(["Label", "Means", "Example"], [
    ["Shown", "You looked at the frame, screenshot, or live screen yourself", "Recording part 2 at 01:12:40, frame checked"],
    ["Stated", "Words only: captions, transcript, the process owner's answer, meeting notes", "Process owner, written answer"],
    ["Other-unit", "Shown, but on another unit's screen with no unit label visible", "Unit 2 recording at 00:41:10"],
  ], [1500, 4300, 3560]));
  b.push(h3("When sources disagree"));
  b.push(para("Follow this order and log the conflict: (1) the process owner's decision, (2) the unit lead's or reviewer's "
    + "comments, (3) real screens, newest first, (4) guides already approved for another Set, for shared screens only, "
    + "(5) older documents such as decks and design notes. A deck says what was planned; a recent screen shows what was "
    + "built. If the newest screen contradicts the process owner, ask."));
  b.push(h3("Questions"));
  b.push(para("Group open questions by who answers them, so one message clears a batch: the process owner (scope and "
    + "what to teach), the build team (system behavior and permissions), the unit lead (team rules), and the reviewer "
    + "(format and tone). Write each question so the answer can go straight into the guide: one fact, yes or no or a "
    + "short value. Ten sharp questions get answered; forty vague ones do not."));

  // 9
  b.push(sec("Review and release"));
  b.push(para("The gate ensures that the exact build the reviewer inspected is the exact Final Deliverable staged for "
    + "delivery. Any edit after approval breaks the Review Lock visibly."));
  b.push(h3("Review Lock"));
  b.push(para("The lead locks a guide after its rendered pages are read. The lock records the live file's SHA-256 "
    + "fingerprint, its matching Render PDF and page count, and a short --how note (for example \"fix round 2: comments "
    + "on steps 4 and 7\"). Locking refuses any build with a missing or stale Render, a QA finding, a hand edit outside "
    + "the build, or a clean-scan blocker (tracked changes, comments, hidden text, highlight, or yellow shading)."));
  b.push(h3("Dual review surface: Browser Review UI and .xlsx OK List"));
  b.push(para("Reviewers can approve guides in either the **Local Browser Review UI** (no Microsoft Excel required) or "
    + "the **.xlsx OK List** workbook for external stakeholders. Both share the exact same SHA-256 Review Lock and "
    + "carry-forward rules:", { keepNext: true }));
  b.push(refTable(["Surface", "How to open", "Best for"], [
    ["Local Browser Review UI", "Run node qrg_kit/scripts/review_ui.js (opens locally on 127.0.0.1 in Chrome, Edge, Safari, or Firefox)", "Reviewing US Letter pages side by side with zero spreadsheet software; picks and comments auto-save directly to review/ and can export .xlsx or stage Send Copies"],
    [".xlsx OK List workbook", "Run node qrg_kit/scripts/build_ok_list.js (or click Export .xlsx OK List in the Browser Review UI)", "Sharing review progress with external clients or managers who expect Excel or Google Sheets"],
  ], [2300, 3260, 3800]));
  b.push(para("Every row shows a lock status and accepts one reviewer call:", { keepNext: true }));
  b.push(refTable(["Your call", "What happens"], [
    ["OK to send", "Included when Send Copies are staged (only while the SHA-256 Review Lock matches)"],
    ["OK to send, note for later", "Included in Send Copies; the comment goes on the next round's work log"],
    ["Fix before sending", "Held back for a fix round; rebuilt guide returns blank with earlier comment displayed"],
  ], [3200, 6160]));
  b.push(para("**Carry-forward.** Unchanged locked guides keep their prior calls and comments across rounds. Any rebuilt "
    + "guide resets to blank, flags **Changed since last sheet**, and displays the earlier call verbatim so the reviewer "
    + "re-inspects what changed. Broken-lock and unlocked rows disable approval buttons."));
  b.push(callout("Working in .xlsx? Always edit the newest OK List sheet, save and close Excel before rebuilding a new "
    + "sheet, and comment in the OK List or Browser Review UI rather than inside the Word file.", "tip"));
  b.push(h3("Fix rounds"));
  b.push(num("Read the reviewer's comments verbatim from the Browser Review UI or OK List.", "steps2"));
  b.push(num("Handle every comment: complete it, or record a clear reason if deferred. None is dropped.", "steps2"));
  b.push(num("Apply the same fix to matching guides in sibling Sets unless frozen.", "steps2"));
  b.push(num("Rebuild, run QA and offline proofing, render, inspect every page PNG, relock with --how, and refresh.", "steps2"));
  b.push(h3("Send Copies (Word default, optional matching PDF)"));
  b.push(para("Send Copies are staged only for guides picked **OK to send** (or **OK to send, note for later**) whose "
    + "SHA-256 still matches its Review Lock and that are not on hold. Clean names drop the guide number, status, and "
    + "timestamp, landing locally in **_send/** with a manifest (prior Kit-made copies rotate safely into **_replaced/**). "
    + "**Word (.docx) is staged by default.** Always ask before staging whether matching PDF copies from the exact "
    + "locked Render are also needed; if yes, pass **--with-pdf** (or set **review.withPdf: true**, or check the PDF box "
    + "in the Browser Review UI release modal). Then a person delivers the files by hand."));

  // 10
  b.push(sec("Setting up for the first time"));
  b.push(refTable(["You need", "Why"], [
    ["Windows 10/11, macOS, or Linux", "Every Kit script, QA check, offline proofer, PNG rasterizer, and Browser Review UI runs cross-platform"],
    ["Node.js 22 or newer (LTS)", "Runs the Kit and its built-in test runner (verify with node --version)"],
    ["LibreOffice (free, no admin needed)", "Converts .docx builds to PDF for visual Renders and optional PDF Send Copies (see below); optional Windows Word fallback if absent"],
    ["AI coding tool (optional)", "Claude Code, Antigravity, Codex, or Cursor reads SKILL.md; standalone Node.js CLI works without any AI tool"],
  ], [3700, 5660]));
  b.push(h3("No-admin LibreOffice setup"));
  b.push(bullet("**Windows:** unpack LibreOffice Portable (PortableApps) into your user folder (for example %USERPROFILE%\\LibreOfficePortable); the Kit auto-detects App\\libreoffice\\program\\soffice.com (or C:\\Program Files\\LibreOffice if installed)."));
  b.push(bullet("**macOS:** drag LibreOffice.app from the .dmg into ~/Applications (no admin rights) or /Applications."));
  b.push(bullet("**Linux:** place the LibreOffice AppImage in ~/Applications or ~/.local/bin and run chmod +x (if FUSE is missing, the Kit retries with --appimage-extract-and-run), or install libreoffice via your package manager."));
  b.push(bullet("**Custom path:** set QRG_SOFFICE or render.soffice in qrg.config.json. Without LibreOffice, builds, QA, and proofing still succeed while Render prints a setup guide."));
  b.push(h3("Install the Skill (zip or Git)"));
  b.push(num("**Zip install:** get \"QRG Builder Skill - <stamp>.zip\" from a teammate and unzip the qrg-builder folder into your AI tool's skills folder (or any local folder for standalone CLI). **Git install:** clone the repository and point your AI tool at <repo>/qrg-builder.", "steps3"));
  b.push(num("In any terminal (PowerShell, Command Prompt, macOS Terminal, or Linux shell), install packages inside <skill>/kit and run the health check until it prints **RESULT: kit ready**:", "steps3", true));
  b.push(...code(["cd \"<skill>/kit\"", "npm install", "npm run check"]));
  b.push(callout("Never pass --omit=optional to npm install: it drops platform native binaries for sharp and @napi-rs/canvas. "
    + "Video frame tools are an optional add-on (about 400 MB): run npm run add-video inside the Kit folder only if needed.", "warn"));
  b.push(h3("Getting a newer Kit"));
  b.push(para("Pull the latest repository with **git pull** (Git install) or unpack a fresh Skill zip made with "
    + "**pack_skill.js** (which checks every text file for em/en dashes and client words before zipping), then rerun "
    + "**npm install** and **npm run check**. Each project stays on its own pinned **qrg_kit/** copy (with "
    + "**package-lock.json**) until you upgrade it with **--upgrade-kit**."));

  // 11
  b.push(sec("Starting a new project"));
  b.push(para("One cross-shell command creates the project folder, config file, pinned Kit copy, qa_names.txt, "
    + "qa_dictionary.txt, and state and work-log files without overwriting anything existing.", { keepNext: true }));
  b.push(...code([
    "node \"<skill>/kit/scripts/init_project.js\" --dir=\"<project folder>\" \\",
    "  --project=\"<Client>\" --set=UNIT1-INV --label=\"Unit 1 Investigator\" \\",
    "  --unit-line=\"Unit 1 | Investigator\" --install",
  ]));
  b.push(para("Build, check, proof, and render the worked example once to prove the whole pipeline end to end:", { keepNext: true }));
  b.push(...code([
    "cd \"<project folder>\"",
    "node qrg_kit/scripts/new_guide.js --set=UNIT1-INV --example",
    "node qrg_kit/build_qrgs.js --set=UNIT1-INV --scratch --only=\"Unit 1 Investigator 01 \"",
    "node qrg_kit/qa_qrgs.js --set=UNIT1-INV 01 --scratch",
    "node qrg_kit/scripts/proof_guides.js \"sets/UNIT1-INV/_work/scratch/<the new .docx>\"",
    "node qrg_kit/scripts/render_guides.js --file=\"sets/UNIT1-INV/_work/scratch/<the new .docx>\"",
  ]));
  b.push(para("Inspect the page PNGs in **_work/render_scratch/**, then delete the example guide before authoring guide 01."));
  b.push(h3("What you set per project"));
  b.push(refTable(["Setting", "Where", "Example"], [
    ["Project name, Sets, prefix, unit line, footer tag, brand palette.accent", "qrg.config.json", "Set UNIT1-INV, accent \"1F5C99\" for headings, badges, Browser UI"],
    ["People's names banned from QRGs", "qa_names.txt", "Every attendee, trainer, and staff name seen in sources"],
    ["Approved client terms for offline proofing", "qa_dictionary.txt", "Client app names, acronyms, and screen button labels"],
    ["Optional PDF default and custom LibreOffice path", "qrg.config.json", "review.withPdf (false default), render.soffice (null auto-detect)"],
    ["Task list, out of scope, privacy rule, who answers what", "Unit addendum per Set", "Copied from references/unit_addendum_template.md"],
  ], [3600, 2500, 3260]));

  // 12
  b.push(sec("Working with an AI coding tool (or standalone CLI)"));
  b.push(para("Open Claude Code, Antigravity, Codex, or Cursor in the project folder and ask in plain English, or run "
    + "the exact same Node commands directly from any terminal. If an AI tool does not load the Skill automatically, "
    + "say \"use the qrg-builder skill\".", { keepNext: true }));
  b.push(refTable(["You ask", "The AI tool does"], [
    ["\"Set up a QRG project for Unit 2 Supervisors\"", "Runs init_project.js, adds the Set, and verifies check_kit.js"],
    ["\"Write QRG 03 from the part 2 recording, 01:10 to 01:25\"", "Searches captions, pulls frames, annotates with brand accent, writes Guide Source, runs QA + offline proofing + clarity review, renders and inspects pages, logs gaps"],
    ["\"Lock Unit 1 guides and open the Browser Review UI\"", "Verifies renders and QA, applies SHA-256 Review Locks, and starts review_ui.js on 127.0.0.1"],
    ["\"Stage the Send Copies\"", "Asks whether matching PDF copies are also needed, runs make_send_copies.js --dry, stages into _send/, runs client_ready_scan.js, and stops for human delivery"],
  ], [3600, 5760]));
  b.push(h3("What the Skill tells every assistant not to do"));
  b.push(bullet("Publish anything, send email, or write to Google Drive or any shared folder. Every file stays local until a person delivers it."));
  b.push(bullet("Guess an unconfirmed step. Unconfirmed items stay out of QRGs and go into _QRG work log.md as questions."));
  b.push(bullet("Hand-edit a built .docx, or bypass the hand-edit guard without folding edits into the Guide Source first."));
  b.push(callout("Skill rules guide the AI assistant; they are not a system sandbox. If your AI tool has cloud drive or "
    + "email tools enabled, review proposed actions before approving them or disable those tools in your tool settings.", "note"));
  b.push(para("For large batches, a lead can dispatch parallel helper agents using references/agent_rules_template.md. "
    + "Each helper owns specific Guide Sources; only the lead applies Review Locks, builds OK Lists, or stages Send Copies."));

  // 13
  b.push(sec("Troubleshooting"));
  b.push(refTable(["Situation", "What to do"], [
    ["A script says packages are not installed, or sharp / canvas fails", "Run plain npm install (never --omit=optional) inside the Kit folder named in the error, then npm run check"],
    ["No DOCX-to-PDF renderer found", "Install no-admin LibreOffice (Windows PortableApps, macOS ~/Applications, or Linux AppImage) or set QRG_SOFFICE / render.soffice"],
    ["Offline proofing flags valid client product names or UI labels", "Add each approved term on its own line in qa_dictionary.txt and rerun proof_guides.js"],
    ["A render waits a long time", "Another Render holds the machine-wide render lock; it clears automatically when finished or after 10 minutes if stale"],
    ["A build stops because the Word file was edited outside the build", "Diff the edited .docx against the last build, fold every change into guides/NN.js, then rebuild with --allow-rebuild-over-edits"],
    ["The Browser Review UI or OK List shows Lock broken", "The live .docx changed after locking. Inspect the rendered pages and relock before approval"],
    ["build_ok_list.js stops because a sheet is open in Excel", "Save and close the .xlsx workbook, or review in the Browser Review UI (review_ui.js) with zero Excel needed"],
    ["Config validation rejects page \"a4\"", "Keep \"page\": \"letter\" in qrg.config.json; every QRG is Standard US Letter (8.5 x 11 in)"],
    ["No source recording shows a click", "Write the step without a figure, log it as a later improvement, and add it to the watch list for the next session"],
  ], [3600, 5760]));

  // 14
  b.push(sec("Where to find more"));
  b.push(refTable(["File (in the Skill folder)", "Read it for"], [
    ["kit/playbook/build_quickstart_qrg.js", "Builds the 2-page Quick-Start QRG (\"Make QRGs with the QRG Builder Skill\")"],
    ["SKILL.md", "The complete AI-tool-agnostic process and every Kit command"],
    ["references/setup_for_teammates.md", "Step-by-step setup for Windows, macOS, Linux, zip/Git, and all AI tools"],
    ["references/content_rules.md", "Every writing rule, including the evergreen zero-dates rule"],
    ["references/screenshot_rules.md", "Finding frames, cropping, brand-accent boxes and badges, privacy"],
    ["references/evidence_and_questions.md", "Shown vs. stated evidence, source order, left-out table, conflicts"],
    ["references/definition_of_done.md", "The complete checklist a QRG must pass before applying a Review Lock"],
    ["references/review_and_release.md", "Review Locks, Browser Review UI, .xlsx OK List, fix rounds, Word + optional PDF Send Copies"],
    ["references/lessons_learned.md", "Cross-platform rendering, proofing, Google Docs, and recording traps already solved"],
    ["kit/README.md and kit/tools/README.md", "Every qrg.config.json setting, Kit script option, and media/lint tool"],
  ], [3900, 5460]));
  return b;
}

(async () => {
  const doc = H.makeDocument({ docTitle: "QRG Playbook", footerLeft: "QRG Playbook  " + DOT + "  Kit " + KIT_VERSION, body });
  const buf = await H.pack(doc);
  let out;
  if (OUT_FILE) {
    out = path.resolve(OUT_FILE);
    fs.mkdirSync(path.dirname(out), { recursive: true });
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    out = path.join(OUT_DIR, "QRG Playbook - " + STATUS + " " + stamp() + ".docx");
    if (fs.existsSync(out)) { console.error("STOP: " + path.basename(out) + " already exists. Wait a minute or pass --out=<file.docx>."); process.exit(2); }
  }
  fs.writeFileSync(out, buf);
  console.log("wrote " + out + " (" + Math.round(buf.length / 1024) + " KB, kit " + KIT_VERSION + ")");
})();
