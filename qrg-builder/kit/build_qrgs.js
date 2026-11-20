/* =====================================================================
 * build_qrgs.js: builds Quick Reference Guides (one Word file per task) for one set in qrg.config.json.
 *
 * A "set" is one unit + role group, for example "Unit 1 Investigator". Its guide bodies live one file per guide in
 *   <set dir>/guides/NN.js        (NN = 01, 02, ...; 00 is reserved for an overview guide)
 * and its screenshots in
 *   <set dir>/assets/<assetKey>NN/out/*.png   (made by tools/annotate_screenshot.js from annotate.json)
 * Each build writes
 *   <set out>/<prefix> NN - <Title> - <STATUS> YYYYMMDD-HHMM.docx
 * and moves the prior build of the same guide to <set out>/_archive/.
 *
 * SOURCE OF TRUTH: GENERATOR IS MASTER (this file, lib/docx_helpers.js, and the guide files). A guard stops the run if a
 * built guide in the output folder was edited after it was built, or if another file with the same name prefix appeared
 * there. Fold the edits into the guide file first (diff the XML, render both), then rerun with ALLOW_REBUILD_OVER_EDITS=1.
 * A build also stops if the guide's prior build is open in Word (it cannot be moved to _archive/ while open).
 *
 * Run (Git Bash, from the kit folder or anywhere under the project):
 *   node build_qrgs.js --set=<id>                                   every guide in the set
 *   QRG_ONLY="<prefix> 03 " node build_qrgs.js --set=<id>           one guide (a regex on the file name)
 *   QRG_SCRATCH=1 QRG_ONLY="<prefix> 03 " node build_qrgs.js --set=<id>
 *       a test build to <set dir>/_work/scratch/; leaves the live folder, the guard, and the build log alone
 *   QRG_INCLUDE_HOLD=1     also build guides marked hold: true
 *   ALLOW_REBUILD_OVER_EDITS=1   only after the hand edits are folded in
 * QA: node qa_qrgs.js --set=<id> [NN] [--scratch]
 * Render: node scripts/render_guides.js --set=<id> [NN]   (a scratch build: --file="<docx>")
 * A live build takes the project build lock (lib/lock.js), so two agents never write the build log at once.
 *
 * Syntax check this file with  node --check build_qrgs.js  (never require() it: requiring it runs a build).
 *
 * Guide file contract (see templates/guide_template.js):
 *   module.exports = (H) => {
 *     const { h2, h3, para, num, bullet, callout, refTable, titleBlock, afig, spacer } = H;
 *     const K = H.key("NN");               // the asset folder for this guide
 *     return { title: "Do the Task", subtitle: "One line on what this covers", build() { const b = []; ...; return b; } };
 *   };
 *   Optional: file (defaults to "<prefix> NN - <title>"), hold: true, figMaxH: <inches>, keepRun: <N> (QA only).
 *   Keep title: "..." as a plain string on one line (the QA reads it to check that no guide names another).
 * =================================================================== */
const fs = require("fs");
const path = require("path");
const { loadConfig, stamp, arg, UNSAFE } = require("./lib/config");
const { makeHelpers } = require("./lib/docx_helpers");
const { acquire } = require("./lib/lock");

const P = loadConfig();
const setId = arg("set") || process.env.QRG_SET;
if (!setId) { console.error("usage: node build_qrgs.js --set=<id>   (sets: " + P.sets.map((s) => s.id).join(", ") + ")"); process.exit(2); }
const SET = P.getSet(setId);
const STATUS = P.cfg.status;
const SCRATCH = process.env.QRG_SCRATCH === "1";
const KEY = SET.assetKey || SET.id.replace(/[^A-Za-z0-9]/g, "");

