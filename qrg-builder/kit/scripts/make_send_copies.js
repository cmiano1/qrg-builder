// make_send_copies.js: copies the guides the reviewer marked "OK to send" into a local send folder with clean names,
// for a person to move to the shared or client location by hand. Never edits a guide, a sheet, or locks.json, and never
// writes anywhere outside the project's send folder.
// A row is copied only when:
//   - Your call starts with "OK to send" and the guide is in locks.json
//   - the sheet's Locked file is the current lock (a pick made on an older build is refused)
//   - the locked file is still the live build and its SHA-256 still equals the lock
//   - the guide is not in <review dir>/send_hold.json  ({ "<code>": { "reason": "..." } })
//   - the send name is clean (no unsafe characters) and does not collide with another copy
// Send name: "<prefix> NN - <Title> - DRAFT 20261116-0930.docx" becomes "<prefix> - <Title>.docx" (no number, status, or
// stamp, since a set may not have a guide for every number). Set "review.sendKeepNumber": true in qrg.config.json to keep NN.
// Folder: <project>/<review.sendDir, default _send>/<set sendFolder, default set id>/. Each copy is hashed after writing.
// An existing copy with the same hash is left as is. An earlier copy this script made (its hash is in a send manifest), for
// example the version sent before a fix, is moved to <folder>/_replaced/ with a stamp, never deleted. Any other file with
// the same name stops the run.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/make_send_copies.js ["<OK List.xlsx>" ...] [--dry] [--list]
//       no sheet given: the newest OK List in the review folder. Several sheets: oldest first; the last pick per guide wins.
//   node qrg_kit/scripts/make_send_copies.js --dry --all-locked    check the send names of every lock (no picks needed)
const fs = require("fs");
const path = require("path");
const { loadConfig, flag, stamp, UNSAFE } = require("../lib/config");
const ExcelJS = require("exceljs");
const { liveInventory, readJson, writeJsonSafe, sha256, esc } = require("../lib/inventory");

const P = loadConfig();
const DRY = flag("dry"), ALL = flag("all-locked"), LIST = flag("list");
if (ALL && !DRY) { console.error("STOP: --all-locked is a dry check only. Copies need the reviewer's OK to send."); process.exit(2); }
const SHEET_RE = /^QRG OK List - DRAFT ([0-9]{8}-[0-9]{4})[.]xlsx$/;
let SHEETS = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((f) => path.resolve(f));
if (!SHEETS.length && !ALL) {
  const c = fs.existsSync(P.reviewDir) ? fs.readdirSync(P.reviewDir).filter((f) => SHEET_RE.test(f)).sort() : [];
  if (!c.length) { console.error("STOP: no OK List in " + P.reviewDir + " (build_ok_list.js makes one)."); process.exit(2); }
  SHEETS = [path.join(P.reviewDir, c[c.length - 1])];
  console.log("sheet: " + c[c.length - 1] + " (the newest)");
}
for (const s of SHEETS) {
  const tail = path.basename(s).slice(-18);
  if (fs.readdirSync(path.dirname(s)).some((f) => f.startsWith("~$") && f.endsWith(tail))) {
    console.error("STOP: " + path.basename(s) + " is open in Excel, so unsaved picks would be missed. Save and close it, then rerun."); process.exit(2);
  }
}
const locks = readJson(path.join(P.reviewDir, "locks.json"), {});
const HOLD = readJson(path.join(P.reviewDir, "send_hold.json"), {});
const SEND = P.abs(P.cfg.review.sendDir || "_send");
const { guides } = liveInventory(P);
const setOf = (id) => P.sets.find((s) => s.id === id);
const sendName = (L) => {
  const set = setOf(L.set);
  if (!set) return null;
  const m = L.file.match(new RegExp("^" + esc(set.prefix) + " ([0-9]{2}) - (.+) - [A-Z]+ [0-9]{8}-[0-9]{4}[.]docx$"));
  if (!m) return null;
  return set.prefix + (P.cfg.review.sendKeepNumber ? " " + m[1] : "") + " - " + m[2] + ".docx";
};
const cellText = (v) => (v == null ? "" : typeof v === "object" ? (v.richText ? v.richText.map((t) => t.text).join("") : v.text != null ? String(v.text) : v.result != null ? String(v.result) : "") : String(v)).trim();

