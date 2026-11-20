// lib/review_state.js: shared review-state, Review Lock verification, carry-forward, reconciliation,
// and Send Copy planning used by both the Browser Review UI and the .xlsx OK List workflow (ADR-0002).
"use strict";

const fs = require("fs");
const path = require("path");
const { liveInventory, findRender, readJson, writeJsonSafe } = require("./inventory");

const UNSAFE = /[\\/:*?"<>|#%&]/;
const REVIEW_STATE_FILE = "review_state.json";
const SHEET_RE = /^QRG OK List - DRAFT ([0-9]{8}-[0-9]{4})(?:_([0-9]+))?[.]xlsx$/;
const MANIFEST_RE = /^send_manifest_([0-9]{8}-[0-9]{4})(?:_([0-9]+))?[.]json$/;

const CALLS = Object.freeze([
  "OK to send",
  "OK to send, note for later",
  "Fix before sending",
]);

function isOkCall(call) {
  return typeof call === "string" && /^OK to send/.test(call);
}

function isFixCall(call) {
  return typeof call === "string" && /^Fix before sending/.test(call);
}

function evaluateLockStatus(liveGuide, lock) {
  if (
    liveGuide &&
    lock &&
    lock.file &&
    lock.sha256 &&
    liveGuide.file === lock.file &&
    liveGuide.sha256 === lock.sha256
  ) {
    return {
      lockStatus: "locked",
      statusText: "Done, waiting for OK",
      reason: "",
    };
  }
  if (liveGuide && lock) {
    return {
      lockStatus: "broken",
      statusText: "Lock broken: the file changed after it was locked (relock it)",
      reason:
        liveGuide.file !== lock.file
          ? "the locked file is no longer the live build"
          : "the file changed after it was locked",
    };
  }
  if (lock) {
    return {
      lockStatus: "broken",
      statusText: "Lock broken: no live build",
      reason: "no live build",
    };
  }
  return {
    lockStatus: "unlocked",
    statusText: "Not locked",
    reason: "not locked",
  };
}

function canPick(guide) {
  return Boolean(guide && guide.lockStatus === "locked");
}

function setPick(state, code, call) {
  if (!state || !Array.isArray(state.guides)) return state;
  const g = state.guides.find((x) => x.code === code);
  if (!g || !canPick(g)) return state;
  const normalized = call == null ? "" : String(call);
  if (normalized !== "" && !CALLS.includes(normalized)) {
    throw new RangeError("Unrecognized review call: " + JSON.stringify(normalized));
  }
  const nextCall = normalized === "" ? "" : g.call === normalized ? "" : normalized;
  return {
    ...state,
    lastEvent: nextCall
      ? 'Marked ' + code + ' as "' + nextCall + '"'
      : "Cleared pick on " + code,
    guides: state.guides.map((x) =>
      x.code === code ? { ...x, call: nextCall } : x
    ),
  };
}

function setComment(state, code, comment) {
  if (!state || !Array.isArray(state.guides)) return state;
  const g = state.guides.find((x) => x.code === code);
  if (!g) return state;
  const verbatim = comment == null ? "" : String(comment);
  return {
    ...state,
    lastEvent: "Saved reviewer comment on " + code,
    guides: state.guides.map((x) =>
      x.code === code ? { ...x, comment: verbatim } : x
    ),
  };
}

function summarize(guides) {
  const list = Array.isArray(guides) ? guides : [];
  const locked = list.filter((g) => g && g.lockStatus === "locked");
  const ok = locked.filter((g) => isOkCall(g.call)).length;
  const fix = locked.filter((g) => isFixCall(g.call)).length;
  const remaining = locked.length - ok - fix;
  return { total: list.length, locked: locked.length, ok, fix, remaining };
}

function cleanSendStem(guide, opts = {}) {
  const keepNumber = Boolean(opts.sendKeepNumber);
  const prefix = guide && guide.prefix ? String(guide.prefix) : "";
  if (!prefix) return null;
  let nn = guide.nn ? String(guide.nn) : "";
  let title = guide.title ? String(guide.title) : "";
  if ((!nn || !title) && guide.lockedFile) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = String(guide.lockedFile).match(
      new RegExp("^" + esc(prefix) + " ([0-9]{2}) - (.+) - [A-Z]+ [0-9]{8}-[0-9]{4}[.]docx$")
    );
    if (m) {
      if (!nn) nn = m[1];
      if (!title) title = m[2];
    }
  }
  if (!title) return null;
  return prefix + (keepNumber && nn ? " " + nn : "") + " - " + title;
}

