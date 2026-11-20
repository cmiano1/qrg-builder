// build_ok_list.js: builds "QRG OK List - DRAFT <stamp>.xlsx" in the review folder: one row per live guide, where the
// reviewer (the person who gives the OK to send) reads each locked guide's PDF and picks "OK to send", "OK to send, note
// for later", or "Fix before sending". A working file for the reviewer, not a client deliverable.
// Inputs: the live builds (read fresh from disk), <review dir>/locks.json, optional <review dir>/notes.json,
// optional <review dir>/send_hold.json, and reconciled prior picks from the newest earlier OK List and/or
// <review dir>/review_state.json.
// Every live file is hashed again here, so a lock whose file changed after it was locked shows as "Lock broken".
// Carry-forward: Your call and Your comment are copied when the row's Locked file is the same file and still locked.
// A rebuilt guide starts blank, shows Changed since last sheet = Yes, and Check these spots starts with the earlier call.
// Stops if the earlier sheet is open in Excel (unsaved picks would be left behind).
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/build_ok_list.js [--set=<id>] [--prior="<sheet.xlsx>" | --prior=none]
// Writes only the new sheet and <review dir>/_work/carry_<stamp>.json. Read-only on every guide and on locks.json.
"use strict";

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { loadConfig, arg, stamp } = require("../lib/config");
const { writeJsonSafe, fileUrl } = require("../lib/inventory");
const {
  CALLS,
  loadProjectReviewState,
  uniqueStampedPath,
} = require("../lib/review_state");

const COLS = [
  ["#", 5, "n"],
  ["Guide", 16, "code"],
  ["Set", 18, "set"],
  ["Title", 36, "title"],
  ["Status", 22, "status"],
  ["Your call", 22, "call"],
  ["Your comment", 40, "comment"],
  ["PDF", 7, "pdf"],
  ["Word", 7, "word"],
  ["Pages", 6, "pages"],
  ["How this version was reached", 40, "how"],
  ["Check these spots", 60, "check"],
  ["Locked file", 50, "lockedFile"],
  ["Hash", 10, "hash"],
  ["Locked at", 14, "lockedAt"],
  ["Changed since last sheet", 10, "changed"],
];
const C = Object.fromEntries(COLS.map(([, , k], i) => [k, i + 1]));
const L_ = (k) => String.fromCharCode(64 + C[k]);

