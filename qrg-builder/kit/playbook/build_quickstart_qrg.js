// build_quickstart_qrg.js: builds the 2-page Quick-Start QRG ("Make QRGs with the QRG Builder Skill"), a desk guide
// that teaches consultants and change managers how to create, check, review, and stage QRGs while obeying the Skill's
// own QRG rules: Standard US Letter (8.5 x 11 in, 1 in margins), Calibri only, the six standard sections in order,
// one continuous numbered step list, zero dates in prose, zero people's names, zero session words, and zero em/en dashes.
// The generator is the master. Do not hand-edit the built file; change this script and rebuild.
// Usage (from anywhere):
//   node build_quickstart_qrg.js ["<out folder>"] [--out="<file.docx>"] [--status=DRAFT]
// Output: "<out folder>/QRG Skill 01 - Make QRGs with the QRG Builder Skill - <STATUS> <YYYYMMDD-HHMM>.docx"
// Check after a build:  node tools/gdocs_lint.js --page=letter --full-width --fonts="Calibri" "<file>"
"use strict";

const fs = require("fs");
const path = require("path");
const { stamp, arg } = require("../lib/config");
const { makeHelpers } = require("../lib/docx_helpers");

const KIT = path.resolve(__dirname, "..");
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8")).version;
const TITLE = "Make QRGs with the QRG Builder Skill";
const SUBTITLE = "Set Up a Project, Draft Guides, Run Offline Checks, Collect Approvals, and Stage Send Copies";
const UNIT_LINE = "Change Management | Quick-Start Guide";
const FOOTER_TAG = "Quick-Start Guide";
const DOT = String.fromCharCode(0xB7);

const QUICKSTART_DICTIONARY = [
  "QRG",
  "QRGs",
  "qrg-builder",
  "qrg",
  "qrgs",
  "qa",
  "js",
  "md",
  "txt",
  "json",
  "docx",
  "xlsx",
  "pdf",
  "OK",
  "Okay",
  "NN",
  "UI",
  "CLI",
  "LTS",
  "PNG",
  "PNGs",
  "PDF",
  "PDFs",
  "SHA",
  "SHA-256",
  "DOCX",
  "Antigravity",
  "Codex",
  "LibreOffice",
  "PortableApps",
  "AppImage",
  "Calibri",
  "Carlito",
  "soffice",
  "QRG_SOFFICE",
  "withPdf",
  "macOS",
  "npm",
];