function computeSendPlan(guides, includePdf = false, opts = {}) {
  const list = Array.isArray(guides) ? guides : [];
  const withPdf = Boolean(includePdf);
  const requirePdf = Boolean(opts.requirePdf);
  const copy = [];
  const skipped = [];
  const refused = [];
  const fix = [];
  const held = [];
  let notPicked = 0;
  const names = Object.create(null);

  for (const g of list) {
    if (!g) continue;
    const code = g.code;
    const call = g.call || "";
    const comment = g.comment || "";

    if (g.lockStatus === "broken") {
      const detail =
        g.lockReason ||
        "file changed after it was locked. Must re-render and relock.";
      const reason = "Lock broken: " + detail;
      skipped.push({ code, category: "broken", reason });
      if (isOkCall(call)) {
        refused.push(code + ": lock broken (" + detail + ")");
      }
      continue;
    }

    if (g.lockStatus !== "locked") {
      const reason = "Not locked yet.";
      skipped.push({ code, category: "unlocked", reason });
      if (isOkCall(call)) {
        refused.push(
          code +
            ": picked OK to send" +
            (g.pickSource ? " (in " + g.pickSource + ")" : "") +
            " but the guide is not locked"
        );
      }
      continue;
    }

    if (!call) {
      notPicked++;
      skipped.push({ code, category: "unpicked", reason: "No decision picked yet." });
      continue;
    }

    if (isFixCall(call)) {
      fix.push(code + (comment ? ": " + comment.slice(0, 160) : ""));
      skipped.push({
        code,
        category: "fix",
        reason: "Marked Fix before sending" + (comment ? ": " + comment : "."),
      });
      continue;
    }

    if (!isOkCall(call)) {
      const msg = code + ": Your call not recognized (" + call + ")";
      refused.push(msg);
      skipped.push({ code, category: "refused", reason: "Your call not recognized (" + call + ")." });
      continue;
    }

    if (g.onHold) {
      const holdReason = typeof g.onHold === "string" ? g.onHold : "on hold";
      held.push(code + ": " + holdReason);
      skipped.push({ code, category: "held", reason: "On send hold: " + holdReason });
      continue;
    }

    if (g.pickLockedFile !== undefined && g.lockedFile && g.pickLockedFile !== g.lockedFile) {
      const reason =
        "the pick" +
        (g.pickSource ? " (in " + g.pickSource + ")" : "") +
        " was made on " +
        (g.pickLockedFile || "an unlocked row") +
        "; the current lock is " +
        g.lockedFile +
        ". Recheck it on the newest sheet.";
      refused.push(code + ": " + reason);
      skipped.push({ code, category: "refused", reason });
      continue;
    }

    const stem = cleanSendStem(g, opts);
    const docxName = stem ? stem + ".docx" : null;
    if (!docxName || UNSAFE.test(docxName)) {
      const reason = "send name not clean: " + (docxName || g.lockedFile || code);
      refused.push(code + ": " + reason);
      skipped.push({ code, category: "refused", reason });
      continue;
    }

    const folder = g.sendFolder || g.set || "";
    const folderClean = folder.replace(/\//g, "");
    if (!folder || UNSAFE.test(folderClean) || folder.split(/[\\/]/).includes("..")) {
      const reason = "send folder not clean: " + folder;
      refused.push(code + ": " + reason);
      skipped.push({ code, category: "refused", reason });
      continue;
    }

    const key = (folder + "/" + docxName).toLowerCase();
    if (names[key]) {
      const reason = "send name collides with " + names[key] + " (" + folder + "/" + docxName + ")";
      refused.push(code + ": " + reason);
      skipped.push({ code, category: "refused", reason });
      continue;
    }

    let pdfName = null;
    let pdfSrc = null;
    if (withPdf) {
      if (g.pdfStale === true) {
        const reason = "Render PDF is stale for this locked build (run render_guides.js and lock_guides.js)";
        refused.push(code + ": " + reason);
        skipped.push({ code, category: "refused", reason });
        continue;
      }
      const pdfMissing =
        g.pdfExists === false ||
        g.pdf === "" ||
        g.pdf === null ||
        (requirePdf && !g.pdf);
      if (pdfMissing) {
        const reason = "missing verified Render PDF for this locked build (run render_guides.js and lock_guides.js)";
        refused.push(code + ": " + reason);
        skipped.push({ code, category: "refused", reason });
        continue;
      }
      pdfName = stem + ".pdf";
      pdfSrc = g.pdf || null;
    }

    names[key] = code;
    const files = [folder + "/" + docxName];
    if (pdfName) files.push(folder + "/" + pdfName);
    const noteForLater = /note for later/.test(call) ? comment : "";
    copy.push({
      code,
      folder,
      name: docxName,
      pdfName,
      files,
      src: g.path || null,
      pdfSrc,
      sha256: g.sha256 || null,
      noteForLater,
      note: noteForLater,
    });
  }

  return { includePdf: withPdf, copy, skipped, refused, fix, held, notPicked };
}

function sameLockedVersion(prior, cur) {
  if (!prior || !cur || !prior.lockedFile || !cur.lockedFile) return false;
  if (prior.lockedFile !== cur.lockedFile) return false;
  if (prior.lockedSha256 && cur.lockedSha256 && prior.lockedSha256 !== cur.lockedSha256) {
    return false;
  }
  return true;
}

function hasDecision(rec) {
  return Boolean(rec && (rec.call || rec.comment));
}

function normalizePriorRecord(rec, sourceLabel, timestampMs) {
  if (!rec) return null;
  return {
    call: rec.call == null ? "" : String(rec.call),
    comment: rec.comment == null ? "" : String(rec.comment),
    lockedFile: rec.lockedFile || rec.file || "",
    lockedSha256: rec.lockedSha256 || "",
    earlier: Array.isArray(rec.earlier) ? rec.earlier.filter(Boolean) : [],
    sourceLabel: rec.sourceLabel || sourceLabel || "earlier review",
    updatedAtMs:
      typeof rec.updatedAtMs === "number"
        ? rec.updatedAtMs
        : typeof timestampMs === "number"
          ? timestampMs
          : 0,
  };
}

function reconcilePriorPicks(sheetPrior, statePrior, currentGuides = [], opts = {}) {
  const sheetMap = (sheetPrior && sheetPrior.picksByCode) || {};
  const sheetMtime = sheetPrior && typeof sheetPrior.mtimeMs === "number" ? sheetPrior.mtimeMs : 0;
  const sheetLabel = (sheetPrior && sheetPrior.sourceLabel) || "OK List";

  const stateMap = (statePrior && statePrior.guides) || {};
  const stateLabel = (statePrior && statePrior.sourceLabel) || "Browser Review";

  const curByCode = Object.create(null);
  for (const g of currentGuides || []) {
    if (g && g.code) curByCode[g.code] = g;
  }

  const allCodes = new Set([...Object.keys(sheetMap), ...Object.keys(stateMap)]);
  const priorByCode = Object.create(null);
  const sources = [];
  if (sheetPrior && sheetPrior.sourceLabel) sources.push(sheetPrior.sourceLabel);
  if (statePrior && Object.keys(stateMap).length) sources.push(stateLabel);

  for (const code of allCodes) {
    const sRec = normalizePriorRecord(sheetMap[code], sheetLabel, sheetMtime);
    const lRec = normalizePriorRecord(stateMap[code], stateLabel, stateMap[code] ? stateMap[code].updatedAtMs : 0);

    if (sRec && !lRec) {
      priorByCode[code] = sRec;
      continue;
    }
    if (lRec && !sRec) {
      priorByCode[code] = lRec;
      continue;
    }

    const cur = curByCode[code] || null;
    if (opts.explicitSheet) {
      priorByCode[code] = sRec;
      continue;
    }

    // If the two sources refer to different locked files, prefer whichever matches the current build.
    if (sRec.lockedFile !== lRec.lockedFile) {
      const sMatches = cur && sameLockedVersion(sRec, cur);
      const lMatches = cur && sameLockedVersion(lRec, cur);
      if (lMatches && !sMatches) {
        priorByCode[code] = lRec;
        continue;
      }
      if (sMatches && !lMatches) {
        priorByCode[code] = sRec;
        continue;
      }
      // Neither matches current (both stale): keep whichever has a decision, breaking ties by timestamp.
      if (hasDecision(lRec) && !hasDecision(sRec)) {
        priorByCode[code] = lRec;
        continue;
      }
      if (hasDecision(sRec) && !hasDecision(lRec)) {
        priorByCode[code] = sRec;
        continue;
      }
      priorByCode[code] = lRec.updatedAtMs >= sRec.updatedAtMs ? lRec : sRec;
      continue;
    }

    // Same locked file on both surfaces.
    const sHas = hasDecision(sRec);
    const lHas = hasDecision(lRec);
    if (sHas && lHas) {
      priorByCode[code] = lRec.updatedAtMs >= sRec.updatedAtMs ? lRec : sRec;
    } else if (lHas && !sHas) {
      // Preserve local pick when the .xlsx row is blank (e.g. sheet exported before browser pick, or concurrent edits on other rows).
      priorByCode[code] = lRec;
    } else if (sHas && !lHas) {
      // Browser explicitly cleared the pick after the sheet was saved if updatedAtMs > sheetMtime.
      priorByCode[code] = lRec.updatedAtMs > sRec.updatedAtMs ? lRec : sRec;
    } else {
      // Neither has an active decision; preserve any earlierCall lines.
      const mergedEarlier = [...new Set([...(sRec.earlier || []), ...(lRec.earlier || [])])];
      const base = lRec.updatedAtMs >= sRec.updatedAtMs ? lRec : sRec;
      priorByCode[code] = { ...base, earlier: mergedEarlier };
    }
  }

  return { priorByCode, sources };
}

function applyCarryForward(guides, priorByCode, opts = {}) {
  const list = Array.isArray(guides) ? guides : [];
  const prior = priorByCode || {};
  const report = {
    from: opts.from || null,
    picks: 0,
    comments: 0,
    notCarried: [],
    unmatched: [],
    changed: 0,
    earlierKept: 0,
  };
  const seen = new Set();

  const nextGuides = list.map((g) => {
    const code = g.code;
    seen.add(code);
    const p = prior[code] || null;
    const locked = g.lockStatus === "locked";
    const curFile = g.lockedFile || "";
    const curSha = g.lockedSha256 || g.sha256 || "";
    const priorFile = p ? p.lockedFile || p.file || "" : "";
    const priorSha = p ? p.lockedSha256 || "" : "";
    const changed = Boolean(
      p &&
        ((priorFile && priorFile !== curFile) ||
          (priorFile && priorFile === curFile && priorSha && curSha && priorSha !== curSha))
    );
    if (changed) report.changed++;

    let call = "";
    let comment = "";
    let earlierLines = [];

    if (p && !p.call && !p.comment && Array.isArray(p.earlier) && p.earlier.length) {
      const why =
        ". Not carried: " +
        (locked ? "the guide was rebuilt. Recheck it on this sheet." : "this row is not locked now.");
      earlierLines = p.earlier.map((line) => line.replace(/[.] Not carried: .*$/, why));
      report.earlierKept++;
    } else if (p && (p.call || p.comment)) {
      const same = sameLockedVersion(
        { lockedFile: priorFile, lockedSha256: priorSha },
        { lockedFile: curFile, lockedSha256: curSha }
      );
      if (same && locked) {
        if (p.call) {
          call = p.call;
          report.picks++;
        }
        if (p.comment) {
          comment = p.comment;
          report.comments++;
        }
      } else {
        const src = p.sourceLabel || report.from || "earlier review";
        const was =
          "Your earlier call (" +
          src +
          (priorFile ? ", on " + priorFile : "") +
          "): " +
          (p.call || "none") +
          (p.comment ? "; your comment: " + p.comment.replace(/[.]+$/, "") : "") +
          ". Not carried: " +
          (!locked ? "this row is not locked now." : "the guide was rebuilt. Recheck it on this sheet.");
        earlierLines = [was];
        report.notCarried.push(code);
      }
    }

    const earlierCall = earlierLines.join("\n");
    const baseCheck = g.check || "";
    const checkWithEarlier = earlierCall
      ? earlierCall + (baseCheck ? "\n" + baseCheck : "")
      : baseCheck;

    return {
      ...g,
      call,
      comment,
      changed,
      earlierLines,
      earlierCall,
      checkWithEarlier,
    };
  });

  for (const [code, p] of Object.entries(prior)) {
    if (!seen.has(code) && p && (p.call || p.comment)) {
      report.unmatched.push(code);
    }
  }

  return { guides: nextGuides, report };
}

function parseStampTag(tag) {
  const m = String(tag || "").match(/^([0-9]{8}-[0-9]{4})(?:_([0-9]+))?$/);
  if (!m) return { base: String(tag || ""), seq: 1 };
  return { base: m[1], seq: m[2] ? Number.parseInt(m[2], 10) : 1 };
}

function compareStampTags(a, b) {
  const pa = parseStampTag(a);
  const pb = parseStampTag(b);
  if (pa.base !== pb.base) return pa.base < pb.base ? -1 : 1;
  return pa.seq - pb.seq;
}

function uniqueStampedPath(dir, prefix, baseStamp, ext) {
  let seq = 1;
  for (;;) {
    const tag = seq === 1 ? baseStamp : baseStamp + "_" + String(seq).padStart(2, "0");
    const file = prefix + tag + ext;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) return { path: full, file, stampTag: tag };
    seq++;
  }
}