async function buildOkList(P, opts = {}) {
  const baseStamp = stamp(opts.now || new Date());
  if (opts.prior && opts.prior !== "none" && !fs.existsSync(opts.prior)) {
    throw new Error("STOP: prior sheet not found: " + opts.prior);
  }

  let outPath;
  let outFile;
  let stampTag;
  if (opts.out) {
    outPath = path.resolve(opts.out);
    outFile = path.basename(outPath);
    stampTag = baseStamp;
  } else {
    const picked = uniqueStampedPath(P.reviewDir, "QRG OK List - DRAFT ", baseStamp, ".xlsx");
    outPath = picked.path;
    outFile = picked.file;
    stampTag = picked.stampTag;
  }

  const state = await loadProjectReviewState(P, {
    set: opts.set || undefined,
    prior: opts.prior,
    includeState: opts.includeState,
    beforeStampTag: stampTag,
    skipBusyCheck: opts.skipBusyCheck,
  });

  if (state.dup.length) {
    throw new Error("STOP: more than one live build of a guide:\n  " + state.dup.join("\n  "));
  }

  const rows = state.guides;
  const FONT = P.cfg.font || "Calibri";
  const NAVY = "FF1F3864";
  const INPUT_HEAD = "FFFFD966";
  const INPUT = "FFFFF2CC";
  const thin = { style: "thin", color: { argb: "FFBFBFBF" } };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

  const wb = new ExcelJS.Workbook();
  wb.creator = P.cfg.author;

  const hu = wb.addWorksheet("How to use", { views: [{ showGridLines: false }] });
  hu.getColumn(2).width = 110;
  const when =
    baseStamp.slice(4, 6) +
    "/" +
    baseStamp.slice(6, 8) +
    "/" +
    baseStamp.slice(0, 4) +
    " " +
    baseStamp.slice(9, 11) +
    ":" +
    baseStamp.slice(11);
  [
    [P.cfg.project + ": QRG OK List, built " + when, 14],
    ["Work down the OK List tab. A row marked Done, waiting for OK is one exact file: its name and SHA-256 are locked. Nothing in a locked file changes unless you ask for a fix."],
    ["1. Click PDF to read the guide as rendered. Read Check these spots first."],
    ["2. In Your call, pick one: OK to send / OK to send, note for later / Fix before sending."],
    ["3. For a fix, say what to change in Your comment. The guide is fixed, rebuilt, and relocked, and it comes back on the next sheet with Changed since last sheet = Yes."],
    ["Not locked rows are still being built or checked. Lock broken rows changed after they were locked and need a relock before you pick."],
    ["Your picks carry forward: the next sheet copies Your call and Your comment when the row's Locked file is the same file. Work in the newest sheet only, and save and close it before the next sheet is built."],
    ["Send copies are made only from OK to send rows whose file still matches its lock. Their names drop the guide number, the status, and the time stamp."],
  ].forEach(([t, sz], i) => {
    const c = hu.getRow(i + 2).getCell(2);
    c.value = t;
    c.font = { name: FONT, size: sz || 11, bold: !!sz };
    c.alignment = { wrapText: true, vertical: "top" };
  });

  const ls = wb.addWorksheet("Lists", { state: "hidden" });
  CALLS.forEach((v, i) => {
    ls.getRow(i + 1).getCell(1).value = v;
  });

  const ws = wb.addWorksheet("OK List", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1, zoomScale: 90 }],
  });
  ws.columns = COLS.map(([h, w]) => ({ header: h, width: w }));
  ws.getRow(1).eachCell((c, i) => {
    const input = i === C.call || i === C.comment;
    c.font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: input ? "FF000000" : "FFFFFFFF" },
    };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: input ? INPUT_HEAD : NAVY },
    };
    c.alignment = { wrapText: true, vertical: "middle" };
  });

  rows.forEach((r, k) => {
    const vals = {
      n: k + 1,
      code: r.code,
      set: r.set,
      title: r.title,
      status: r.status,
      call: r.call || null,
      comment: r.comment || null,
      pdf: r.pdf ? { text: "PDF", hyperlink: fileUrl(r.pdf) } : "",
      word: r.word ? { text: "Word", hyperlink: fileUrl(r.word) } : "",
      pages: r.pages,
      how: r.how,
      check: r.checkWithEarlier || "",
      lockedFile: r.lockedFile,
      hash: r.hash,
      lockedAt: r.lockedAt,
      changed: r.changed ? "Yes" : "",
    };
    const row = ws.addRow(COLS.map(([, , key]) => (vals[key] == null ? null : vals[key])));
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.font = { name: FONT, size: i >= C.how ? 9 : 10 };
      c.alignment = { wrapText: true, vertical: "top" };
      c.border = BORDER;
    });
    row.getCell(C.code).font = { name: FONT, size: 10, bold: true };
    for (const i of [C.pdf, C.word]) {
      if (row.getCell(i).value) {
        row.getCell(i).font = {
          name: FONT,
          size: 10,
          color: { argb: "FF0563C1" },
          underline: true,
        };
      }
    }
    for (const i of [C.call, C.comment]) {
      row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT } };
    }
    if (r.locked) {
      row.getCell(C.call).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["Lists!$A$1:$A$3"],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Not in the list",
        error: "Pick from the list, or press Yes to keep what you typed.",
      };
    }
    const sf = r.locked
      ? "FFE2EFDA"
      : r.status.startsWith("Lock broken")
        ? "FFF8CBAD"
        : "FFFCE4D6";
    row.getCell(C.status).fill = { type: "pattern", pattern: "solid", fgColor: { argb: sf } };
  });

  const last = Math.max(ws.rowCount, 2);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: COLS.length } };
  ws.addConditionalFormatting({
    ref: "A2:" + String.fromCharCode(64 + COLS.length) + last,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: ["LEFT($" + L_("call") + '2,10)="OK to send"'],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE2EFDA" } } },
      },
      {
        type: "expression",
        priority: 2,
        formulae: ["$" + L_("call") + '2="Fix before sending"'],
        style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFCE4D6" } } },
      },
    ],
  });

  const sm = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  sm.getColumn(2).width = 30;
  for (const k of [3, 4, 5, 6, 7]) sm.getColumn(k).width = 14;
  sm.getRow(2).getCell(2).value = "Progress (updates as you pick)";
  sm.getRow(2).getCell(2).font = { name: FONT, size: 13, bold: true };
  ["Set", "Guides", "Locked", "OK to send", "Fix before sending", "Locked, not picked yet"].forEach(
    (h, i) => {
      const c = sm.getRow(4).getCell(i + 2);
      c.value = h;
      c.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.border = BORDER;
    }
  );
  const rng = (k) => "'OK List'!$" + L_(k) + "$2:$" + L_(k) + "$" + last;
  [...new Set(rows.map((r) => r.set)), "All"].forEach((s, k) => {
    const r = sm.getRow(5 + k);
    const crit = s === "All" ? '"*"' : '"' + s.replace(/"/g, '""') + '"';
    const n = 5 + k;
    r.getCell(2).value = s;
    r.getCell(3).value = { formula: "COUNTIFS(" + rng("set") + "," + crit + ")" };
    r.getCell(4).value = {
      formula: "COUNTIFS(" + rng("set") + "," + crit + "," + rng("status") + ',"Done, waiting for OK")',
    };
    r.getCell(5).value = {
      formula:
        "COUNTIFS(" +
        rng("set") +
        "," +
        crit +
        "," +
        rng("status") +
        ',"Done, waiting for OK",' +
        rng("call") +
        ',"OK to send*")',
    };
    r.getCell(6).value = {
      formula:
        "COUNTIFS(" +
        rng("set") +
        "," +
        crit +
        "," +
        rng("status") +
        ',"Done, waiting for OK",' +
        rng("call") +
        ',"Fix before sending")',
    };
    r.getCell(7).value = { formula: "D" + n + "-E" + n + "-F" + n };
    r.eachCell({ includeEmpty: true }, (c, i) => {
      if (i > 1) {
        c.font = { name: FONT, size: 10, bold: s === "All" };
        c.border = BORDER;
      }
    });
  });
  wb.calcProperties.fullCalcOnLoad = true;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  const carryPath = path.join(P.reviewDir, "_work", "carry_" + stampTag + ".json");
  writeJsonSafe(carryPath, state.report);

  return {
    out: outPath,
    file: outFile,
    stampTag,
    carryPath,
    report: state.report,
    rows,
    summary: state.summary,
  };
}

