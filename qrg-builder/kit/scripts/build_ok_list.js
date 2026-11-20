// build_ok_list.js: builds "QRG OK List - DRAFT <stamp>.xlsx" in the review folder: one row per live guide, where the
// reviewer (the person who gives the OK to send) reads each locked guide's PDF and picks "OK to send", "OK to send, note
// for later", or "Fix before sending". A working file for the reviewer, not a client deliverable.
// Inputs: the live builds (read fresh from disk), <review dir>/locks.json, and optional <review dir>/notes.json:
//   { "<code>": { "check": "what the reviewer should look at first", "how": "replaces the lock's how note" } }
// Every live file is hashed again here, so a lock whose file changed after it was locked shows as "Lock broken".
// Carry-forward: Your call and Your comment are copied from the newest earlier sheet in the review folder when the row's
// Locked file is the same file. A rebuilt guide starts blank, shows Changed since last sheet = Yes, and Check these spots
// starts with the earlier call. Stops if the earlier sheet is open in Excel (unsaved picks would be left behind).
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/build_ok_list.js [--set=<id>] [--prior="<sheet.xlsx>" | --prior=none]
// Writes only the new sheet and <review dir>/_work/carry_<stamp>.json. Read-only on every guide and on locks.json.
const fs = require("fs");
const path = require("path");
const { loadConfig, arg, stamp } = require("../lib/config");
const ExcelJS = require("exceljs");
const { liveInventory, findRender, readJson, writeJsonSafe, fileUrl } = require("../lib/inventory");

const P = loadConfig();
const SET = arg("set");
const STAMP = stamp();
const SHEET_RE = /^QRG OK List - DRAFT ([0-9]{8}-[0-9]{4})[.]xlsx$/;
const OUT = path.join(P.reviewDir, "QRG OK List - DRAFT " + STAMP + ".xlsx");
if (fs.existsSync(OUT)) { console.error("STOP: " + path.basename(OUT) + " already exists (two sheets in one minute). Wait a minute and rerun."); process.exit(2); }
const locks = readJson(path.join(P.reviewDir, "locks.json"), {});
const notes = readJson(path.join(P.reviewDir, "notes.json"), {});
const hold = readJson(path.join(P.reviewDir, "send_hold.json"), {});
const { guides, dup } = liveInventory(P, { set: SET || undefined });
if (dup.length) { console.error("STOP: more than one live build of a guide:\n  " + dup.join("\n  ")); process.exit(2); }

// ---- rows: every live guide, plus every lock whose guide has no live build ----
const setOrder = P.sets.map((s) => s.id);
const codes = [...new Set([...Object.keys(guides), ...Object.keys(locks).filter((c) => !SET || locks[c].set === SET)])]
  .sort((a, b) => (setOrder.indexOf(a.slice(0, -3)) - setOrder.indexOf(b.slice(0, -3))) || a.localeCompare(b));
const rows = codes.map((code) => {
  const g = guides[code], L = locks[code], N = notes[code] || {};
  let status;
  if (g && L && L.file === g.file && L.sha256 === g.sha256) status = "Done, waiting for OK";
  else if (g && L) status = "Lock broken: the file changed after it was locked (relock it)";
  else if (L) status = "Lock broken: no live build";
  else status = "Not locked";
  const r = g ? findRender(P, g) : null;
  const pdf = L && L.pdf && fs.existsSync(L.pdf) && status.startsWith("Done") ? L.pdf : r && !r.stale ? r.pdf : "";
  const check = [hold[code] ? "On hold for sending: " + (hold[code].reason || "see send_hold.json") : "", N.check || ""].filter(Boolean).join("\n");
  const setInfo = P.sets.find((s) => s.id === (g ? g.set : L.set)) || {};
  return { code, set: setInfo.label || setInfo.prefix || (g ? g.set : L.set), title: g ? g.title : (L.file || "").replace(/ - [A-Z]+ [0-9]{8}-[0-9]{4}[.]docx$/, ""),
    status, pdf, word: g ? g.path : "", pages: L && status.startsWith("Done") ? L.pages : r && !r.stale ? r.pages : "",
    how: N.how || (L ? L.how : ""), check, lockedFile: L ? L.file : "", hash: L ? L.sha256.slice(0, 8) : "", lockedAt: L ? L.lockedAt : "", locked: status.startsWith("Done") };
});

