// make_send_copies.js: copies the guides the reviewer marked "OK to send" into a local send folder with clean names,
// for a person to move to the shared or client location by hand. Never edits a guide, a sheet, or locks.json, and never
// writes anywhere outside the project's send folder.
// A guide is copied only when:
//   - Your call starts with "OK to send" and the guide is in locks.json
//   - the pick's Locked file is the current lock (a pick made on an older build is refused)
//   - the locked file is still the live build and its SHA-256 still equals the lock
//   - the guide is not in <review dir>/send_hold.json  ({ "<code>": { "reason": "..." } })
//   - the send name is clean (no unsafe characters) and does not collide with another copy
//   - when --with-pdf (or review.withPdf: true) is active, the matching verified locked Render PDF exists
// Send name: "<prefix> NN - <Title> - DRAFT 20261116-0930.docx" becomes "<prefix> - <Title>.docx" (no number, status, or
// stamp, since a set may not have a guide for every number). Set "review.sendKeepNumber": true in qrg.config.json to keep NN.
// By default, Word (.docx) Send Copies are staged (ADR-0004). Pass --with-pdf (or set "review.withPdf": true) to stage
// matching clean-named PDF copies alongside each approved .docx and record both SHA-256 hashes in the send manifest.
// Folder: <project>/<review.sendDir, default _send>/<set sendFolder, default set id>/. Each copy is hashed after writing.
// An existing copy with the same hash is left as is. An earlier copy this script made (its hash is in a send manifest), for
// example the version sent before a fix, is moved to <folder>/_replaced/ with a stamp, never deleted. Any other file with
// the same name stops the run.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/make_send_copies.js ["<OK List.xlsx>" ...] [--dry] [--list] [--with-pdf | --no-pdf]
//       no sheet given: reconciles the newest OK List (if any) and review/review_state.json (if any).
//       several explicit sheets: oldest first; the last pick per guide wins.
//   node qrg_kit/scripts/make_send_copies.js --dry --all-locked [--with-pdf]  check send names of every lock
"use strict";

const fs = require("fs");
const path = require("path");
const { loadConfig, flag, stamp } = require("../lib/config");
const { readJson, writeJsonSafe, sha256 } = require("../lib/inventory");
const {
  MANIFEST_RE,
  computeSendPlan,
  loadReleaseCandidates,
  resolveIncludePdf,
  uniqueStampedPath,
  uniqueRotationStamp,
} = require("../lib/review_state");

function collectPriorHashes(sendDir) {
  const ours = new Set();
  if (!fs.existsSync(sendDir)) return ours;
  for (const m of fs.readdirSync(sendDir).filter((x) => MANIFEST_RE.test(x))) {
    const data = readJson(path.join(sendDir, m), {});
    for (const c of data.copy || []) {
      if (c.sha256) ours.add(c.sha256);
      if (c.pdfSha256) ours.add(c.pdfSha256);
    }
  }
  return ours;
}

