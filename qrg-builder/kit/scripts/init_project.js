// init_project.js: sets up a QRG project, or adds a set (one audience) to an existing one. Never overwrites a file:
// anything that already exists is left as is and reported as SKIPPED.
//
// New project (from any terminal; <skill> is wherever you unpacked or cloned qrg-builder):
//   node "<skill>/kit/scripts/init_project.js" --dir="<project folder>" --project="<Client or project>" \
//     --set=UNIT1-INV --label="Unit 1 Investigator" --unit-line="Unit 1 | Investigator"
// Add a set to that project later (same command, new --set; the config gets one more set):
//   node qrg_kit/scripts/init_project.js --set=UNIT1-SUP --label="Unit 1 Supervisor"
// Options:
//   --dir=<folder>          project root (default: the current folder)
//   --project="<name>"      shown on the OK List (default: the folder name)
//   --set=<id>              letters, digits, hyphens (required)
//   --label="<text>"        the set's human name, also its output and send folder name (default: the id)
//   --prefix="<text>"       starts every guide file name (default: the label)
//   --unit-line="<text>"    the line under each guide title (default: the label)
//   --footer-tag="<text>"   after the title in the footer (default: the label)
//   --asset-key=<text>      asset folder name before NN (default: the id without hyphens)
//   --out=<folder>          where the Word files go, relative to the project (default: QRGs/<label>)
//   --kit=copy|skill        copy (default): copy the kit into <project>/qrg_kit, so the project keeps the kit version it
//                           was built with and a teammate needs only the project folder. skill: run from the skill folder.
//   --upgrade-kit           replace <project>/qrg_kit with the skill's current kit; the old copy goes to
//                           _archive_backups/ and its node_modules are moved across
//   --install               run npm install in the kit folder afterward. The video tools (frames, captions,
//                           and contact sheets from recordings) also need  npm run add-video  in the kit folder (about 400 MB).
//                           Do not use npm's --omit=optional: it also drops sharp's platform image library.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { arg, flag, stamp, UNSAFE } = require("../lib/config");

const SKILL_KIT = path.resolve(__dirname, "..");
const DIR = path.resolve(arg("dir") || process.cwd());
const setId = arg("set");
if (!setId) { console.error("usage: init_project.js --set=<id> [--dir=<project>] [--project=..] [--label=..] [--prefix=..] [--unit-line=..] [--footer-tag=..] [--kit=copy|skill] [--install]"); process.exit(2); }
const label = arg("label") || setId;
const set = {
  id: setId, label, prefix: arg("prefix") || label, unitLine: arg("unit-line") || label, footerTag: arg("footer-tag") || label,
  dir: "sets/" + setId, out: arg("out") || "QRGs/" + label, assetKey: arg("asset-key") || setId.replace(/[^A-Za-z0-9]/g, ""), sendFolder: label,
};
const problems = [];
if (!/^[A-Za-z0-9-]+$/.test(set.id)) problems.push("--set may use letters, digits, and hyphens only");
for (const k of ["label", "prefix"]) if (UNSAFE.test(set[k])) problems.push("--" + k + " has a file-name-unsafe character (\\ / : * ? \" < > | # % &): " + set[k]);
if (set.out.split("/").some((p) => UNSAFE.test(p))) problems.push("--out has a file-name-unsafe character: " + set.out);
const pageArg = arg("page");
if (pageArg !== null && pageArg !== "letter") {
  problems.push('--page "' + pageArg + '" is not supported; QRGs must use Standard US Letter ("letter", 8.5 x 11 in)');
}
if (problems.length) { console.error("STOP:\n  " + problems.join("\n  ")); process.exit(2); }
const KITMODE = arg("kit") || "copy";
if (!["copy", "skill"].includes(KITMODE)) { console.error("STOP: --kit must be copy or skill"); process.exit(2); }

const said = [];
const write = (rel, text) => {
  const p = path.join(DIR, rel);
  if (fs.existsSync(p)) { said.push("SKIPPED (exists) " + rel); return false; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  said.push("WROTE " + rel);
  return true;
};
const mkdir = (rel) => { const p = path.join(DIR, rel); if (!fs.existsSync(p)) { fs.mkdirSync(p, { recursive: true }); said.push("MADE " + rel + "/"); } };

// ---- the kit ----
const KITDIR = KITMODE === "copy" ? path.join(DIR, "qrg_kit") : SKILL_KIT;
const SKIP = new Set(["node_modules", "playbook", "_work"]);
function copyKit(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name) && src === SKILL_KIT) continue;
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyKit(a, b); else fs.copyFileSync(a, b);
  }
}
const kitVersion = JSON.parse(fs.readFileSync(path.join(SKILL_KIT, "package.json"), "utf8")).version;
if (KITMODE === "copy") {
  if (path.resolve(KITDIR) === SKILL_KIT) { console.error("STOP: the project folder is the skill folder"); process.exit(2); }
  if (fs.existsSync(KITDIR) && flag("upgrade-kit")) {
    const bak = path.join(DIR, "_archive_backups", "qrg_kit.pre_upgrade_" + stamp());
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.renameSync(KITDIR, bak);
    copyKit(SKILL_KIT, KITDIR);
    if (fs.existsSync(path.join(bak, "node_modules"))) fs.renameSync(path.join(bak, "node_modules"), path.join(KITDIR, "node_modules"));
    said.push("UPGRADED qrg_kit to kit " + kitVersion + " (old copy: " + path.relative(DIR, bak) + ")");
  } else if (fs.existsSync(KITDIR)) {
    const have = (() => { try { return JSON.parse(fs.readFileSync(path.join(KITDIR, "package.json"), "utf8")).version; } catch (e) { return "?"; } })();
    said.push("SKIPPED (exists) qrg_kit/ (kit " + have + "; the skill has " + kitVersion + (have !== kitVersion ? ". To move up: --upgrade-kit" : "") + ")");
  } else { copyKit(SKILL_KIT, KITDIR); said.push("COPIED kit " + kitVersion + " to qrg_kit/"); }
}