// ---- workbook ----
const FONT = P.cfg.font || "Calibri", NAVY = "FF1F3864", INPUT_HEAD = "FFFFD966", INPUT = "FFFFF2CC";
const thin = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const CALLS = ["OK to send", "OK to send, note for later", "Fix before sending"];
const COLS = [
  ["#", 5, "n"], ["Guide", 16, "code"], ["Set", 18, "set"], ["Title", 36, "title"], ["Status", 22, "status"],
  ["Your call", 22, "call"], ["Your comment", 40, "comment"], ["PDF", 7, "pdf"], ["Word", 7, "word"], ["Pages", 6, "pages"],
  ["How this version was reached", 40, "how"], ["Check these spots", 60, "check"], ["Locked file", 50, "lockedFile"],
  ["Hash", 10, "hash"], ["Locked at", 14, "lockedAt"], ["Changed since last sheet", 10, "changed"],
];
const C = Object.fromEntries(COLS.map(([, , k], i) => [k, i + 1]));
const L_ = (k) => String.fromCharCode(64 + C[k]);
const wb = new ExcelJS.Workbook();
wb.creator = P.cfg.author;

const hu = wb.addWorksheet("How to use", { views: [{ showGridLines: false }] });
hu.getColumn(2).width = 110;
const when = STAMP.slice(4, 6) + "/" + STAMP.slice(6, 8) + "/" + STAMP.slice(0, 4) + " " + STAMP.slice(9, 11) + ":" + STAMP.slice(11);
[
  [P.cfg.project + ": QRG OK List, built " + when, 14],
  ["Work down the OK List tab. A row marked Done, waiting for OK is one exact file: its name and SHA-256 are locked. Nothing in a locked file changes unless you ask for a fix."],
  ["1. Click PDF to read the guide as Word lays it out. Read Check these spots first."],
  ["2. In Your call, pick one: OK to send / OK to send, note for later / Fix before sending."],
  ["3. For a fix, say what to change in Your comment. The guide is fixed, rebuilt, and relocked, and it comes back on the next sheet with Changed since last sheet = Yes."],
  ["Not locked rows are still being built or checked. Lock broken rows changed after they were locked and need a relock before you pick."],
  ["Your picks carry forward: the next sheet copies Your call and Your comment when the row's Locked file is the same file. Work in the newest sheet only, and save and close it before the next sheet is built."],
  ["Send copies are made only from OK to send rows whose file still matches its lock. Their names drop the guide number, the status, and the time stamp."],
].forEach(([t, sz], i) => { const c = hu.getRow(i + 2).getCell(2); c.value = t; c.font = { name: FONT, size: sz || 11, bold: !!sz }; c.alignment = { wrapText: true, vertical: "top" }; });

const ls = wb.addWorksheet("Lists", { state: "hidden" });
CALLS.forEach((v, i) => (ls.getRow(i + 1).getCell(1).value = v));