async function makeSendCopies(P, opts = {}) {
  const dry = Boolean(opts.dry);
  const allLocked = Boolean(opts.allLocked);
  if (allLocked && !dry) {
    throw new Error("STOP: --all-locked is a dry check only. Copies need the reviewer's OK to send.");
  }

  const includePdf = resolveIncludePdf(P, opts);
  const SEND = P.abs((P.cfg.review && P.cfg.review.sendDir) || "_send");

  const { candidates, sheets, stateFile, dup } = await loadReleaseCandidates(P, {
    sheets: opts.sheets,
    allLocked,
    set: opts.set,
    skipBusyCheck: opts.skipBusyCheck,
  });
  if (dup.length) {
    throw new Error("STOP: more than one live build of a guide:\n  " + dup.join("\n  "));
  }

  const plan = computeSendPlan(candidates, includePdf, {
    sendKeepNumber: Boolean(P.cfg.review && P.cfg.review.sendKeepNumber),
    requirePdf: true,
  });

  const copyEntries = plan.copy.map((c) => {
    const entry = {
      code: c.code,
      folder: c.folder,
      src: c.src,
      name: c.name,
      sha256: c.sha256,
      note: c.noteForLater || "",
    };
    if (includePdf) {
      entry.pdfSrc = c.pdfSrc;
      entry.pdfName = c.pdfName;
      entry.pdfSha256 = sha256(c.pdfSrc);
    }
    return entry;
  });

  const out = {
    sheets,
    stateFile,
    includePdf,
    copy: copyEntries,
    refused: [...plan.refused],
    fix: [...plan.fix],
    held: [...plan.held],
    notPicked: plan.notPicked,
    replaced: [],
  };

  let made = 0;
  let same = 0;
  let pdfMade = 0;
  let pdfSame = 0;
  let manifestPath = null;
  const baseStamp = stamp(opts.now || new Date());

  if (!dry && out.copy.length) {
    const ours = collectPriorHashes(SEND);

    // Pre-flight check before mutating any file so a foreign target never leaves a partial pair.
    for (const c of out.copy) {
      const dir = path.join(SEND, c.folder);
      const docxDst = path.join(dir, c.name);
      if (fs.existsSync(docxDst)) {
        const h = sha256(docxDst);
        if (h !== c.sha256 && !ours.has(h)) {
          throw new Error(
            "STOP: a file this script did not make already has the send name " +
              docxDst +
              ". Move it aside, then rerun."
          );
        }
      }
      if (includePdf) {
        const pdfDst = path.join(dir, c.pdfName);
        if (fs.existsSync(pdfDst)) {
          const ph = sha256(pdfDst);
          if (ph !== c.pdfSha256 && !ours.has(ph)) {
            throw new Error(
              "STOP: a file this script did not make already has the send name " +
                pdfDst +
                ". Move it aside, then rerun."
            );
          }
        }
      }
    }

    for (const c of out.copy) {
      const dir = path.join(SEND, c.folder);
      const replacedDir = path.join(dir, "_replaced");
      const stem = c.name.replace(/[.]docx$/, "");
      const docxDst = path.join(dir, c.name);
      const pdfDst = includePdf ? path.join(dir, c.pdfName) : null;
      fs.mkdirSync(dir, { recursive: true });

      const docxHashExisting = fs.existsSync(docxDst) ? sha256(docxDst) : null;
      const docxNeedsReplace = docxHashExisting !== null && docxHashExisting !== c.sha256;
      const pdfHashExisting = pdfDst && fs.existsSync(pdfDst) ? sha256(pdfDst) : null;
      const pdfNeedsReplace = pdfHashExisting !== null && pdfHashExisting !== c.pdfSha256;

      let rotTag = null;
      if (docxNeedsReplace || pdfNeedsReplace) {
        rotTag = uniqueRotationStamp(
          replacedDir,
          stem,
          baseStamp,
          includePdf ? [".docx", ".pdf"] : [".docx"]
        );
        fs.mkdirSync(replacedDir, { recursive: true });
      }

      if (docxHashExisting === c.sha256) {
        same++;
      } else {
        if (docxNeedsReplace) {
          const oldDocx = path.join(replacedDir, stem + " - replaced " + rotTag + ".docx");
          fs.renameSync(docxDst, oldDocx);
          out.replaced.push(
            c.code +
              ": the earlier Word copy (" +
              docxHashExisting.slice(0, 8) +
              ") moved to " +
              path.relative(SEND, oldDocx)
          );
        }
        fs.copyFileSync(c.src, docxDst);
        if (sha256(docxDst) !== c.sha256) {
          throw new Error("STOP: copy hash mismatch " + docxDst);
        }
        made++;
      }

      if (includePdf) {
        if (pdfHashExisting === c.pdfSha256) {
          pdfSame++;
        } else {
          if (pdfNeedsReplace) {
            const oldPdf = path.join(replacedDir, stem + " - replaced " + rotTag + ".pdf");
            fs.renameSync(pdfDst, oldPdf);
            out.replaced.push(
              c.code +
                ": the earlier PDF copy (" +
                pdfHashExisting.slice(0, 8) +
                ") moved to " +
                path.relative(SEND, oldPdf)
            );
          }
          fs.copyFileSync(c.pdfSrc, pdfDst);
          if (sha256(pdfDst) !== c.pdfSha256) {
            throw new Error("STOP: copy hash mismatch " + pdfDst);
          }
          pdfMade++;
        }
      }
    }

    const pickedManifest = uniqueStampedPath(SEND, "send_manifest_", baseStamp, ".json");
    manifestPath = pickedManifest.path;
    writeJsonSafe(manifestPath, out);
  }

  return {
    dry,
    includePdf,
    sendDir: SEND,
    manifestPath,
    made,
    same,
    pdfMade,
    pdfSame,
    out,
    plan,
  };
}

module.exports = { makeSendCopies };

if (require.main === module) {
  const P = loadConfig();
  const DRY = flag("dry");
  const ALL = flag("all-locked");
  const LIST = flag("list");
  const WITH_PDF = flag("with-pdf");
  const NO_PDF = flag("no-pdf");
  if (WITH_PDF && NO_PDF) {
    console.error("STOP: cannot pass both --with-pdf and --no-pdf.");
    process.exit(2);
  }
  const SHEETS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const includePdfOpt = WITH_PDF ? true : NO_PDF ? false : undefined;

  makeSendCopies(P, {
    sheets: SHEETS,
    dry: DRY,
    allLocked: ALL,
    includePdf: includePdfOpt,
  })
    .then((res) => {
      const { out, dry, includePdf, made, same, pdfMade, pdfSame, manifestPath, sendDir } = res;
      if (out.sheets.length) console.log("sheet(s): " + out.sheets.join(", "));
      if (out.stateFile) console.log("review state: " + out.stateFile);
      console.log(
        (dry ? "[dry] " : "") +
          "OK to send: " +
          out.copy.length +
          (dry
            ? ""
            : " (Word copied " +
              made +
              ", already there " +
              same +
              (includePdf ? "; PDF copied " + pdfMade + ", already there " + pdfSame : "") +
              ")") +
          "; Fix before sending: " +
          out.fix.length +
          "; refused: " +
          out.refused.length +
          "; held: " +
          out.held.length +
          "; locked, not picked: " +
          out.notPicked
      );
      out.refused.forEach((r) => console.log("  REFUSED " + r));
      (out.replaced || []).forEach((r) =>
        console.log("  REPLACED " + r + ". If the old version was already sent, send this one too.")
      );
      out.fix.forEach((r) => console.log("  FIX " + r));
      out.held.forEach((r) => console.log("  HELD " + r));
      out.copy
        .filter((c) => c.note)
        .forEach((c) => console.log("  NOTE FOR LATER " + c.code + ": " + c.note.slice(0, 160)));
      if (LIST || dry) {
        out.copy.forEach((c) => {
          console.log("  " + c.folder + "/" + c.name);
          if (includePdf && c.pdfName) console.log("  " + c.folder + "/" + c.pdfName);
        });
      }
      if (!dry && manifestPath) console.log("manifest: " + manifestPath);
      if (!dry) {
        console.log(
          "Send folder: " +
            sendDir +
            "\nThese are local copies. Move them to the shared location by hand."
        );
      }
    })
    .catch((e) => {
      const msg = e && e.message ? String(e.message) : String(e);
      console.error(msg.startsWith("STOP") ? msg : "ERROR " + (e.stack || e));
      process.exit(msg.startsWith("STOP") ? 2 : 1);
    });
}
