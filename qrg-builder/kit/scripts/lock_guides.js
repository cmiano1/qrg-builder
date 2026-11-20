// lock_guides.js: records the "Done, waiting for OK" lock for live QRGs, after checking each one. Writes only
// <review dir>/locks.json (and its history). Never edits a guide.
// A lock = guide code, exact file name, SHA-256, the render made from that exact file and its page count, the time,
// and a short note on how this version was reached. make_send_copies.js only copies a file whose SHA-256 still
// matches its lock, so a rebuilt or hand-edited guide can never be sent on an old OK.
// A guide is refused (not locked) when:
//   - it has no render from this exact file (run render_guides.js, then LOOK at the pages first)
//   - qa_qrgs.js finds anything (it includes the Google lint)
//   - it was edited after it was built (build log time), or it is not in the build log at all
//   - the clean scan finds a blocker (tracked changes, comments, hidden text, highlight, yellow shading)
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/lock_guides.js --check --set=<id>                  report only, lock nothing
//   node qrg_kit/scripts/lock_guides.js --how="<note>" --set=<id> [NN ...]  lock the set (or the numbers given)
//   node qrg_kit/scripts/lock_guides.js --how="<note>" "<code>" ...         for example "UNIT1-INV 05"
//   --how examples: "first build, QA clean, pages read", "fix round 1: reviewer comments on steps 4 and 7"
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, arg, flag, stamp } = require("../lib/config");
const { liveInventory, findRender, readJson, writeJsonSafe } = require("../lib/inventory");
const { scanDocx } = require("../lib/clean_scan");

const P = loadConfig();
const CHECK = flag("check"), HOW = arg("how"), SET = arg("set");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!CHECK && !HOW) { console.error('usage: lock_guides.js --how="<note>" (--set=<id> [NN ...] | "<code>" ...)   or   --check --set=<id>'); process.exit(2); }
const { guides, dup } = liveInventory(P, { set: SET || undefined });
let codes = SET ? Object.keys(guides).filter((c) => !pos.length || pos.includes(c.slice(-2))) : pos;
if (!codes.length) { console.error("No guides chosen (give --set=<id> or guide codes)."); process.exit(2); }
const LOCKS = path.join(P.reviewDir, "locks.json");

(async () => {
  const locks = readJson(LOCKS, {});
  const s = stamp(), bad = [], ok = [];
  for (const code of codes) {
    const g = guides[code];
    if (!g) { bad.push(code + ": no live build"); continue; }
    if (dup.some((d) => d.startsWith(code + ":"))) { bad.push(code + ": more than one live build"); continue; }
    const why = [];
    const r = findRender(P, g);
    if (!r) why.push("no render of this exact file (render_guides.js)");
    else if (r.stale) why.push("the render is of an older file (render_guides.js --force)");
    if (!g.inBuildLog) why.push("not in the build log (built elsewhere, or by hand)");
    else if (g.handEdit) why.push("edited after it was built (diff it and fold the edits into the guide file)");
    const qa = spawnSync(process.execPath, [path.join(P.KIT, "qa_qrgs.js"), "--set=" + g.set, "--file=" + g.path, "--config=" + P.file], { encoding: "utf8" });
    if (qa.status !== 0) why.push("QA: " + ((qa.stdout || "").split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 4).map((l) => l.trim()).join(" | ") || "exit " + qa.status));
    const scan = await scanDocx(fs.readFileSync(g.path), P);
    if (scan.blockers.length) why.push("clean scan: " + scan.blockers.join(", "));
    const hits = scan.hits.length ? " (clean scan: " + scan.hits.length + " line(s) to read; run client_ready_scan.js)" : "";
    if (why.length) { bad.push(code + ": " + why.join("; ")); continue; }
    ok.push(code + ": " + g.file + ", " + r.pages + " page(s)" + hits);
    if (CHECK) continue;
    const prev = locks[code];
    if (prev && prev.sha256 !== g.sha256) (prev.history = prev.history || []).push({ file: prev.file, sha256: prev.sha256, lockedAt: prev.lockedAt, how: prev.how });
    locks[code] = { ...(prev || {}), code, set: g.set, file: g.file, sha256: g.sha256, pdf: r.pdf, renderDir: r.dir, pages: r.pages,
      lockedAt: s, how: HOW, status: "Done, waiting for OK" };
  }
  console.log((CHECK ? "READY TO LOCK" : "LOCKED") + " (" + ok.length + "):\n  " + (ok.join("\n  ") || "none"));
  if (bad.length) console.log("NOT " + (CHECK ? "READY" : "LOCKED") + " (" + bad.length + "):\n  " + bad.join("\n  "));
  if (!CHECK && ok.length) { writeJsonSafe(LOCKS, locks); console.log("locks.json: " + Object.keys(locks).length + " lock(s), updated " + s + " (" + LOCKS + ")"); }
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