const cfg = {
  author: "Change Management",
  page: "letter",
  font: "Calibri",
  figureMaxHeightIn: 5.25,
  palette: { accent: "C00000", heading: "8B0000", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
};
const H = makeHelpers(cfg, { unitLine: UNIT_LINE });
const { h2, h3, para, num, bullet, callout, refTable, titleBlock } = H;

function body() {
  const b = [];
  b.push(...titleBlock(TITLE, SUBTITLE, UNIT_LINE));

  b.push(h2("Purpose"));
  b.push(para("Use these steps to set up a Quick Reference Guide (QRG) project and write Standard US Letter Word guides. "
    + "You can then collect approvals in the Local Browser Review UI or an Excel sign-off sheet and stage clean Send "
    + "Copies on Windows, macOS, or Linux without needing desktop Microsoft Office."));

  b.push(h2("Who does this"));
  b.push(bullet("**Who:** Consultants, change managers, and project leads who build or release QRGs."));
  b.push(bullet("**When:** Starting a new client Set, writing a task guide from verified screens, or preparing a review and release round."));

  b.push(h2("Before you start"));
  b.push(bullet("Install **Node 22** or newer (LTS) and **LibreOffice** (standard install, Windows LibreOffice Portable, macOS **~/Applications**, or Linux **AppImage**)."));
  b.push(bullet("Unpack the **qrg-builder** Skill zip or clone the repository, then run **npm install** (keeping optional dependencies enabled) and **npm run check** inside **qrg-builder/kit** until it prints **RESULT: kit ready**."));
  b.push(bullet("Confirm the Set's approved task list, brand accent hex color (**palette** **accent**), and screenshot privacy rule with the process owner."));

  b.push(h2("Steps"));

  b.push(h3("Set up the project and verify the pipeline"));
  b.push(num("Open your AI coding tool (**Claude Code**, **Antigravity**, **Codex**, or **Cursor**) in the project folder and ask it to initialize the project. You can also run the **init_project** script from **qrg-builder/kit/scripts** with your project name, Set ID, Set label, and the **install** flag."));
  b.push(num("In the project configuration file, keep **page** set to **letter** and set the **palette** **accent** to the client's brand hex color. Add banned people's names to the **names** file and add approved client product names or acronyms to the custom **dictionary** file."));
  b.push(num("Test the pipeline once with the built-in example by running **new_guide** with the **example** flag, followed by a scratch build, QA, proof, and render. Inspect the two rendered US Letter page PNGs, then delete the example files before starting real guides."));

  b.push(h3("Gather evidence, write the guide, and run checks"));
  b.push(num("Verify every action from real screens or written process owner answers and crop out browser and OS bars. Run **annotate_screenshot** on the guide's **annotate** manifest so every click has a brand-accent box and numbered badge matching its step number."));
  b.push(num("Create the Guide Source with **new_guide** for your Set and two-digit number **NN**, and write the six standard sections using one action per step, bold on-screen labels, zero dates, and zero people's names. Log any unconfirmed step as an open question in the project work log."));
  b.push(num("Run a scratch build and automated check with **build_qrgs** and the **QA** checker (passing the **scratch** and **only** flags for guide **NN**) until QA prints **RESULT: clean**."));
  b.push(num("Run the live build and automated check, run **proof_guides** for your Set and guide **NN**, and read the extracted **text** file in the work folder end to end to check clarity and meaning."));
  b.push(num("Render the guide with **render_guides** for your Set and guide **NN**, and visually inspect every US Letter page PNG in the **render** output folder to confirm clean page breaks and readable figures."));
  b.push(callout("Keep the Guide Source in **guides/NN** as the single master. Never edit a built Word file directly; if someone edits a Word file outside the build, fold the changes into the Guide Source before rebuilding.", "tip"));

  b.push(h3("Lock, review, and stage Send Copies"));
  b.push(num("Record the SHA-256 Review Lock on the inspected build by running **lock_guides** for your Set and guide **NN** with a short summary note explaining how this version was reached."));
  b.push(num("Start the Local Browser Review UI with the **review** **UI** script (or build an Excel sign-off workbook with the **sign-off** **list** builder). Record each reviewer decision and comment so they save directly against the locked SHA-256 fingerprint."));
  b.push(num("Ask whether matching PDF copies from the verified Render are needed alongside the default Word (**docx**) files. Preview the release with **make_send_copies** in **dry** mode, then stage clean-named Send Copies into the **_send** folder (enable **with-pdf** when PDFs are requested)."));

  b.push(h2("What happens next"));
  b.push(para("Clean-named Word (**docx**) Send Copies (and matching PDFs when **with-pdf** was selected) sit locally in "
    + "the **_send** folder with a verification manifest while prior Kit-made copies rotate into **_replaced**. A person on "
    + "the team delivers the staged files from **_send** to the shared or client folder by hand."));

  b.push(h2("Troubleshooting"));
  b.push(refTable(
    ["Situation", "What to do"],
    [
      ["The **render_guides** script reports no DOCX-to-PDF renderer found", "Install no-admin LibreOffice (Windows PortableApps, macOS **~/Applications**, or Linux **AppImage**) or set **QRG_SOFFICE** or the **soffice** renderer path in the project configuration file."],
      ["The **proof_guides** script flags a valid client app name or acronym", "Add the approved term on its own line in the custom **dictionary** file and rerun **proof_guides**."],
      ["The Browser Review UI or sign-off sheet shows **Lock broken**", "The live Word file changed after locking. Inspect the rendered page PNGs again and rerun **lock_guides** with a summary note before saving an approval."],
      ["The **build_qrgs** script stops because a Word file was edited outside the build", "Compare the edited Word file against the prior build, copy every text change into the Guide Source, and rebuild with the **allow-rebuild-over-edits** flag."],
      ["A step cannot be verified from screens or process owner notes", "Leave the unconfirmed step out of the guide and record a specific question for the process owner in the project work log."],
    ],
    [3400, 5800]
  ));
  return b;
}

async function buildQuickstartBuffer() {
  const doc = H.makeDocument({
    docTitle: TITLE,
    footerLeft: TITLE + "  " + DOT + "  " + FOOTER_TAG,
    body,
  });
  return H.pack(doc);
}

if (require.main === module) {
  const STATUS = arg("status") || "DRAFT";
  if (!/^[A-Z]+$/.test(STATUS)) {
    console.error("STOP: --status must be capital letters");
    process.exit(2);
  }
  const OUT_FILE = arg("out");
  const OUT_DIR = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) || ".");
  (async () => {
    const buf = await buildQuickstartBuffer();
    let out;
    if (OUT_FILE) {
      out = path.resolve(OUT_FILE);
      fs.mkdirSync(path.dirname(out), { recursive: true });
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      out = path.join(OUT_DIR, "QRG Skill 01 - " + TITLE + " - " + STATUS + " " + stamp() + ".docx");
      if (fs.existsSync(out)) {
        console.error("STOP: " + path.basename(out) + " already exists. Wait a minute or pass --out=<file.docx>.");
        process.exit(2);
      }
    }
    fs.writeFileSync(out, buf);
    console.log("wrote " + out + " (" + Math.round(buf.length / 1024) + " KB, kit " + KIT_VERSION + ")");
  })();
}

module.exports = {
  TITLE,
  SUBTITLE,
  UNIT_LINE,
  FOOTER_TAG,
  QUICKSTART_DICTIONARY,
  body,
  buildQuickstartBuffer,
};
