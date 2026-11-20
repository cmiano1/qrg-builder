// client_ready_scan.js: read-only "is this file clean enough to hand to the client" scan (lib/clean_scan.js).
// Read every hit in context: some are fine (a "Pending" status that is really on the screen). Blockers are file
// artifacts a generator never writes, so they mean a hand edit (lock_guides.js refuses those files).
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/client_ready_scan.js                     every live build in every set
//   node qrg_kit/scripts/client_ready_scan.js --set=<id>          one set
//   node qrg_kit/scripts/client_ready_scan.js "<file.docx>" ...   any files (send copies, a Google round-trip copy)
//   --out=<file.json>   full results (default <review dir>/_work/clean_scan_<stamp>.json)
const fs = require("fs");
const path = require("path");
const { loadConfig, arg, stamp } = require("../lib/config");
const { liveInventory, writeJsonSafe } = require("../lib/inventory");
const { scanDocx } = require("../lib/clean_scan");

const P = loadConfig();
const files = process.argv.slice(2).filter((a) => !a.startsWith("--") && /\.docx$/i.test(a)).map((f) => path.resolve(f));
const list = files.length ? files : Object.values(liveInventory(P, { set: arg("set") || undefined }).guides).map((g) => g.path);
const OUT = arg("out") || path.join(P.reviewDir, "_work", "clean_scan_" + stamp() + ".json");
(async () => {
  const out = [];
  for (const f of list) {
    try { out.push({ file: path.basename(f), path: f, ...(await scanDocx(fs.readFileSync(f), P)) }); }
    catch (e) { out.push({ file: path.basename(f), path: f, error: String(e) }); }
  }
  writeJsonSafe(OUT, out);
  const tally = {};
  for (const r of out) {
    for (const h of r.hits || []) tally[h.kind] = (tally[h.kind] || 0) + 1;
    const flags = [...(r.blockers || []).map((b) => "BLOCKER " + b), ...(r.hits || []).map((h) => h.kind + ": " + h.text)];
    console.log((r.error ? "ERROR " : flags.length ? "LOOK  " : "clean ") + r.file + (r.error ? ": " + r.error : ""));
    for (const x of flags.slice(0, 12)) console.log("        " + x);
    if (flags.length > 12) console.log("        ... " + (flags.length - 12) + " more in " + OUT);
  }
  console.log("files " + out.length + "; errors " + out.filter((r) => r.error).length + "; with blockers " + out.filter((r) => (r.blockers || []).length).length
    + "; hits by kind " + JSON.stringify(tally) + "\nfull results: " + OUT);
})();