(async () => {
  const picks = {};
  for (const s of ALL ? [] : SHEETS) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(s);
    const ws = wb.getWorksheet("OK List");
    if (!ws) { console.error("STOP: " + path.basename(s) + " has no OK List tab"); process.exit(2); }
    const h = {}; ws.getRow(1).eachCell((c, i) => (h[cellText(c.value)] = i));
    const need = ["Guide", "Your call", "Your comment", "Locked file"].filter((x) => !h[x]);
    if (need.length) { console.error("STOP: " + path.basename(s) + " has no column " + need.join(", ")); process.exit(2); }
    ws.eachRow((r, i) => {
      if (i < 2) return;
      const call = cellText(r.getCell(h["Your call"]).value);
      if (call) picks[cellText(r.getCell(h.Guide).value)] = { call, comment: cellText(r.getCell(h["Your comment"]).value), lockedFile: cellText(r.getCell(h["Locked file"]).value), sheet: path.basename(s) };
    });
  }
  const out = { sheets: SHEETS.map((s) => path.basename(s)), copy: [], refused: [], fix: [], held: [], notPicked: 0 };
  const names = {};
  for (const [code, L] of Object.entries(locks)) {
    const p = ALL ? { call: "OK to send", lockedFile: L.file } : picks[code];
    if (!p || !p.call) { out.notPicked++; continue; }
    if (/^Fix before sending/.test(p.call)) { out.fix.push(code + (p.comment ? ": " + p.comment.slice(0, 160) : "")); continue; }
    if (!/^OK to send/.test(p.call)) { out.refused.push(code + ": Your call not recognized (" + p.call + ")"); continue; }
    if (HOLD[code]) { out.held.push(code + ": " + (HOLD[code].reason || "on hold")); continue; }
    if (p.lockedFile !== L.file) { out.refused.push(code + ": the pick (in " + p.sheet + ") was made on " + (p.lockedFile || "an unlocked row") + "; the current lock is " + L.file + ". Recheck it on the newest sheet."); continue; }
    const g = guides[code];
    if (!g || g.file !== L.file) { out.refused.push(code + ": the locked file is no longer the live build"); continue; }
    if (g.sha256 !== L.sha256) { out.refused.push(code + ": lock broken (the file changed after it was locked)"); continue; }
    const nm = sendName(L), set = setOf(L.set);
    if (!nm || UNSAFE.test(nm)) { out.refused.push(code + ": send name not clean: " + (nm || L.file)); continue; }
    const folder = set.sendFolder || set.id;
    if (UNSAFE.test(folder.replace(/\//g, ""))) { out.refused.push(code + ": send folder not clean: " + folder); continue; }
    const key = (folder + "/" + nm).toLowerCase();
    if (names[key]) { out.refused.push(code + ": send name collides with " + names[key] + " (" + folder + "/" + nm + ")"); continue; }
    names[key] = code;
    out.copy.push({ code, folder, src: g.path, name: nm, sha256: L.sha256, note: /note for later/.test(p.call) ? p.comment : "" });
  }
  for (const [code, p] of Object.entries(picks)) if (!locks[code] && /^OK to send/.test(p.call)) out.refused.push(code + ": picked OK to send (in " + p.sheet + ") but the guide is not locked");
  let made = 0, same = 0;
  const ours = new Set();
  if (fs.existsSync(SEND)) for (const m of fs.readdirSync(SEND).filter((x) => /^send_manifest_[0-9]{8}-[0-9]{4}[.]json$/.test(x)))
    for (const c of (readJson(path.join(SEND, m), {}).copy || [])) if (c.sha256) ours.add(c.sha256);
  out.replaced = [];
  const ST = stamp();
  if (!DRY) for (const c of out.copy) {
    const dir = path.join(SEND, c.folder), dst = path.join(dir, c.name);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(dst)) {
      const h = sha256(dst);
      if (h === c.sha256) { same++; continue; }
      if (!ours.has(h)) { console.error("STOP: a file this script did not make already has the send name " + dst + ". Move it aside, then rerun."); process.exit(1); }
      const old = path.join(dir, "_replaced", c.name.replace(/[.]docx$/, "") + " - replaced " + ST + ".docx");
      if (fs.existsSync(old)) { console.error("STOP: " + old + " already exists. Wait a minute and rerun."); process.exit(1); }
      fs.mkdirSync(path.dirname(old), { recursive: true });
      fs.renameSync(dst, old);
      out.replaced.push(c.code + ": the earlier copy (" + h.slice(0, 8) + ") moved to " + path.relative(SEND, old));
    }
    fs.copyFileSync(c.src, dst);
    if (sha256(dst) !== c.sha256) { console.error("STOP: copy hash mismatch " + dst); process.exit(1); }
    made++;
  }
  console.log((DRY ? "[dry] " : "") + "OK to send: " + out.copy.length + (DRY ? "" : " (copied " + made + ", already there " + same + ")") + "; Fix before sending: "
    + out.fix.length + "; refused: " + out.refused.length + "; held: " + out.held.length + "; locked, not picked: " + out.notPicked);
  out.refused.forEach((r) => console.log("  REFUSED " + r));
  (out.replaced || []).forEach((r) => console.log("  REPLACED " + r + ". If the old version was already sent, send this one too."));
  out.fix.forEach((r) => console.log("  FIX " + r));
  out.held.forEach((r) => console.log("  HELD " + r));
  out.copy.filter((c) => c.note).forEach((c) => console.log("  NOTE FOR LATER " + c.code + ": " + c.note.slice(0, 160)));
  if (LIST || DRY) out.copy.forEach((c) => console.log("  " + c.folder + "/" + c.name));
  if (!DRY && out.copy.length) { const m = path.join(SEND, "send_manifest_" + stamp() + ".json"); writeJsonSafe(m, out); console.log("manifest: " + m); }
  if (!DRY) console.log("Send folder: " + SEND + "\nThese are local copies. Move them to the shared location by hand.");
})().catch((e) => { console.error("ERROR " + (e.stack || e)); process.exit(1); });