// ---- the config: new, or one more set ----
const cfgPath = path.join(DIR, "qrg.config.json");
if (fs.existsSync(cfgPath)) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (cfg.page != null && cfg.page !== "letter") {
    console.error('STOP: qrg.config.json page "' + cfg.page + '" is not supported; QRGs must use Standard US Letter ("letter", 8.5 x 11 in).');
    process.exit(2);
  }
  cfg.sets = cfg.sets || [];
  const have = cfg.sets.find((s) => s.id === set.id);
  if (have) { said.push("SKIPPED (exists) set " + set.id + " in qrg.config.json (its settings are kept; edit the config to change them)"); Object.assign(set, have); }
  else if (cfg.sets.some((s) => s.prefix === set.prefix)) { console.error("STOP: another set already uses the prefix " + set.prefix + ". Pass --prefix."); process.exit(2); }
  else {
    const bak = path.join(DIR, "_archive_backups", "qrg.config.json.pre_add_" + set.id + "_" + stamp());
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(cfgPath, bak);
    cfg.sets.push(set);
    const tmp = cfgPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n");
    JSON.parse(fs.readFileSync(tmp, "utf8"));
    fs.renameSync(tmp, cfgPath);
    said.push("ADDED set " + set.id + " to qrg.config.json (backup in _archive_backups/)");
  }
} else {
  const t = JSON.parse(fs.readFileSync(path.join(SKILL_KIT, "templates", "qrg.config.example.json"), "utf8"));
  t.project = arg("project") || path.basename(DIR);
  t.sets = [set];
  write("qrg.config.json", JSON.stringify(t, null, 2) + "\n");
}

// ---- folders and working files ----
mkdir(set.dir + "/guides");
mkdir(set.dir + "/assets");
mkdir(set.out);
mkdir("review");
write("qa_names.txt", [
  "# People's names the QA and the clean scan look for (one per line). A guide must never name a person.",
  "# Add every name you see in sources: trainers, testers, process owners, client staff, your own team.",
  "# Lines starting with # are ignored.",
  "",
].join("\n"));
write("qa_dictionary.txt", [
  "# Approved words for offline proofing (one word or UI label per line).",
  "# Add product names, acronyms, and screen labels so proof_guides.js does not flag them.",
  "# Lines starting with # are ignored.",
  "",
].join("\n"));
const today = new Date(), mdY = String(today.getMonth() + 1).padStart(2, "0") + "/" + String(today.getDate()).padStart(2, "0") + "/" + today.getFullYear();
const K = KITMODE === "copy" ? "qrg_kit" : SKILL_KIT.replace(/\\/g, "/");
write("_QRG - state.md", [
  "# QRG project: state",
  "",
  "Last updated: " + mdY + " (set up with qrg-builder kit " + kitVersion + ", kit mode: " + KITMODE + ")",
  "",
  "## Goal",
  "Quick Reference Guides (one Word file per task) for: " + set.label + ". TODO: who reads them, and by when.",
  "",
  "## Status: Done",
  "- Project set up (" + mdY + ").",
  "",
  "## Status: In progress",
  "- None yet.",
  "",
  "## Blocked / waiting on",
  "- None yet.",
  "",
  "## Next step",
  "- List the tasks (one guide each) and the sources for each. Then: node " + K + "/scripts/new_guide.js --set=" + set.id + " 01 \"<Title>\"",
  "",
  "## Key files",
  "- qrg.config.json: sets, names, house style. Guides: sets/<set>/guides/NN.js. Screenshots: sets/<set>/assets/<key>NN/.",
  "- Word files: " + set.out + "/ (one live build per guide; older builds in _archive/).",
  "- Review: review/ (renders, locks.json, saved review state, OK List sheets). Send copies: _send/ (local; moved to the shared place by hand).",
  "- Work log (left out until answered, open questions, conflicts): _QRG work log.md",
  "",
  "## Open questions / decisions",
  "- Who gives the OK to send? Who answers process questions for each set?",
  "",
].join("\n"));
write("_QRG work log.md", fs.readFileSync(path.join(SKILL_KIT, "templates", "work_log_template.md"), "utf8"));

// ---- install ----
if (flag("install")) {
  console.log("npm install in " + KITDIR + " ...");
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: KITDIR, stdio: "inherit", shell: true });
  said.push(r.status === 0 ? "INSTALLED packages in " + path.relative(DIR, KITDIR || ".") : "npm install FAILED (status " + r.status + "). Rerun it in " + KITDIR);
}
console.log(said.join("\n"));
const needInstall = !fs.existsSync(path.join(KITDIR, "node_modules", "docx"));
console.log("\nNext (from " + DIR + "):" + (needInstall ? "\n  (cd \"" + (KITMODE === "copy" ? "qrg_kit" : KITDIR) + "\" && npm install)" : "")
  + "\n  node " + K + "/scripts/new_guide.js --set=" + set.id + " --example        a worked example guide to build and check first"
  + "\n  node " + K + "/scripts/new_guide.js --set=" + set.id + " 01 \"<Title>\" \"<Subtitle>\""
  + "\n  Fill in qa_names.txt and qa_dictionary.txt, and if this project has a _PROJECT_STATE.md hub, add a row for _QRG - state.md.");