const base = makeHelpers(P.cfg, { assetsDir: SET.assetsDir, unitLine: SET.unitLine });
// Titles come from the guide files. No cross-references to other guides by title or number: a title can change after
// delivery and the old name would stay in every other guide. R() stays only so an old habit fails loudly.
const TITLES = {};
const R = (n) => { throw new Error("R(" + n + "): cross-references to other guides are off. Write the step, or name the task in plain words."); };
const H = { ...base, TITLES, R, UNIT_LINE: SET.unitLine, FOOTER_TAG: SET.footerTag, key: (nn) => KEY + nn,
  titleBlock: (title, subtitle) => base.titleBlock(title, subtitle, SET.unitLine) };

// Prior builds of a guide: "<file> - <ANY STATUS> YYYYMMDD-HHMM.docx", so a status change (DRAFT to FINAL) still archives.
const priorRe = (file) => new RegExp("^" + file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " - [A-Z]+ [0-9]{8}-[0-9]{4}[.]docx$");

const QRGS = [];
const LOAD_ERRORS = {};
for (const f of (fs.existsSync(SET.guidesDir) ? fs.readdirSync(SET.guidesDir) : []).filter((x) => /^\d\d\.js$/.test(x)).sort()) {
  const nn = f.slice(0, 2);
  try {
    const g = require(path.join(SET.guidesDir, f))(H);
    if (!g || !g.title || typeof g.build !== "function") throw new Error("needs title and build()");
    if (UNSAFE.test(g.title)) throw new Error("title has a file-name-unsafe character (\\ / : * ? \" < > | # % &)");
    g.file = g.file || SET.prefix + " " + nn + " - " + g.title;
    if (!g.file.startsWith(SET.prefix + " " + nn + " - ")) throw new Error('file must start with "' + SET.prefix + " " + nn + ' - "');
    g.nn = nn;
    TITLES[nn] = g.title;
    QRGS.push(g);
  } catch (e) { LOAD_ERRORS[nn] = e; }
}

function makeDoc(q) {
  return base.makeDocument({
    docTitle: q.title + " (" + SET.footerTag + " QRG)",
    footerLeft: q.title + "  ·  " + SET.footerTag,
    figMaxH: q.figMaxH,
    body: () => q.build(),
  });
}

function readLog() { return fs.existsSync(SET.logFile) ? JSON.parse(fs.readFileSync(SET.logFile, "utf8")) : { files: {} }; }
// Every prior build of a guide in the output folder must be the build this script last wrote, unchanged.
function guard(guides, log) {
  if (process.env.ALLOW_REBUILD_OVER_EDITS === "1") { console.log("GUARD OFF (ALLOW_REBUILD_OVER_EDITS=1)"); return; }
  for (const q of guides) {
    const known = (log.files || {})[q.file];
    for (const f of fs.readdirSync(SET.outDir).filter((x) => priorRe(q.file).test(x))) {
      const mt = fs.statSync(path.join(SET.outDir, f)).mtimeMs;
      if (!known || known.file !== f || mt > known.mtimeMs + 2000) {
        console.error("STOP: " + f + " was edited or added after the last build. Diff it, fold the edits into guides/"
          + q.nn + ".js, then rerun with ALLOW_REBUILD_OVER_EDITS=1.");
        process.exit(2);
      }
    }
  }
}
// Opening read-write (and closing at once, with no write) is refused while Word holds the file.
function stopIfOpen(guides, dir) {
  for (const q of guides) for (const f of fs.readdirSync(dir).filter((x) => priorRe(q.file).test(x))) {
    try { fs.closeSync(fs.openSync(path.join(dir, f), "r+")); } catch (e) {
      console.error("STOP: " + f + " is open (" + e.code + "), probably in Word. Close it, then rerun. For a test build while it is open: QRG_SCRATCH=1.");
      process.exit(3);
    }
  }
}