function uniqueRotationStamp(replacedDir, stem, baseStamp, exts = [".docx"]) {
  let seq = 1;
  for (;;) {
    const tag = seq === 1 ? baseStamp : baseStamp + "_" + String(seq).padStart(2, "0");
    const clash = exts.some((ext) =>
      fs.existsSync(path.join(replacedDir, stem + " - replaced " + tag + ext))
    );
    if (!clash) return tag;
    seq++;
  }
}

function reviewStatePath(P) {
  return path.join(P.reviewDir, REVIEW_STATE_FILE);
}

function readReviewState(P) {
  const p = reviewStatePath(P);
  const raw = readJson(p, null);
  if (!raw || typeof raw !== "object" || typeof raw.guides !== "object" || !raw.guides) {
    return { version: 1, updatedAt: null, guides: {} };
  }
  return {
    version: raw.version || 1,
    updatedAt: raw.updatedAt || null,
    guides: { ...raw.guides },
  };
}

function writeReviewState(P, data) {
  const p = reviewStatePath(P);
  const payload = {
    version: 1,
    updatedAt: (data && data.updatedAt) || new Date().toISOString(),
    guides: (data && data.guides) || {},
  };
  writeJsonSafe(p, payload);
  return p;
}

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    return "";
  }
  return String(v).trim();
}