module.exports = { buildOkList };

if (require.main === module) {
  const P = loadConfig();
  const SET = arg("set");
  const PRIOR = arg("prior");
  const OUT = arg("out");
  buildOkList(P, { set: SET || undefined, prior: PRIOR || undefined, out: OUT || undefined })
    .then((res) => {
      const rep = res.report;
      if (!rep.from) {
        console.log("carry: no earlier sheet or saved review state");
      } else {
        console.log(
          "carry from " +
            rep.from +
            ": picks " +
            rep.picks +
            ", comments " +
            rep.comments +
            ", not carried " +
            rep.notCarried.length +
            (rep.notCarried.length ? " [" + rep.notCarried.join(", ") + "]" : "") +
            ", changed rows " +
            rep.changed +
            ", earlier calls kept " +
            (rep.earlierKept || 0) +
            ", unmatched " +
            rep.unmatched.length
        );
        rep.unmatched.forEach((u) =>
          console.log("  UNMATCHED (a pick on the earlier sheet has no row now) " + u)
        );
      }
      const v = res.rows.map((r) => r.status);
      console.log(
        "wrote " +
          res.out +
          "\nrows " +
          res.rows.length +
          "; locked " +
          v.filter((s) => s.startsWith("Done")).length +
          "; lock broken " +
          v.filter((s) => s.startsWith("Lock broken")).length +
          "; not locked " +
          v.filter((s) => s.startsWith("Not locked")).length
      );
    })
    .catch((e) => {
      const msg = e && e.message ? String(e.message) : String(e);
      console.error(msg.startsWith("STOP") ? msg : "ERROR " + (e.stack || e));
      process.exit(msg.startsWith("STOP") ? 2 : 1);
    });
}