(async () => {
  const s = stamp();
  const ONLY = process.env.QRG_ONLY ? new RegExp(process.env.QRG_ONLY) : null;
  for (const [nn, e] of Object.entries(LOAD_ERRORS)) {
    if (!ONLY || ONLY.test(SET.prefix + " " + nn + " ")) { console.error("ERROR: guides/" + nn + ".js does not load: " + (e.stack || e)); process.exit(1); }
    console.log("SKIPPED (does not load) guides/" + nn + ".js: " + e.message);
  }
  if (!QRGS.length) { console.error("No guide files in " + SET.guidesDir); process.exit(1); }
  const toBuild = QRGS.filter((q) => (!ONLY || ONLY.test(q.file + " ")) && (!q.hold || process.env.QRG_INCLUDE_HOLD === "1"));
  for (const q of QRGS) if (q.hold && !toBuild.includes(q) && (!ONLY || ONLY.test(q.file + " "))) console.log("SKIPPED (on hold) " + q.file);
  if (!toBuild.length) { console.error("Nothing to build (check QRG_ONLY)."); process.exit(1); }

  if (SCRATCH) {
    fs.mkdirSync(SET.scratchDir, { recursive: true });
    for (const q of toBuild) {
      const out = path.join(SET.scratchDir, q.file + " - " + STATUS + " " + s + ".docx");
      const buf = await base.pack(makeDoc(q));
      const prior = fs.readdirSync(SET.scratchDir).filter((f) => priorRe(q.file).test(f) && path.resolve(SET.scratchDir, f) !== path.resolve(out));
      if (prior.length) fs.mkdirSync(path.join(SET.scratchDir, "_archive"), { recursive: true });
      for (const f of prior) {
        try { fs.renameSync(path.join(SET.scratchDir, f), path.join(SET.scratchDir, "_archive", f)); console.log("ARCHIVED (scratch) " + f); }
        catch (e) { console.log("LEFT (scratch, " + e.code + ") " + f + ": close it in Word, then move it to _work/scratch/_archive/."); }
      }
      fs.writeFileSync(out, buf);
      console.log("WROTE (scratch) " + out + " (" + buf.length + " bytes)");
    }
    console.log("DONE (scratch). " + toBuild.length + " guide(s). Live folder, guard, and build log untouched.");
    return;
  }
  fs.mkdirSync(SET.outDir, { recursive: true });
  // One live build at a time in this project (the build log and _archive moves are read-modify-write).
  const release = acquire("build", P);
  const log = readLog();
  guard(toBuild, log);
  stopIfOpen(toBuild, SET.outDir);
  for (const q of toBuild) {
    const out = path.join(SET.outDir, q.file + " - " + STATUS + " " + s + ".docx");
    const buf = await base.pack(makeDoc(q));
    const prior = fs.readdirSync(SET.outDir).filter((f) => priorRe(q.file).test(f) && path.resolve(SET.outDir, f) !== path.resolve(out));
    if (prior.length) fs.mkdirSync(SET.archiveDir, { recursive: true });
    for (const f of prior) { fs.renameSync(path.join(SET.outDir, f), path.join(SET.archiveDir, f)); console.log("ARCHIVED " + f); }
    fs.writeFileSync(out, buf);
    log.files = log.files || {};
    log.files[q.file] = { file: path.basename(out), mtimeMs: fs.statSync(out).mtimeMs, built: new Date().toISOString() };
    console.log("WROTE " + out + " (" + buf.length + " bytes)");
  }
  // Re-read the log just before writing and merge in only this run's guides, so two builds of different guides in this
  // set, run at about the same time, do not drop each other's entries.
  fs.mkdirSync(path.dirname(SET.logFile), { recursive: true });
  const fresh = readLog();
  fresh.files = fresh.files || {};
  for (const q of toBuild) fresh.files[q.file] = log.files[q.file];
  const tmp = SET.logFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
  fs.renameSync(tmp, SET.logFile);
  release();
  console.log("DONE. " + toBuild.length + " guide(s). Next: node " + path.relative(process.cwd(), path.join(P.KIT, "qa_qrgs.js")) + " --set=" + SET.id);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