function isSheetOpenInExcel(sheetPath) {
  const dir = path.dirname(sheetPath);
  const tail = path.basename(sheetPath).slice(-18);
  let busy = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith("~$") && f.endsWith(tail));
  if (!busy) {
    try {
      fs.closeSync(fs.openSync(sheetPath, "r+"));
    } catch (e) {
      busy = true;
    }
  }
  return busy;
}

function listOkLists(P) {
  if (!P || !P.reviewDir || !fs.existsSync(P.reviewDir)) return [];
  const items = [];
  for (const file of fs.readdirSync(P.reviewDir)) {
    const m = file.match(SHEET_RE);
    if (!m) continue;
    const full = path.join(P.reviewDir, file);
    const st = fs.statSync(full);
    const stampTag = m[2] ? m[1] + "_" + m[2] : m[1];
    items.push({
      file,
      path: full,
      stamp: m[1],
      seq: m[2] ? Number.parseInt(m[2], 10) : 1,
      stampTag,
      mtimeMs: st.mtimeMs,
    });
  }
  items.sort((a, b) => compareStampTags(a.stampTag, b.stampTag));
  return items;
}

async function readOkListPicks(sheetPath, opts = {}) {
  if (!opts.skipBusyCheck && isSheetOpenInExcel(sheetPath)) {
    throw new Error(
      "STOP: " +
        path.basename(sheetPath) +
        " is open in Excel. Save and close it, then rerun (or pass --prior=none to start blank)."
    );
  }
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sheetPath);
  const ws = wb.getWorksheet("OK List");
  if (!ws) throw new Error("STOP: " + path.basename(sheetPath) + " has no OK List tab");
  const h = {};
  ws.getRow(1).eachCell((c, i) => {
    h[cellText(c.value)] = i;
  });
  const need = ["Guide", "Your call", "Your comment", "Locked file"].filter((x) => !h[x]);
  if (need.length) {
    throw new Error(
      "STOP: " + path.basename(sheetPath) + " OK List tab has no column " + need.join(", ")
    );
  }
  const picksByCode = {};
  const readEarlier = (r) =>
    h["Check these spots"]
      ? cellText(r.getCell(h["Check these spots"]).value)
          .split("\n")
          .filter((l) => l.startsWith("Your earlier call ("))
      : [];
  ws.eachRow((r, i) => {
    if (i <= 1) return;
    const code = cellText(r.getCell(h.Guide).value);
    if (!code) return;
    picksByCode[code] = {
      call: cellText(r.getCell(h["Your call"]).value),
      comment: cellText(r.getCell(h["Your comment"]).value),
      lockedFile: cellText(r.getCell(h["Locked file"]).value),
      earlier: readEarlier(r),
      sheet: path.basename(sheetPath),
    };
  });
  const st = fs.statSync(sheetPath);
  return {
    file: path.basename(sheetPath),
    path: sheetPath,
    sourceLabel: path.basename(sheetPath),
    mtimeMs: st.mtimeMs,
    picksByCode,
  };
}

function listRenderPageFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((x) => /_p[0-9]+[.]png$/i.test(x))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function resolveVerifiedRenderPdf(P, liveGuide, lock) {
  const r = liveGuide ? findRender(P, liveGuide) : null;
  if (r && r.stale) {
    return { pdf: "", exists: false, stale: true, pages: 0, renderDir: r.dir || "", pageFiles: [] };
  }
  if (r && !r.stale) {
    const exists = Boolean(r.pdf && fs.existsSync(r.pdf));
    const pageFiles = listRenderPageFiles(r.dir);
    return {
      pdf: exists ? r.pdf : "",
      exists,
      stale: false,
      pages: r.pages || pageFiles.length,
      renderDir: r.dir || "",
      pageFiles,
    };
  }
  if (lock && lock.pdf && lock.sha256) {
    const rDir = lock.renderDir || path.dirname(lock.pdf);
    const metaPath = path.join(rDir, "render.json");
    if (!fs.existsSync(metaPath)) {
      return { pdf: "", exists: false, stale: false, pages: 0, renderDir: rDir, pageFiles: [] };
    }
    const meta = readJson(metaPath, null);
    if (!meta || !meta.sha256) {
      return { pdf: "", exists: false, stale: false, pages: 0, renderDir: rDir, pageFiles: [] };
    }
    if (meta.sha256 !== lock.sha256) {
      return { pdf: "", exists: false, stale: true, pages: 0, renderDir: rDir, pageFiles: [] };
    }
    if (meta.pdfName && path.basename(lock.pdf) !== meta.pdfName) {
      return { pdf: "", exists: false, stale: true, pages: 0, renderDir: rDir, pageFiles: [] };
    }
    const exists = fs.existsSync(lock.pdf);
    const pageFiles = listRenderPageFiles(rDir);
    return {
      pdf: exists ? lock.pdf : "",
      exists,
      stale: false,
      pages: lock.pages || pageFiles.length,
      renderDir: rDir,
      pageFiles,
    };
  }
  return { pdf: "", exists: false, stale: false, pages: 0, renderDir: "", pageFiles: [] };
}