const ws = wb.addWorksheet("OK List", { views: [{ state: "frozen", xSplit: 2, ySplit: 1, zoomScale: 90 }] });
ws.columns = COLS.map(([h, w]) => ({ header: h, width: w }));
ws.getRow(1).eachCell((c, i) => {
  const input = i === C.call || i === C.comment;
  c.font = { name: FONT, size: 10, bold: true, color: { argb: input ? "FF000000" : "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: input ? INPUT_HEAD : NAVY } };
  c.alignment = { wrapText: true, vertical: "middle" };
});
rows.forEach((r, k) => {
  const vals = { ...r, n: k + 1, call: null, comment: null, changed: "",
    pdf: r.pdf ? { text: "PDF", hyperlink: fileUrl(r.pdf) } : "", word: r.word ? { text: "Word", hyperlink: fileUrl(r.word) } : "" };
  const row = ws.addRow(COLS.map(([, , key]) => vals[key] == null ? null : vals[key]));
  row.eachCell({ includeEmpty: true }, (c, i) => { c.font = { name: FONT, size: i >= C.how ? 9 : 10 }; c.alignment = { wrapText: true, vertical: "top" }; c.border = BORDER; });
  row.getCell(C.code).font = { name: FONT, size: 10, bold: true };
  for (const i of [C.pdf, C.word]) if (row.getCell(i).value) row.getCell(i).font = { name: FONT, size: 10, color: { argb: "FF0563C1" }, underline: true };
  for (const i of [C.call, C.comment]) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT } };
  if (r.locked) row.getCell(C.call).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$A$1:$A$3"], showErrorMessage: true,
    errorStyle: "warning", errorTitle: "Not in the list", error: "Pick from the list, or press Yes to keep what you typed." };
  const sf = r.locked ? "FFE2EFDA" : r.status.startsWith("Lock broken") ? "FFF8CBAD" : "FFFCE4D6";
  row.getCell(C.status).fill = { type: "pattern", pattern: "solid", fgColor: { argb: sf } };
});
const last = Math.max(ws.rowCount, 2);
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: COLS.length } };
ws.addConditionalFormatting({ ref: "A2:" + String.fromCharCode(64 + COLS.length) + last, rules: [
  { type: "expression", priority: 1, formulae: ["LEFT($" + L_("call") + '2,10)="OK to send"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE2EFDA" } } } },
  { type: "expression", priority: 2, formulae: ["$" + L_("call") + '2="Fix before sending"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFCE4D6" } } } },
] });

const sm = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
sm.getColumn(2).width = 30; for (const k of [3, 4, 5, 6, 7]) sm.getColumn(k).width = 14;
sm.getRow(2).getCell(2).value = "Progress (updates as you pick)"; sm.getRow(2).getCell(2).font = { name: FONT, size: 13, bold: true };
["Set", "Guides", "Locked", "OK to send", "Fix before sending", "Locked, not picked yet"].forEach((h, i) => {
  const c = sm.getRow(4).getCell(i + 2); c.value = h; c.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.border = BORDER;
});
const rng = (k) => "'OK List'!$" + L_(k) + "$2:$" + L_(k) + "$" + last;
[...new Set(rows.map((r) => r.set)), "All"].forEach((s, k) => {
  const r = sm.getRow(5 + k), crit = s === "All" ? '"*"' : '"' + s.replace(/"/g, '""') + '"', n = 5 + k;
  r.getCell(2).value = s;
  r.getCell(3).value = { formula: "COUNTIFS(" + rng("set") + "," + crit + ")" };
  r.getCell(4).value = { formula: "COUNTIFS(" + rng("set") + "," + crit + "," + rng("status") + ',"Done, waiting for OK")' };
  r.getCell(5).value = { formula: "COUNTIFS(" + rng("set") + "," + crit + "," + rng("status") + ',"Done, waiting for OK",' + rng("call") + ',"OK to send*")' };
  r.getCell(6).value = { formula: "COUNTIFS(" + rng("set") + "," + crit + "," + rng("status") + ',"Done, waiting for OK",' + rng("call") + ',"Fix before sending")' };
  r.getCell(7).value = { formula: "D" + n + "-E" + n + "-F" + n };
  r.eachCell({ includeEmpty: true }, (c, i) => { if (i > 1) { c.font = { name: FONT, size: 10, bold: s === "All" }; c.border = BORDER; } });
});
wb.calcProperties.fullCalcOnLoad = true;

// ---- carry forward ----
const cellText = (v) => (v == null ? "" : typeof v === "object" ? (v.richText ? v.richText.map((t) => t.text).join("") : v.text != null ? String(v.text) : v.result != null ? String(v.result) : "") : String(v)).trim();
function priorSheet() {
  const a = arg("prior");
  if (a === "none") return null;
  if (a) { if (!fs.existsSync(a)) { console.error("STOP: prior sheet not found: " + a); process.exit(2); } return path.resolve(a); }
  if (!fs.existsSync(P.reviewDir)) return null;
  const c = fs.readdirSync(P.reviewDir).filter((f) => { const m = f.match(SHEET_RE); return m && m[1] < STAMP; }).sort();
  return c.length ? path.join(P.reviewDir, c[c.length - 1]) : null;
}
// Column numbers by header text, so a sheet with an older column order still carries.
const headers = (sheet) => { const h = {}; sheet.getRow(1).eachCell((c, i) => (h[cellText(c.value)] = i)); return h; };
async function carryForward() {
  const src = priorSheet();
  const rep = { from: src ? path.basename(src) : null, picks: 0, comments: 0, notCarried: [], unmatched: [], changed: 0 };
  if (!src) { console.log("carry: no earlier sheet"); return rep; }
  const tail = path.basename(src).slice(-18);
  let busy = fs.readdirSync(path.dirname(src)).some((f) => f.startsWith("~$") && f.endsWith(tail));
  try { fs.closeSync(fs.openSync(src, "r+")); } catch (e) { busy = true; }
  if (busy) throw new Error("STOP: " + path.basename(src) + " is open in Excel. Save and close it, then rerun (or pass --prior=none to start blank).");
  const pw = new ExcelJS.Workbook(); await pw.xlsx.readFile(src);
  const psheet = pw.getWorksheet("OK List");
  if (!psheet) throw new Error("STOP: " + path.basename(src) + " has no OK List tab");
  const h = headers(psheet), need = ["Guide", "Your call", "Your comment", "Locked file"].filter((x) => !h[x]);
  if (need.length) throw new Error("STOP: " + path.basename(src) + " OK List tab has no column " + need.join(", "));
  const prior = {};
  // An earlier sheet's "Your earlier call" line (a call not carried, for example a fix request) stays with the row until
  // the row gets a new call, so a sheet built mid-fix does not drop it.
  const earlier = (r) => h["Check these spots"] ? cellText(r.getCell(h["Check these spots"]).value).split("\n").filter((l) => l.startsWith("Your earlier call (")) : [];
  psheet.eachRow((r, i) => { if (i > 1) { const code = cellText(r.getCell(h.Guide).value); if (code) prior[code] = { call: cellText(r.getCell(h["Your call"]).value), comment: cellText(r.getCell(h["Your comment"]).value), file: cellText(r.getCell(h["Locked file"]).value), earlier: earlier(r) }; } });
  const seen = new Set();
  ws.eachRow((r, i) => {
    if (i < 2) return;
    const code = cellText(r.getCell(C.code).value), p = prior[code], cur = cellText(r.getCell(C.lockedFile).value);
    seen.add(code);
    if (p && p.file && p.file !== cur) { r.getCell(C.changed).value = "Yes"; rep.changed++; }
    if (p && !p.call && !p.comment && p.earlier.length) {
      const m = cellText(r.getCell(C.check).value), now = cellText(r.getCell(C.status).value).startsWith("Done");
      const why = ". Not carried: " + (now ? "the guide was rebuilt. Recheck it on this sheet." : "this row is not locked now.");
      r.getCell(C.check).value = p.earlier.map((l) => l.replace(/[.] Not carried: .*$/, why)).join("\n") + (m ? "\n" + m : "");
      rep.earlierKept = (rep.earlierKept || 0) + 1;
      return;
    }
    if (!p || (!p.call && !p.comment)) return;
    const locked = cellText(r.getCell(C.status).value).startsWith("Done");
    if (p.file && p.file === cur && locked) {
      if (p.call) { r.getCell(C.call).value = p.call; rep.picks++; }
      if (p.comment) { r.getCell(C.comment).value = p.comment; rep.comments++; }
    } else {
      const was = "Your earlier call (" + rep.from + (p.file ? ", on " + p.file : "") + "): " + (p.call || "none") + (p.comment ? "; your comment: " + p.comment.replace(/[.]+$/, "") : "")
        + ". Not carried: " + (!locked ? "this row is not locked now." : "the guide was rebuilt. Recheck it on this sheet.");
      const m = cellText(r.getCell(C.check).value);
      r.getCell(C.check).value = was + (m ? "\n" + m : "");
      rep.notCarried.push(code);
    }
  });
  for (const [code, p] of Object.entries(prior)) if (!seen.has(code) && (p.call || p.comment)) rep.unmatched.push(code);
  return rep;
}

carryForward().then(async (rep) => {
  fs.mkdirSync(P.reviewDir, { recursive: true });
  await wb.xlsx.writeFile(OUT);
  writeJsonSafe(path.join(P.reviewDir, "_work", "carry_" + STAMP + ".json"), rep);
  console.log("carry from " + rep.from + ": picks " + rep.picks + ", comments " + rep.comments + ", not carried " + rep.notCarried.length
    + (rep.notCarried.length ? " [" + rep.notCarried.join(", ") + "]" : "") + ", changed rows " + rep.changed + ", earlier calls kept " + (rep.earlierKept || 0) + ", unmatched " + rep.unmatched.length);
  rep.unmatched.forEach((u) => console.log("  UNMATCHED (a pick on the earlier sheet has no row now) " + u));
  const v = rows.map((r) => r.status);
  console.log("wrote " + OUT + "\nrows " + rows.length + "; locked " + v.filter((s) => s.startsWith("Done")).length + "; lock broken "
    + v.filter((s) => s.startsWith("Lock broken")).length + "; not locked " + v.filter((s) => s.startsWith("Not locked")).length);
}).catch((e) => { console.error(String(e.message).startsWith("STOP") ? e.message : "ERROR " + (e.stack || e)); process.exit(1); });