function resolveIncludePdf(P, opts = {}) {
  if (typeof opts.includePdf === "boolean") return opts.includePdf;
  const rev = (P && P.cfg && P.cfg.review) || {};
  if (typeof rev.withPdf === "boolean") return rev.withPdf;
  if (typeof rev.includePdf === "boolean") return rev.includePdf;
  return false;
}

async function loadProjectReviewState(P, opts = {}) {
  const { baseGuides, dup, orphans } = buildBaseGuides(P, { set: opts.set });

  // Load prior picks from .xlsx OK List and/or local review_state.json
  let sheetPrior = null;
  let explicitSheet = false;
  if (opts.prior !== "none") {
    let sheetPath = null;
    if (opts.prior) {
      sheetPath = path.resolve(opts.prior);
      explicitSheet = true;
    } else {
      const sheets = listOkLists(P).filter((s) =>
        opts.beforeStampTag ? compareStampTags(s.stampTag, opts.beforeStampTag) < 0 : true
      );
      if (sheets.length) sheetPath = sheets[sheets.length - 1].path;
    }
    if (sheetPath) {
      sheetPrior = await readOkListPicks(sheetPath, { skipBusyCheck: opts.skipBusyCheck });
    }
  }

  const stateExists = fs.existsSync(reviewStatePath(P));
  const statePrior =
    opts.prior === "none" || opts.includeState === false
      ? null
      : stateExists
        ? { sourceLabel: "Browser Review", ...readReviewState(P) }
        : null;

  const { priorByCode, sources } = reconcilePriorPicks(sheetPrior, statePrior, baseGuides, {
    explicitSheet,
  });
  const fromLabel = sources.length ? sources.join(" + ") : null;
  const { guides, report } = applyCarryForward(baseGuides, priorByCode, { from: fromLabel });

  const accent =
    (P.cfg && P.cfg.palette && P.cfg.palette.accent)
      ? "#" + String(P.cfg.palette.accent).replace(/^#/, "")
      : "#C00000";

  return {
    project: P.cfg.project,
    accent,
    reviewDir: P.reviewDir,
    stateFile: stateExists ? reviewStatePath(P) : null,
    priorSheet: sheetPrior ? sheetPrior.path : null,
    priorSheetName: sheetPrior ? sheetPrior.file : null,
    priorSheetMtimeMs: sheetPrior ? sheetPrior.mtimeMs : 0,
    includePdfDefault: resolveIncludePdf(P),
    guides,
    summary: summarize(guides),
    report,
    dup,
    orphans,
  };
}

async function recordGuideDecision(P, code, patch = {}, opts = {}) {
  const state = await loadProjectReviewState(P, {
    set: opts.set,
    skipBusyCheck: opts.skipBusyCheck,
  });
  const cur = state.guides.find((g) => g.code === code);
  if (!cur) {
    return { ok: false, statusCode: 404, error: "Guide not found: " + code, state };
  }
  if (!canPick(cur)) {
    return {
      ok: false,
      statusCode: 409,
      error: "Guide " + code + " is " + cur.lockStatus + " and cannot be picked.",
      state,
    };
  }

  let nextCall = cur.call;
  let nextComment = cur.comment;
  let lastEvent = "";

  if (patch.call !== undefined) {
    const normalized = patch.call == null ? "" : String(patch.call);
    if (normalized !== "" && !CALLS.includes(normalized)) {
      return {
        ok: false,
        statusCode: 400,
        error: "Unrecognized review call: " + JSON.stringify(normalized),
        state,
      };
    }
    const toggle = opts.toggle !== false;
    nextCall = normalized === "" ? "" : toggle && cur.call === normalized ? "" : normalized;
    lastEvent = nextCall ? 'Marked ' + code + ' as "' + nextCall + '"' : "Cleared pick on " + code;
  }

  if (patch.comment !== undefined) {
    nextComment = patch.comment == null ? "" : String(patch.comment);
    if (!lastEvent) lastEvent = "Saved reviewer comment on " + code;
  }

  const stored = readReviewState(P);
  const prevRec = stored.guides[code] || {};
  let nowMs = typeof opts.nowMs === "number" ? opts.nowMs : Date.now();
  if (typeof opts.nowMs !== "number") {
    if (state.priorSheetMtimeMs && nowMs <= state.priorSheetMtimeMs && state.priorSheetMtimeMs - nowMs < 50) {
      nowMs = Math.ceil(state.priorSheetMtimeMs) + 1;
    }
    if (typeof prevRec.updatedAtMs === "number" && nowMs <= prevRec.updatedAtMs) {
      nowMs = prevRec.updatedAtMs + 1;
    }
  }
  const updatedAt = new Date(nowMs).toISOString();

  stored.updatedAt = updatedAt;
  stored.guides[code] = {
    call: nextCall,
    comment: nextComment,
    lockedFile: cur.lockedFile,
    lockedSha256: cur.lockedSha256,
    earlier: Array.isArray(cur.earlierLines) ? cur.earlierLines : [],
    updatedAt,
    updatedAtMs: nowMs,
  };
  writeReviewState(P, stored);

  const refreshed = await loadProjectReviewState(P, {
    set: opts.set,
    skipBusyCheck: opts.skipBusyCheck,
  });
  refreshed.lastEvent = lastEvent;
  const guide = refreshed.guides.find((g) => g.code === code);
  return { ok: true, statusCode: 200, guide, state: refreshed };
}

function buildBaseGuides(P, opts = {}) {
  const setFilter = opts.set || undefined;
  const locks = readJson(path.join(P.reviewDir, "locks.json"), {});
  const notes = readJson(path.join(P.reviewDir, "notes.json"), {});
  const hold = readJson(path.join(P.reviewDir, "send_hold.json"), {});
  const { guides: liveMap, dup, orphans } = liveInventory(P, { set: setFilter });

  const setOrder = P.sets.map((s) => s.id);
  const codes = [
    ...new Set([
      ...Object.keys(liveMap),
      ...Object.keys(locks).filter((c) => !setFilter || locks[c].set === setFilter),
    ]),
  ].sort(
    (a, b) =>
      setOrder.indexOf(a.slice(0, -3)) - setOrder.indexOf(b.slice(0, -3)) ||
      a.localeCompare(b)
  );

  const baseGuides = codes.map((code) => {
    const g = liveMap[code] || null;
    const L = locks[code] || null;
    const N = notes[code] || {};
    const lockEval = evaluateLockStatus(g, L);
    const locked = lockEval.lockStatus === "locked";
    const renderInfo = resolveVerifiedRenderPdf(P, g, L);
    const setId = g ? g.set : L ? L.set : code.slice(0, -3);
    const setInfo = P.sets.find((s) => s.id === setId) || {};
    const onHold = hold[code] ? hold[code].reason || "see send_hold.json" : "";
    const check = [
      hold[code] ? "On hold for sending: " + onHold : "",
      N.check || "",
    ]
      .filter(Boolean)
      .join("\n");
    const title = g
      ? g.title
      : ((L && L.file) || "").replace(/ - [A-Z]+ [0-9]{8}-[0-9]{4}[.]docx$/, "");

    return {
      code,
      setId,
      set: setInfo.label || setInfo.prefix || setId,
      prefix: setInfo.prefix || "",
      sendFolder: setInfo.sendFolder || setId,
      nn: g ? g.nn : code.slice(-2),
      title,
      status: lockEval.statusText,
      lockStatus: lockEval.lockStatus,
      lockReason: lockEval.reason,
      locked,
      pdf:
        locked && renderInfo.exists
          ? renderInfo.pdf
          : renderInfo.exists && !renderInfo.stale
            ? renderInfo.pdf
            : "",
      pdfExists: renderInfo.exists,
      pdfStale: renderInfo.stale,
      renderDir: renderInfo.renderDir,
      pageFiles: renderInfo.pageFiles,
      word: g ? g.path : "",
      path: g ? g.path : "",
      pages: locked && L && L.pages ? L.pages : renderInfo.pages || "",
      how: N.how || (L ? L.how : ""),
      check,
      onHold,
      lockedFile: L ? L.file : "",
      lockedSha256: L ? L.sha256 : "",
      sha256: g ? g.sha256 : "",
      hash: L && L.sha256 ? L.sha256.slice(0, 8) : "",
      lockedAt: L ? L.lockedAt : "",
      call: "",
      comment: "",
    };
  });

  return { baseGuides, locks, dup, orphans };
}

async function loadReleaseCandidates(P, opts = {}) {
  const { baseGuides, dup } = buildBaseGuides(P, { set: opts.set });
  const explicitSheets = Array.isArray(opts.sheets) ? opts.sheets.map((s) => path.resolve(s)) : [];
  const allLocked = Boolean(opts.allLocked);

  let picksByCode = {};
  let usedSheets = [];
  let usedStateFile = null;

  if (allLocked) {
    for (const g of baseGuides) {
      if (g.lockedFile) {
        picksByCode[g.code] = {
          call: "OK to send",
          comment: "",
          lockedFile: g.lockedFile,
          sourceLabel: "--all-locked",
        };
      }
    }
  } else if (explicitSheets.length) {
    for (const s of explicitSheets) {
      if (!fs.existsSync(s)) throw new Error("STOP: OK List not found: " + s);
      const parsed = await readOkListPicks(s, { skipBusyCheck: opts.skipBusyCheck });
      usedSheets.push(parsed.file);
      for (const [code, rec] of Object.entries(parsed.picksByCode)) {
        if (rec.call) {
          picksByCode[code] = {
            call: rec.call,
            comment: rec.comment,
            lockedFile: rec.lockedFile,
            sourceLabel: parsed.file,
          };
        }
      }
    }
  } else {
    const sheets = listOkLists(P);
    const stateExists = fs.existsSync(reviewStatePath(P));
    if (!sheets.length && !stateExists) {
      throw new Error(
        "STOP: no OK List or saved review state in " +
          P.reviewDir +
          " (record picks in the Browser Review UI or run build_ok_list.js first)."
      );
    }
    let sheetPrior = null;
    if (sheets.length) {
      const latest = sheets[sheets.length - 1];
      sheetPrior = await readOkListPicks(latest.path, { skipBusyCheck: opts.skipBusyCheck });
      usedSheets.push(sheetPrior.file);
    }
    const statePrior = stateExists ? { sourceLabel: "Browser Review", ...readReviewState(P) } : null;
    if (stateExists) usedStateFile = REVIEW_STATE_FILE;
    const rec = reconcilePriorPicks(sheetPrior, statePrior, baseGuides);
    picksByCode = rec.priorByCode;
  }

  const seen = new Set();
  const candidates = baseGuides.map((g) => {
    seen.add(g.code);
    const p = picksByCode[g.code];
    if (!p) return g;
    return {
      ...g,
      call: p.call || "",
      comment: p.comment || "",
      pickLockedFile: p.lockedFile !== undefined ? p.lockedFile : undefined,
      pickSource: p.sourceLabel || p.sheet || "",
    };
  });

  // Catch any pick on a guide code that is not present in live builds or locks.json.
  for (const [code, p] of Object.entries(picksByCode)) {
    if (!seen.has(code) && p && p.call) {
      candidates.push({
        code,
        set: code.slice(0, -3),
        prefix: "",
        sendFolder: "",
        nn: code.slice(-2),
        title: "",
        lockStatus: "unlocked",
        lockReason: "not locked",
        locked: false,
        lockedFile: "",
        call: p.call,
        comment: p.comment || "",
        pickLockedFile: p.lockedFile || "",
        pickSource: p.sourceLabel || p.sheet || "",
      });
    }
  }

  return { candidates, sheets: usedSheets, stateFile: usedStateFile, dup };
}

module.exports = {
  CALLS,
  REVIEW_STATE_FILE,
  SHEET_RE,
  MANIFEST_RE,
  isOkCall,
  isFixCall,
  evaluateLockStatus,
  canPick,
  setPick,
  setComment,
  summarize,
  cleanSendStem,
  computeSendPlan,
  reconcilePriorPicks,
  applyCarryForward,
  parseStampTag,
  compareStampTags,
  uniqueStampedPath,
  uniqueRotationStamp,
  reviewStatePath,
  readReviewState,
  writeReviewState,
  cellText,
  isSheetOpenInExcel,
  listOkLists,
  readOkListPicks,
  resolveVerifiedRenderPdf,
  resolveIncludePdf,
  loadProjectReviewState,
  loadReleaseCandidates,
  recordGuideDecision,
};
