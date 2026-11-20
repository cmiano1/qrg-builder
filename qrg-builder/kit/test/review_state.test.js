"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const KIT = path.resolve(__dirname, "..");

function runNode(scriptRel, args = [], opts = {}) {
  const scriptPath = path.isAbsolute(scriptRel) ? scriptRel : path.join(KIT, scriptRel);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

function makeTempDir(prefix = "qrg-review-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function createFixtureProject(opts = {}) {
  const dir = makeTempDir();
  const cfg = {
    project: opts.project || "Review Pilot",
    author: "Change Management",
    status: "DRAFT",
    page: "letter",
    font: "Calibri",
    palette: { accent: "1F5C99", heading: "1F3864", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
    sets: [
      {
        id: "UNIT1-CW",
        label: "Unit 1 Case Worker",
        prefix: "Unit 1 Case Worker",
        unitLine: "Unit 1 | Case Worker",
        footerTag: "Unit 1 Case Worker",
        dir: "sets/UNIT1-CW",
        out: "QRGs/Unit 1 Case Worker",
        assetKey: "UNIT1CW",
        sendFolder: "Unit 1 Case Worker",
      },
    ],
    review: {
      dir: "review",
      sendDir: "_send",
      sendKeepNumber: Boolean(opts.sendKeepNumber),
      ...(opts.withPdf !== undefined ? { withPdf: opts.withPdf } : {}),
    },
  };
  const cfgPath = path.join(dir, "qrg.config.json");
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  fs.mkdirSync(path.join(dir, "sets", "UNIT1-CW", "guides"), { recursive: true });
  fs.mkdirSync(path.join(dir, "QRGs", "Unit 1 Case Worker"), { recursive: true });
  fs.mkdirSync(path.join(dir, "review"), { recursive: true });
  return { dir, cfgPath };
}

function addGuideArtifact(projectDir, spec) {
  const setId = spec.set || "UNIT1-CW";
  const prefix = spec.prefix || "Unit 1 Case Worker";
  const outLabel = spec.outLabel || "Unit 1 Case Worker";
  const nn = spec.nn;
  const title = spec.title;
  const stamp = spec.stamp || "20261119-1000";
  const code = setId + " " + nn;
  const fileName = prefix + " " + nn + " - " + title + " - DRAFT " + stamp + ".docx";
  const guideSourcePath = path.join(projectDir, "sets", setId, "guides", nn + ".js");
  fs.mkdirSync(path.dirname(guideSourcePath), { recursive: true });
  fs.writeFileSync(guideSourcePath, "// guide source " + code + "\n");

  const outDir = path.join(projectDir, "QRGs", outLabel);
  fs.mkdirSync(outDir, { recursive: true });
  const docxPath = path.join(outDir, fileName);
  const docxBytes = Buffer.from(spec.docxContent || ("DOCX:" + code + ":" + stamp));
  fs.writeFileSync(docxPath, docxBytes);
  const docxSha = sha256Buf(docxBytes);

  let pdfPath = "";
  let pdfSha = "";
  let rDir = "";
  if (spec.render !== false) {
    rDir = path.join(projectDir, "review", "render", setId + "_" + nn + "_" + stamp);
    fs.mkdirSync(rDir, { recursive: true });
    const pdfName = setId + "_" + nn + ".pdf";
    pdfPath = path.join(rDir, pdfName);
    const pdfBytes = Buffer.from(spec.pdfContent || ("%PDF-1.4\n" + code + ":" + stamp + "\n"));
    if (spec.writePdf !== false) {
      fs.writeFileSync(pdfPath, pdfBytes);
      pdfSha = sha256Buf(pdfBytes);
    }
    const pages = spec.pages || 2;
    for (let p = 1; p <= pages; p++) {
      fs.writeFileSync(path.join(rDir, setId + "_" + nn + "_p" + String(p).padStart(2, "0") + ".png"), "PNG" + p);
    }
    fs.writeFileSync(
      path.join(rDir, "render.json"),
      JSON.stringify(
        {
          code,
          file: fileName,
          sha256: spec.renderSha256 || docxSha,
          pdfName,
          pages,
          scale: 110,
          renderedAt: "2026-11-19T10:01:00.000Z",
        },
        null,
        2
      )
    );
  }

  if (spec.lock !== false) {
    const locksPath = path.join(projectDir, "review", "locks.json");
    const locks = fs.existsSync(locksPath) ? JSON.parse(fs.readFileSync(locksPath, "utf8")) : {};
    locks[code] = {
      code,
      set: setId,
      file: spec.lockFile || fileName,
      sha256: spec.lockSha256 || docxSha,
      pdf: spec.lockPdf !== undefined ? spec.lockPdf : pdfPath,
      renderDir: rDir,
      pages: spec.pages || 2,
      lockedAt: spec.lockedAt || stamp,
      how: spec.how || "First build, QA clean, pages inspected",
      status: "Done, waiting for OK",
    };
    fs.writeFileSync(locksPath, JSON.stringify(locks, null, 2));
  }

  return { code, fileName, docxPath, docxSha, pdfPath, pdfSha, renderDir: rDir };
}

test("pure review-state contract enforces Review Lock, pick toggle, verbatim comments, summary counts, and send planning", () => {
  const rs = require(path.join(KIT, "lib", "review_state.js"));

  assert.deepEqual(rs.CALLS, [
    "OK to send",
    "OK to send, note for later",
    "Fix before sending",
  ]);

  // Review Lock status evaluation: locked vs broken (hash mismatch / file mismatch / missing) vs unlocked
  const liveA = {
    code: "UNIT1-CW 01",
    set: "UNIT1-CW",
    nn: "01",
    file: "Unit 1 Case Worker 01 - Log a Call - DRAFT 20261119-1000.docx",
    sha256: "a".repeat(64),
  };
  const lockA = {
    code: "UNIT1-CW 01",
    set: "UNIT1-CW",
    file: liveA.file,
    sha256: "a".repeat(64),
  };
  assert.equal(rs.evaluateLockStatus(liveA, lockA).lockStatus, "locked");
  assert.equal(rs.evaluateLockStatus(liveA, lockA).statusText, "Done, waiting for OK");

  const tampered = rs.evaluateLockStatus({ ...liveA, sha256: "b".repeat(64) }, lockA);
  assert.equal(tampered.lockStatus, "broken");
  assert.match(tampered.statusText, /^Lock broken:/);

  const rebuiltUnlocked = rs.evaluateLockStatus(
    { ...liveA, file: "Unit 1 Case Worker 01 - Log a Call - DRAFT 20261119-1015.docx" },
    lockA
  );
  assert.equal(rebuiltUnlocked.lockStatus, "broken");

  const missingLive = rs.evaluateLockStatus(null, lockA);
  assert.equal(missingLive.lockStatus, "broken");
  assert.equal(missingLive.statusText, "Lock broken: no live build");

  const unlocked = rs.evaluateLockStatus(liveA, null);
  assert.equal(unlocked.lockStatus, "unlocked");
  assert.equal(unlocked.statusText, "Not locked");

  // Initial state with locked, broken, unlocked, fix, held, and note-for-later guides
  const initialState = {
    guides: [
      {
        code: "UNIT1-CW 01",
        set: "UNIT1-CW",
        prefix: "Unit 1 Case Worker",
        sendFolder: "UNIT1-CW",
        nn: "01",
        title: "Log a Call on a Case",
        lockStatus: "locked",
        lockedFile: "Unit 1 Case Worker 01 - Log a Call on a Case - DRAFT 20261119-1000.docx",
        call: "",
        comment: "",
        onHold: "",
      },
      {
        code: "UNIT1-CW 02",
        set: "UNIT1-CW",
        prefix: "Unit 1 Case Worker",
        sendFolder: "UNIT1-CW",
        nn: "02",
        title: "Upload a Signed Document",
        lockStatus: "locked",
        lockedFile: "Unit 1 Case Worker 02 - Upload a Signed Document - DRAFT 20261119-1000.docx",
        call: "OK to send, note for later",
        comment: "Add file size note next cycle",
        onHold: "",
      },
      {
        code: "UNIT1-SUP 01",
        set: "UNIT1-SUP",
        prefix: "Unit 1 Supervisor",
        sendFolder: "UNIT1-SUP",
        nn: "01",
        title: "Approve a Case Closure",
        lockStatus: "locked",
        lockedFile: "Unit 1 Supervisor 01 - Approve a Case Closure - DRAFT 20261119-1000.docx",
        call: "Fix before sending",
        comment: "Rename Submit to Confirm",
        onHold: "",
      },
      {
        code: "UNIT1-SUP 02",
        set: "UNIT1-SUP",
        prefix: "Unit 1 Supervisor",
        sendFolder: "UNIT1-SUP",
        nn: "02",
        title: "Reassign an Open Case",
        lockStatus: "unlocked",
        lockedFile: "",
        call: "",
        comment: "",
        onHold: "",
      },
      {
        code: "UNIT1-SUP 03",
        set: "UNIT1-SUP",
        prefix: "Unit 1 Supervisor",
        sendFolder: "UNIT1-SUP",
        nn: "03",
        title: "Audit Closed Cases",
        lockStatus: "broken",
        lockedFile: "Unit 1 Supervisor 03 - Audit Closed Cases - DRAFT 20261119-1000.docx",
        call: "",
        comment: "",
        onHold: "",
      },
      {
        code: "UNIT1-CW 03",
        set: "UNIT1-CW",
        prefix: "Unit 1 Case Worker",
        sendFolder: "UNIT1-CW",
        nn: "03",
        title: "Close a Referral",
        lockStatus: "locked",
        lockedFile: "Unit 1 Case Worker 03 - Close a Referral - DRAFT 20261119-1000.docx",
        call: "OK to send",
        comment: "",
        onHold: "Waiting on policy sign-off",
      },
    ],
  };

  // canPick: ONLY locked guides
  assert.equal(rs.canPick(initialState.guides[0]), true);
  assert.equal(rs.canPick(initialState.guides[3]), false);
  assert.equal(rs.canPick(initialState.guides[4]), false);
  assert.equal(rs.canPick(null), false);

  // setPick is a no-op on unlocked and broken guides
  assert.equal(rs.setPick(initialState, "UNIT1-SUP 02", "OK to send"), initialState);
  assert.equal(rs.setPick(initialState, "UNIT1-SUP 03", "OK to send"), initialState);
  assert.equal(rs.setPick(initialState, "MISSING 99", "OK to send"), initialState);

  // setPick marks a locked guide, does not mutate prior state, and toggles off when clicked again
  const dashChars = String.fromCharCode(0x2013, 0x2014);
  const s1 = rs.setPick(initialState, "UNIT1-CW 01", "OK to send");
  assert.notEqual(s1, initialState);
  assert.equal(initialState.guides[0].call, "");
  assert.equal(s1.guides[0].call, "OK to send");
  assert.doesNotMatch(s1.lastEvent || "", new RegExp("\\.json|picks\\.json|[" + dashChars + "]", "i"));

  const s2 = rs.setPick(s1, "UNIT1-CW 01", "OK to send");
  assert.equal(s2.guides[0].call, "");

  // setComment persists verbatim (including leading/trailing whitespace and newlines)
  const verbatim = "  Line 1\nLine 2  ";
  const s3 = rs.setComment(s1, "UNIT1-CW 01", verbatim);
  assert.equal(s3.guides[0].comment, verbatim);
  assert.equal(s1.guides[0].comment, "");

  // summarize counts only locked guides for ok / fix / remaining
  assert.deepEqual(rs.summarize(initialState.guides), {
    total: 6,
    locked: 4,
    ok: 2,
    fix: 1,
    remaining: 1,
  });
  assert.deepEqual(rs.summarize(s1.guides), {
    total: 6,
    locked: 4,
    ok: 3,
    fix: 1,
    remaining: 0,
  });

  // computeSendPlan: Word (.docx) only by default
  const planDocx = rs.computeSendPlan(s1.guides, false);
  assert.equal(planDocx.copy.length, 2);
  assert.deepEqual(
    planDocx.copy.map((c) => ({ code: c.code, files: c.files, noteForLater: c.noteForLater })),
    [
      {
        code: "UNIT1-CW 01",
        files: ["UNIT1-CW/Unit 1 Case Worker - Log a Call on a Case.docx"],
        noteForLater: "",
      },
      {
        code: "UNIT1-CW 02",
        files: ["UNIT1-CW/Unit 1 Case Worker - Upload a Signed Document.docx"],
        noteForLater: "Add file size note next cycle",
      },
    ]
  );
  assert.equal(planDocx.skipped.length, 4);
  const skipByCode = Object.fromEntries(planDocx.skipped.map((x) => [x.code, x]));
  assert.equal(skipByCode["UNIT1-SUP 01"].category, "fix");
  assert.equal(skipByCode["UNIT1-SUP 02"].category, "unlocked");
  assert.equal(skipByCode["UNIT1-SUP 03"].category, "broken");
  assert.equal(skipByCode["UNIT1-CW 03"].category, "held");
  for (const s of planDocx.skipped) {
    assert.doesNotMatch(s.reason, new RegExp("[" + dashChars + "]"), "reasons must not contain em/en dashes");
  }

  // computeSendPlan: paired .docx + .pdf when includePdf = true, and keeps NN when sendKeepNumber = true
  const planWithPdf = rs.computeSendPlan(s1.guides, true, { sendKeepNumber: true });
  assert.equal(planWithPdf.copy.length, 2);
  assert.deepEqual(planWithPdf.copy[0].files, [
    "UNIT1-CW/Unit 1 Case Worker 01 - Log a Call on a Case.docx",
    "UNIT1-CW/Unit 1 Case Worker 01 - Log a Call on a Case.pdf",
  ]);

  // computeSendPlan refuses missing/stale PDF when includePdf = true and PDF is required or marked missing
  const missingPdfGuides = [
    { ...s1.guides[0], pdf: "", pdfExists: false },
  ];
  const planMissingPdf = rs.computeSendPlan(missingPdfGuides, true);
  assert.equal(planMissingPdf.copy.length, 0);
  assert.equal(planMissingPdf.refused.length, 1);
  assert.match(planMissingPdf.refused[0], /PDF/i);

  // computeSendPlan refuses name collisions and unsafe characters
  const collidingGuides = [
    { ...s1.guides[0], title: "Same Title" },
    { ...s1.guides[1], title: "Same Title" },
    { ...s1.guides[0], code: "UNIT1-CW 09", title: "Bad:Title" },
  ];
  const planCollide = rs.computeSendPlan(collidingGuides, false);
  assert.equal(planCollide.copy.length, 1);
  assert.equal(planCollide.refused.length, 2);
  assert.match(planCollide.refused[0], /collides/i);
  assert.match(planCollide.refused[1], /not clean/i);
});

test("applyCarryForward preserves unchanged locked picks, resets rebuilt guides with earlierCall, and retains earlier calls across intermediate rounds", () => {
  const rs = require(path.join(KIT, "lib", "review_state.js"));

  const currentGuides = [
    {
      code: "UNIT1-CW 01",
      lockStatus: "locked",
      lockedFile: "Unit 1 CW 01 - Log a Call - DRAFT 20261119-1000.docx",
      lockedSha256: "1".repeat(64),
      check: "Verify step 2",
      call: "",
      comment: "",
    },
    {
      code: "UNIT1-CW 02",
      lockStatus: "locked",
      lockedFile: "Unit 1 CW 02 - Upload Form - DRAFT 20261119-1030.docx",
      lockedSha256: "2".repeat(64),
      check: "Confirm renamed button",
      call: "",
      comment: "",
    },
    {
      code: "UNIT1-CW 03",
      lockStatus: "broken",
      lockedFile: "Unit 1 CW 03 - Close Case - DRAFT 20261119-1000.docx",
      lockedSha256: "3".repeat(64),
      check: "",
      call: "",
      comment: "",
    },
    {
      code: "UNIT1-CW 04",
      lockStatus: "locked",
      lockedFile: "Unit 1 CW 04 - Reassign - DRAFT 20261119-1040.docx",
      lockedSha256: "4".repeat(64),
      check: "Check new screenshot",
      call: "",
      comment: "",
    },
  ];

  const priorByCode = {
    "UNIT1-CW 01": {
      call: "OK to send, note for later",
      comment: "Consider splitting step 5 later",
      lockedFile: "Unit 1 CW 01 - Log a Call - DRAFT 20261119-1000.docx",
      lockedSha256: "1".repeat(64),
      earlier: [],
      sourceLabel: "QRG OK List - DRAFT 20261119-1005.xlsx",
    },
    "UNIT1-CW 02": {
      call: "Fix before sending",
      comment: "Step 3 still says Submit.",
      lockedFile: "Unit 1 CW 02 - Upload Form - DRAFT 20261119-1000.docx",
      lockedSha256: "9".repeat(64),
      earlier: [],
      sourceLabel: "QRG OK List - DRAFT 20261119-1005.xlsx",
    },
    "UNIT1-CW 03": {
      call: "OK to send",
      comment: "",
      lockedFile: "Unit 1 CW 03 - Close Case - DRAFT 20261119-1000.docx",
      lockedSha256: "3".repeat(64),
      earlier: [],
      sourceLabel: "QRG OK List - DRAFT 20261119-1005.xlsx",
    },
    "UNIT1-CW 04": {
      call: "",
      comment: "",
      lockedFile: "Unit 1 CW 04 - Reassign - DRAFT 20261119-1010.docx",
      earlier: [
        "Your earlier call (QRG OK List - DRAFT 20261119-1005.xlsx, on Unit 1 CW 04 - Reassign - DRAFT 20261119-1000.docx): Fix before sending; your comment: Missing screenshot. Not carried: this row is not locked now.",
      ],
      sourceLabel: "QRG OK List - DRAFT 20261119-1015.xlsx",
    },
    "UNIT1-CW 99": {
      call: "OK to send",
      comment: "Removed guide",
      lockedFile: "Unit 1 CW 99 - Old - DRAFT 20261119-1000.docx",
      earlier: [],
      sourceLabel: "QRG OK List - DRAFT 20261119-1005.xlsx",
    },
  };

  const { guides, report } = rs.applyCarryForward(currentGuides, priorByCode, {
    from: "QRG OK List - DRAFT 20261119-1005.xlsx",
  });

  const byCode = Object.fromEntries(guides.map((g) => [g.code, g]));

  // 01: unchanged locked guide carries forward pick and comment
  assert.equal(byCode["UNIT1-CW 01"].call, "OK to send, note for later");
  assert.equal(byCode["UNIT1-CW 01"].comment, "Consider splitting step 5 later");
  assert.equal(byCode["UNIT1-CW 01"].changed, false);
  assert.equal(byCode["UNIT1-CW 01"].earlierCall, "");

  // 02: rebuilt guide resets blank, marks changed, records earlierCall without trailing double period
  assert.equal(byCode["UNIT1-CW 02"].call, "");
  assert.equal(byCode["UNIT1-CW 02"].comment, "");
  assert.equal(byCode["UNIT1-CW 02"].changed, true);
  assert.match(byCode["UNIT1-CW 02"].earlierCall, /^Your earlier call \(/);
  assert.match(byCode["UNIT1-CW 02"].earlierCall, /Fix before sending/);
  assert.match(byCode["UNIT1-CW 02"].earlierCall, /Step 3 still says Submit\. Not carried: the guide was rebuilt/);
  assert.match(byCode["UNIT1-CW 02"].checkWithEarlier, /Confirm renamed button/);

  // 03: broken lock resets blank and explains row is not locked now
  assert.equal(byCode["UNIT1-CW 03"].call, "");
  assert.equal(byCode["UNIT1-CW 03"].changed, false);
  assert.match(byCode["UNIT1-CW 03"].earlierCall, /Not carried: this row is not locked now\./);

  // 04: intermediate earlierCall is preserved and refreshed now that guide is locked
  assert.equal(byCode["UNIT1-CW 04"].call, "");
  assert.equal(byCode["UNIT1-CW 04"].changed, true);
  assert.match(byCode["UNIT1-CW 04"].earlierCall, /Missing screenshot\. Not carried: the guide was rebuilt/);

  assert.equal(report.picks, 1);
  assert.equal(report.comments, 1);
  assert.deepEqual(report.notCarried, ["UNIT1-CW 02", "UNIT1-CW 03"]);
  assert.equal(report.changed, 2);
  assert.equal(report.earlierKept, 1);
  assert.deepEqual(report.unmatched, ["UNIT1-CW 99"]);
});

test("reconcilePriorPicks merges .xlsx OK List and local review state cleanly across all dual-surface edits", () => {
  const rs = require(path.join(KIT, "lib", "review_state.js"));

  const currentGuides = [
    { code: "G 01", lockStatus: "locked", lockedFile: "G 01 - A - DRAFT 20261119-1000.docx", lockedSha256: "a".repeat(64) },
    { code: "G 02", lockStatus: "locked", lockedFile: "G 02 - B - DRAFT 20261119-1000.docx", lockedSha256: "b".repeat(64) },
    { code: "G 03", lockStatus: "locked", lockedFile: "G 03 - C - DRAFT 20261119-1000.docx", lockedSha256: "c".repeat(64) },
    { code: "G 04", lockStatus: "locked", lockedFile: "G 04 - D - DRAFT 20261119-1000.docx", lockedSha256: "d".repeat(64) },
    { code: "G 05", lockStatus: "locked", lockedFile: "G 05 - E - DRAFT 20261119-1030.docx", lockedSha256: "e".repeat(64) },
  ];

  // Sheet saved at t=2000
  const sheetPrior = {
    sourceLabel: "QRG OK List - DRAFT 20261119-1005.xlsx",
    mtimeMs: 2000,
    picksByCode: {
      // G 01: edited in sheet AFTER browser (t=2000 > t=1000) -> sheet wins
      "G 01": { call: "Fix before sending", comment: "From Excel", lockedFile: "G 01 - A - DRAFT 20261119-1000.docx", earlier: [] },
      // G 02: picked in sheet at t=2000, later changed in browser at t=3000 -> browser wins
      "G 02": { call: "Fix before sending", comment: "Old Excel", lockedFile: "G 02 - B - DRAFT 20261119-1000.docx", earlier: [] },
      // G 03: picked in sheet at t=2000, explicitly cleared in browser at t=3000 -> browser clear wins
      "G 03": { call: "OK to send", comment: "", lockedFile: "G 03 - C - DRAFT 20261119-1000.docx", earlier: [] },
      // G 04: blank in sheet (exported before browser pick), picked in browser at t=1500 -> browser pick preserved!
      "G 04": { call: "", comment: "", lockedFile: "G 04 - D - DRAFT 20261119-1000.docx", earlier: [] },
      // G 05: sheet has stale pick on old build, browser has pick on current rebuilt file -> browser wins!
      "G 05": { call: "Fix before sending", comment: "Old build", lockedFile: "G 05 - E - DRAFT 20261119-1000.docx", earlier: [] },
    },
  };

  const statePrior = {
    sourceLabel: "Browser Review",
    guides: {
      "G 01": { call: "OK to send", comment: "Earlier browser", lockedFile: "G 01 - A - DRAFT 20261119-1000.docx", lockedSha256: "a".repeat(64), earlier: [], updatedAtMs: 1000 },
      "G 02": { call: "OK to send", comment: "Updated browser", lockedFile: "G 02 - B - DRAFT 20261119-1000.docx", lockedSha256: "b".repeat(64), earlier: [], updatedAtMs: 3000 },
      "G 03": { call: "", comment: "", lockedFile: "G 03 - C - DRAFT 20261119-1000.docx", lockedSha256: "c".repeat(64), earlier: [], updatedAtMs: 3000 },
      "G 04": { call: "OK to send", comment: "Picked in browser", lockedFile: "G 04 - D - DRAFT 20261119-1000.docx", lockedSha256: "d".repeat(64), earlier: [], updatedAtMs: 1500 },
      "G 05": { call: "OK to send", comment: "Verified rebuild", lockedFile: "G 05 - E - DRAFT 20261119-1030.docx", lockedSha256: "e".repeat(64), earlier: [], updatedAtMs: 1800 },
    },
  };

  const { priorByCode } = rs.reconcilePriorPicks(sheetPrior, statePrior, currentGuides);
  assert.equal(priorByCode["G 01"].call, "Fix before sending");
  assert.equal(priorByCode["G 01"].comment, "From Excel");
  assert.equal(priorByCode["G 02"].call, "OK to send");
  assert.equal(priorByCode["G 02"].comment, "Updated browser");
  assert.equal(priorByCode["G 03"].call, "");
  assert.equal(priorByCode["G 04"].call, "OK to send");
  assert.equal(priorByCode["G 04"].comment, "Picked in browser");
  assert.equal(priorByCode["G 05"].call, "OK to send");
  assert.equal(priorByCode["G 05"].comment, "Verified rebuild");
});

test("review_state persists picks atomically to review_state.json, verifies live SHA-256 locks on disk, and blocks tampered or unlocked guides", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const { dir, cfgPath } = createFixtureProject();
  try {
    const g1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
    addGuideArtifact(dir, { nn: "02", title: "Upload a Signed Document", stamp: "20261119-1000", lock: false });

    const P = loadConfig(["node", "test", "--config=" + cfgPath]);

    // Initial load: 01 is locked with verified render pages, 02 is unlocked
    const st0 = await rs.loadProjectReviewState(P);
    assert.equal(st0.guides.length, 2);
    assert.equal(st0.guides[0].code, "UNIT1-CW 01");
    assert.equal(st0.guides[0].lockStatus, "locked");
    assert.equal(st0.guides[0].pdfExists, true);
    assert.deepEqual(st0.guides[0].pageFiles, ["UNIT1-CW_01_p01.png", "UNIT1-CW_01_p02.png"]);
    assert.equal(st0.guides[1].code, "UNIT1-CW 02");
    assert.equal(st0.guides[1].lockStatus, "unlocked");

    // Recording a pick on locked guide 01 succeeds and writes review/review_state.json atomically (no leftover .tmp)
    const r1 = await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send", comment: "Looks great" });
    assert.equal(r1.ok, true);
    assert.equal(r1.guide.call, "OK to send");
    assert.equal(r1.guide.comment, "Looks great");
    const stateFilePath = rs.reviewStatePath(P);
    assert.equal(path.basename(stateFilePath), "review_state.json");
    assert.equal(fs.existsSync(stateFilePath), true);
    assert.equal(fs.existsSync(stateFilePath + ".tmp"), false);

    // Reloading from disk preserves saved pick & comment
    const st1 = await rs.loadProjectReviewState(P);
    assert.equal(st1.guides[0].call, "OK to send");
    assert.equal(st1.guides[0].comment, "Looks great");

    // Recording a pick on unlocked guide 02 is refused with 409
    const rUnlocked = await rs.recordGuideDecision(P, "UNIT1-CW 02", { call: "OK to send" });
    assert.equal(rUnlocked.ok, false);
    assert.equal(rUnlocked.statusCode, 409);

    // Hand-editing locked guide 01 breaks its SHA-256 lock immediately on reload and blocks new picks
    fs.writeFileSync(g1.docxPath, Buffer.from("HAND-EDITED AFTER LOCK"));
    const stTampered = await rs.loadProjectReviewState(P);
    assert.equal(stTampered.guides[0].lockStatus, "broken");
    assert.equal(stTampered.guides[0].call, "", "broken lock must not retain active OK call");
    assert.match(stTampered.guides[0].earlierCall, /Not carried: this row is not locked now\./);

    const rBroken = await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send" });
    assert.equal(rBroken.ok, false);
    assert.equal(rBroken.statusCode, 409);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("build_ok_list reconciles review_state.json and .xlsx picks, handles rebuild carry-forward, and avoids same-minute collisions", async () => {
  const ExcelJS = require("exceljs");
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const { buildOkList } = require(path.join(KIT, "scripts", "build_ok_list.js"));
  assert.equal(typeof buildOkList, "function", "build_ok_list.js must export programmatic buildOkList()");

  const { dir, cfgPath } = createFixtureProject();
  try {
    addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
    const g2v1 = addGuideArtifact(dir, { nn: "02", title: "Upload a Signed Document", stamp: "20261119-1000" });

    const P = loadConfig(["node", "test", "--config=" + cfgPath]);

    // Pick Guide 01 in local review state (Browser Review surface)
    const rec = await rs.recordGuideDecision(P, "UNIT1-CW 01", {
      call: "OK to send",
      comment: "Approved in browser",
    });
    assert.equal(rec.ok, true);

    // Export first .xlsx OK List programmatically: picks from review_state.json appear in the sheet
    const res1 = await buildOkList(P);
    assert.equal(fs.existsSync(res1.out), true);
    assert.equal(fs.existsSync(res1.carryPath), true);

    const picks1 = await rs.readOkListPicks(res1.out);
    assert.equal(picks1.picksByCode["UNIT1-CW 01"].call, "OK to send");
    assert.equal(picks1.picksByCode["UNIT1-CW 01"].comment, "Approved in browser");
    assert.equal(picks1.picksByCode["UNIT1-CW 02"].call, "");

    // Manager edits the .xlsx sheet in Excel to request a fix on Guide 02
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(res1.out);
    const ws = wb.getWorksheet("OK List");
    ws.eachRow((row, idx) => {
      if (idx > 1 && rs.cellText(row.getCell(2).value) === "UNIT1-CW 02") {
        row.getCell(6).value = "Fix before sending";
        row.getCell(7).value = "Update step 4 label";
      }
    });
    await wb.xlsx.writeFile(res1.out);
    const futureSec = (Date.now() + 2000) / 1000;
    fs.utimesSync(res1.out, futureSec, futureSec);

    // Shared state reconciles BOTH Guide 01 (browser) and Guide 02 (.xlsx)
    const merged = await rs.loadProjectReviewState(P);
    const byCodeMerged = Object.fromEntries(merged.guides.map((g) => [g.code, g]));
    assert.equal(byCodeMerged["UNIT1-CW 01"].call, "OK to send");
    assert.equal(byCodeMerged["UNIT1-CW 02"].call, "Fix before sending");
    assert.equal(byCodeMerged["UNIT1-CW 02"].comment, "Update step 4 label");

    // Rebuild and relock Guide 02 while leaving Guide 01 unchanged
    fs.unlinkSync(g2v1.docxPath);
    addGuideArtifact(dir, {
      nn: "02",
      title: "Upload a Signed Document",
      stamp: "20261119-1030",
      docxContent: "DOCX:UNIT1-CW 02:REBUILT",
      pdfContent: "%PDF-1.4\nUNIT1-CW 02:REBUILT\n",
      how: "Fix round 1: updated step 4 label",
    });

    // Run build_ok_list.js via CLI in the SAME minute -> disambiguates filename cleanly and carries forward!
    const cli = runNode("scripts/build_ok_list.js", ["--config=" + cfgPath], { cwd: dir });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);

    const sheets = rs.listOkLists(P);
    assert.equal(sheets.length, 2, "expected second same-minute OK List without collision failure");
    const newest = sheets[sheets.length - 1];
    assert.notEqual(newest.file, res1.file);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(newest.path);
    const ws2 = wb2.getWorksheet("OK List");
    const rowsByCode = {};
    ws2.eachRow((row, idx) => {
      if (idx > 1) {
        const code = rs.cellText(row.getCell(2).value);
        rowsByCode[code] = {
          call: rs.cellText(row.getCell(6).value),
          comment: rs.cellText(row.getCell(7).value),
          check: rs.cellText(row.getCell(12).value),
          changed: rs.cellText(row.getCell(16).value),
        };
      }
    });

    // Guide 01 unchanged -> carried forward
    assert.equal(rowsByCode["UNIT1-CW 01"].call, "OK to send");
    assert.equal(rowsByCode["UNIT1-CW 01"].comment, "Approved in browser");
    assert.equal(rowsByCode["UNIT1-CW 01"].changed, "");

    // Guide 02 rebuilt -> reset blank, Changed = Yes, earlier call + comment preserved in Check these spots
    assert.equal(rowsByCode["UNIT1-CW 02"].call, "");
    assert.equal(rowsByCode["UNIT1-CW 02"].comment, "");
    assert.equal(rowsByCode["UNIT1-CW 02"].changed, "Yes");
    assert.match(rowsByCode["UNIT1-CW 02"].check, /Your earlier call \(/);
    assert.match(rowsByCode["UNIT1-CW 02"].check, /Fix before sending/);
    assert.match(rowsByCode["UNIT1-CW 02"].check, /Update step 4 label/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("make_send_copies stages .docx-only Send Copies by default from review_state.json or .xlsx and refuses unpicked, unlocked, fix, held, and broken-lock guides", async () => {
  const ExcelJS = require("exceljs");
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const { buildOkList } = require(path.join(KIT, "scripts", "build_ok_list.js"));
  const { makeSendCopies } = require(path.join(KIT, "scripts", "make_send_copies.js"));
  assert.equal(typeof makeSendCopies, "function", "make_send_copies.js must export programmatic makeSendCopies()");

  const { dir, cfgPath } = createFixtureProject();
  try {
    const g1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
    const g2 = addGuideArtifact(dir, { nn: "02", title: "Upload a Signed Document", stamp: "20261119-1000" });
    addGuideArtifact(dir, { nn: "03", title: "Approve a Case Closure", stamp: "20261119-1000" });
    addGuideArtifact(dir, { nn: "04", title: "Reassign an Open Case", stamp: "20261119-1000" });
    addGuideArtifact(dir, { nn: "05", title: "Close a Referral", stamp: "20261119-1000" });
    const g6 = addGuideArtifact(dir, { nn: "06", title: "Audit Closed Cases", stamp: "20261119-1000" });
    addGuideArtifact(dir, { nn: "07", title: "Draft Intake Checklist", stamp: "20261119-1000", lock: false });

    // Place Guide 05 on send hold
    fs.writeFileSync(
      path.join(dir, "review", "send_hold.json"),
      JSON.stringify({ "UNIT1-CW 05": { reason: "Policy review pending" } }, null, 2)
    );

    const P = loadConfig(["node", "test", "--config=" + cfgPath]);

    // Record decisions purely in review_state.json (no .xlsx exists yet!)
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send" })).ok, true);
    assert.equal(
      (await rs.recordGuideDecision(P, "UNIT1-CW 02", { call: "OK to send, note for later", comment: "Add tip next release" })).ok,
      true
    );
    assert.equal(
      (await rs.recordGuideDecision(P, "UNIT1-CW 03", { call: "Fix before sending", comment: "Fix step 2" })).ok,
      true
    );
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 05", { call: "OK to send" })).ok, true);
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 06", { call: "OK to send" })).ok, true);

    // Tamper with Guide 06 AFTER it was locked and approved!
    fs.writeFileSync(g6.docxPath, Buffer.from("TAMPERED AFTER APPROVAL"));

    // Run make_send_copies via CLI with NO .xlsx sheet present -> consumes review_state.json directly!
    const cli1 = runNode("scripts/make_send_copies.js", ["--config=" + cfgPath], { cwd: dir });
    assert.equal(cli1.status, 0, cli1.stdout + cli1.stderr);

    const sendFolder = path.join(dir, "_send", "Unit 1 Case Worker");
    const stagedFiles = fs.readdirSync(sendFolder).sort();
    assert.deepEqual(stagedFiles, [
      "Unit 1 Case Worker - Log a Call on a Case.docx",
      "Unit 1 Case Worker - Upload a Signed Document.docx",
    ]);
    // Verify clean-named .docx hashes match source builds exactly and zero .pdf files exist
    assert.equal(sha256Buf(fs.readFileSync(path.join(sendFolder, stagedFiles[0]))), g1.docxSha);
    assert.equal(sha256Buf(fs.readFileSync(path.join(sendFolder, stagedFiles[1]))), g2.docxSha);
    assert.equal(stagedFiles.some((f) => f.endsWith(".pdf")), false, "default staging must NOT copy PDFs");

    // Verify send manifest records refusals, fix, held, notPicked, and includePdf=false
    const manifests = fs.readdirSync(path.join(dir, "_send")).filter((f) => rs.MANIFEST_RE.test(f));
    assert.equal(manifests.length, 1);
    const man = JSON.parse(fs.readFileSync(path.join(dir, "_send", manifests[0]), "utf8"));
    assert.equal(man.includePdf, false);
    assert.equal(man.copy.length, 2);
    assert.equal(man.fix.length, 1);
    assert.equal(man.held.length, 1);
    assert.equal(man.notPicked, 1);
    assert.equal(man.refused.length, 1);
    assert.match(man.refused[0], /UNIT1-CW 06.*lock broken/i);

    // Also verify unlocked Guide 07 picked "OK to send" in an .xlsx sheet is refused
    const okRes = await buildOkList(P);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(okRes.out);
    const ws = wb.getWorksheet("OK List");
    ws.eachRow((row, idx) => {
      if (idx > 1 && rs.cellText(row.getCell(2).value) === "UNIT1-CW 07") {
        row.getCell(6).value = "OK to send";
      }
    });
    await wb.xlsx.writeFile(okRes.out);
    const bump = (Date.now() + 2000) / 1000;
    fs.utimesSync(okRes.out, bump, bump);

    const dryRes = await makeSendCopies(P, { dry: true });
    assert.ok(
      dryRes.out.refused.some((r) => /UNIT1-CW 07.*not locked/i.test(r)),
      "unlocked guide marked OK in .xlsx must be refused: " + JSON.stringify(dryRes.out.refused)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("make_send_copies --with-pdf and review.withPdf stage paired .docx + verified Render .pdf, record dual hashes, rotate both into _replaced/, and support --no-pdf override", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const { makeSendCopies } = require(path.join(KIT, "scripts", "make_send_copies.js"));

  const { dir, cfgPath } = createFixtureProject({ withPdf: false });
  try {
    const g1v1 = addGuideArtifact(dir, {
      nn: "01",
      title: "Log a Call on a Case",
      stamp: "20261119-1000",
      docxContent: "DOCX-V1",
      pdfContent: "%PDF-1.4\nV1\n",
    });
    // Guide 02 has missing PDF on disk -> must be refused under --with-pdf!
    addGuideArtifact(dir, {
      nn: "02",
      title: "Upload a Signed Document",
      stamp: "20261119-1000",
      writePdf: false,
    });

    let P = loadConfig(["node", "test", "--config=" + cfgPath]);
    assert.equal(P.cfg.review.withPdf, false);

    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send" })).ok, true);
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 02", { call: "OK to send" })).ok, true);

    // Stage with --with-pdf via CLI
    const cli1 = runNode("scripts/make_send_copies.js", ["--with-pdf", "--config=" + cfgPath], { cwd: dir });
    assert.equal(cli1.status, 0, cli1.stdout + cli1.stderr);

    const sendDir = path.join(dir, "_send");
    const folderDir = path.join(sendDir, "Unit 1 Case Worker");
    const cleanDocx = path.join(folderDir, "Unit 1 Case Worker - Log a Call on a Case.docx");
    const cleanPdf = path.join(folderDir, "Unit 1 Case Worker - Log a Call on a Case.pdf");
    assert.equal(fs.existsSync(cleanDocx), true);
    assert.equal(fs.existsSync(cleanPdf), true);
    assert.equal(sha256Buf(fs.readFileSync(cleanDocx)), g1v1.docxSha);
    assert.equal(sha256Buf(fs.readFileSync(cleanPdf)), g1v1.pdfSha);
    // Guide 02 (missing PDF) must NOT have been copied
    assert.equal(fs.existsSync(path.join(folderDir, "Unit 1 Case Worker - Upload a Signed Document.docx")), false);

    const manFiles1 = fs.readdirSync(sendDir).filter((f) => rs.MANIFEST_RE.test(f)).sort();
    assert.equal(manFiles1.length, 1);
    const man1 = JSON.parse(fs.readFileSync(path.join(sendDir, manFiles1[0]), "utf8"));
    assert.equal(man1.includePdf, true);
    assert.equal(man1.copy.length, 1);
    assert.equal(man1.copy[0].sha256, g1v1.docxSha);
    assert.equal(man1.copy[0].pdfName, "Unit 1 Case Worker - Log a Call on a Case.pdf");
    assert.equal(man1.copy[0].pdfSha256, g1v1.pdfSha);
    assert.equal(man1.refused.length, 1);
    assert.match(man1.refused[0], /UNIT1-CW 02.*PDF/i);

    // Enable review.withPdf = true in qrg.config.json, rebuild & relock Guide 01 (v2), approve v2, re-stage WITHOUT --with-pdf flag!
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.review.withPdf = true;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    P = loadConfig(["node", "test", "--config=" + cfgPath]);
    assert.equal(P.cfg.review.withPdf, true);

    fs.unlinkSync(g1v1.docxPath);
    const g1v2 = addGuideArtifact(dir, {
      nn: "01",
      title: "Log a Call on a Case",
      stamp: "20261119-1045",
      docxContent: "DOCX-V2",
      pdfContent: "%PDF-1.4\nV2\n",
      how: "Fix round 1",
    });
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send" })).ok, true);

    // Run via CLI without --with-pdf (config toggle review.withPdf=true enables PDF staging!) in the SAME minute
    const cli2 = runNode("scripts/make_send_copies.js", ["--config=" + cfgPath], { cwd: dir });
    assert.equal(cli2.status, 0, cli2.stdout + cli2.stderr);

    // New v2 .docx and .pdf are in place with verified hashes
    assert.equal(sha256Buf(fs.readFileSync(cleanDocx)), g1v2.docxSha);
    assert.equal(sha256Buf(fs.readFileSync(cleanPdf)), g1v2.pdfSha);

    // Prior v1 .docx AND v1 .pdf were BOTH rotated into _replaced/
    const replacedDir = path.join(folderDir, "_replaced");
    const replacedFiles = fs.readdirSync(replacedDir).sort();
    assert.equal(replacedFiles.length, 2, "expected both .docx and .pdf rotated into _replaced/: " + JSON.stringify(replacedFiles));
    const repDocx = replacedFiles.find((f) => f.endsWith(".docx"));
    const repPdf = replacedFiles.find((f) => f.endsWith(".pdf"));
    assert.ok(repDocx && repPdf);
    assert.equal(sha256Buf(fs.readFileSync(path.join(replacedDir, repDocx))), g1v1.docxSha);
    assert.equal(sha256Buf(fs.readFileSync(path.join(replacedDir, repPdf))), g1v1.pdfSha);

    // Second manifest written without same-minute collision, recording v2 dual hashes
    const manFiles2 = fs.readdirSync(sendDir).filter((f) => rs.MANIFEST_RE.test(f)).sort();
    assert.equal(manFiles2.length, 2);
    const man2 = JSON.parse(fs.readFileSync(path.join(sendDir, manFiles2[1]), "utf8"));
    assert.equal(man2.copy[0].sha256, g1v2.docxSha);
    assert.equal(man2.copy[0].pdfSha256, g1v2.pdfSha);

    // --no-pdf CLI override beats review.withPdf=true
    const dryNoPdf = runNode("scripts/make_send_copies.js", ["--dry", "--no-pdf", "--config=" + cfgPath], { cwd: dir });
    assert.equal(dryNoPdf.status, 0, dryNoPdf.stdout + dryNoPdf.stderr);
    assert.doesNotMatch(dryNoPdf.stdout, /\.pdf\b/);

    // Foreign unknown PDF at target stops staging before overwriting anything
    fs.writeFileSync(cleanPdf, Buffer.from("UNKNOWN FOREIGN PDF"));
    fs.unlinkSync(g1v2.docxPath);
    addGuideArtifact(dir, {
      nn: "01",
      title: "Log a Call on a Case",
      stamp: "20261119-1100",
      docxContent: "DOCX-V3",
      pdfContent: "%PDF-1.4\nV3\n",
      how: "Fix round 2",
    });
    assert.equal((await rs.recordGuideDecision(P, "UNIT1-CW 01", { call: "OK to send" })).ok, true);
    await assert.rejects(
      () => makeSendCopies(P, { includePdf: true }),
      /did not make/i,
      "must refuse to overwrite unknown pre-existing PDF"
    );
    // Because pre-flight refused before mutating, cleanDocx must still be v2 (not half-staged v3!)
    assert.equal(sha256Buf(fs.readFileSync(cleanDocx)), g1v2.docxSha);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("make_send_copies refuses stale or unverified Render PDFs, stale explicit sheets, invalid flags, and supports multi-sheet precedence", async () => {
  const ExcelJS = require("exceljs");
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const { buildOkList } = require(path.join(KIT, "scripts", "build_ok_list.js"));
  const { makeSendCopies } = require(path.join(KIT, "scripts", "make_send_copies.js"));

  const { dir, cfgPath } = createFixtureProject();
  try {
    const g1v1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
    const g2 = addGuideArtifact(dir, {
      nn: "02",
      title: "Upload a Signed Document",
      stamp: "20261119-1000",
      renderSha256: "f".repeat(64), // stale render.json sha256!
    });
    const g3 = addGuideArtifact(dir, { nn: "03", title: "Close a Referral", stamp: "20261119-1000" });
    // Remove render.json from Guide 03 even though .pdf exists on disk -> unverified!
    fs.unlinkSync(path.join(g3.renderDir, "render.json"));

    const P = loadConfig(["node", "test", "--config=" + cfgPath]);

    // No OK List and no review_state.json -> CLI exits 2 clearly
    const emptyRun = runNode("scripts/make_send_copies.js", ["--config=" + cfgPath], { cwd: dir });
    assert.equal(emptyRun.status, 2);
    assert.match(emptyRun.stderr, /STOP: no OK List or saved review state/i);

    // Invalid flag combinations exit 2
    const badFlags = runNode("scripts/make_send_copies.js", ["--with-pdf", "--no-pdf", "--config=" + cfgPath], { cwd: dir });
    assert.equal(badFlags.status, 2);
    assert.match(badFlags.stderr, /cannot pass both --with-pdf and --no-pdf/i);

    const badAll = runNode("scripts/make_send_copies.js", ["--all-locked", "--config=" + cfgPath], { cwd: dir });
    assert.equal(badAll.status, 2);

    // --dry --all-locked --with-pdf checks all locks: accepts 01, refuses stale 02 & unverified 03
    const dryAll = await makeSendCopies(P, { dry: true, allLocked: true, includePdf: true });
    assert.deepEqual(dryAll.out.copy.map((c) => c.code), ["UNIT1-CW 01"]);
    assert.ok(dryAll.out.refused.some((r) => /UNIT1-CW 02.*stale/i.test(r)));
    assert.ok(dryAll.out.refused.some((r) => /UNIT1-CW 03.*PDF/i.test(r)));

    // Multi-sheet explicit precedence + stale pick detection:
    const sheet1 = await buildOkList(P, { prior: "none" });
    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(sheet1.out);
    wb1.getWorksheet("OK List").eachRow((row, idx) => {
      if (idx > 1 && rs.cellText(row.getCell(2).value) === "UNIT1-CW 01") {
        row.getCell(6).value = "Fix before sending";
      }
    });
    await wb1.xlsx.writeFile(sheet1.out);

    const sheet2 = await buildOkList(P, { prior: "none" });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(sheet2.out);
    wb2.getWorksheet("OK List").eachRow((row, idx) => {
      if (idx > 1 && rs.cellText(row.getCell(2).value) === "UNIT1-CW 01") {
        row.getCell(6).value = "OK to send";
      }
    });
    await wb2.xlsx.writeFile(sheet2.out);

    // Passing [sheet1, sheet2]: sheet2 wins -> Guide 01 is approved!
    const multiRes = await makeSendCopies(P, { dry: true, sheets: [sheet1.out, sheet2.out] });
    assert.deepEqual(multiRes.out.copy.map((c) => c.code), ["UNIT1-CW 01"]);

    // Now rebuild & relock Guide 01 -> passing old sheet2 explicitly MUST refuse the stale pick!
    fs.unlinkSync(g1v1.docxPath);
    addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1130", docxContent: "DOCX-NEW" });
    const staleRes = await makeSendCopies(P, { dry: true, sheets: [sheet2.out] });
    assert.equal(staleRes.out.copy.length, 0);
    assert.equal(staleRes.out.refused.length, 1);
    assert.match(staleRes.out.refused[0], /was made on .*current lock is/i);

    // Also verify invalid non-boolean review.withPdf is rejected by loadConfig
    const badCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    badCfg.review.withPdf = "yes";
    const badCfgPath = path.join(dir, "bad.config.json");
    fs.writeFileSync(badCfgPath, JSON.stringify(badCfg, null, 2));
    const badCfgRun = runNode("scripts/make_send_copies.js", ["--dry", "--all-locked", "--config=" + badCfgPath], { cwd: dir });
    assert.equal(badCfgRun.status, 2);
    assert.match(badCfgRun.stderr, /review\.withPdf must be true or false/);
    void g2;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("end-to-end real build, LibreOffice render, Review Lock, review_state, .xlsx OK List, and --with-pdf Send Copy staging", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const rs = require(path.join(KIT, "lib", "review_state.js"));
  const dir = makeTempDir("qrg-review-e2e-");
  try {
    const init = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--project=Release Pilot",
      "--set=UNIT1-INV",
      "--label=Unit 1 Investigator",
      "--unit-line=Unit 1 | Investigator",
      "--kit=skill",
    ]);
    assert.equal(init.status, 0, init.stdout + init.stderr);

    const ex = runNode("scripts/new_guide.js", ["--set=UNIT1-INV", "--example"], { cwd: dir });
    assert.equal(ex.status, 0, ex.stdout + ex.stderr);

    const build = runNode("build_qrgs.js", ["--set=UNIT1-INV"], { cwd: dir });
    assert.equal(build.status, 0, build.stdout + build.stderr);

    const render = runNode("scripts/render_guides.js", ["--set=UNIT1-INV"], { cwd: dir });
    assert.equal(render.status, 0, render.stdout + render.stderr);

    const lock = runNode("scripts/lock_guides.js", ["--how=first build, QA clean, pages inspected", "--set=UNIT1-INV"], { cwd: dir });
    assert.equal(lock.status, 0, lock.stdout + lock.stderr);

    const cfgPath = path.join(dir, "qrg.config.json");
    const P = loadConfig(["node", "test", "--config=" + cfgPath]);
    assert.equal(P.cfg.review.withPdf, false, "init_project template must default review.withPdf to false");

    // Approve in shared review state
    const rec = await rs.recordGuideDecision(P, "UNIT1-INV 01", { call: "OK to send" });
    assert.equal(rec.ok, true);
    assert.equal(rec.guide.pageFiles.length, 2);

    // Export .xlsx OK List from shared review state
    const okCli = runNode("scripts/build_ok_list.js", ["--config=" + cfgPath], { cwd: dir });
    assert.equal(okCli.status, 0, okCli.stdout + okCli.stderr);

    // Stage Word + verified LibreOffice Render PDF Send Copies
    const sendCli = runNode("scripts/make_send_copies.js", ["--with-pdf", "--config=" + cfgPath], { cwd: dir });
    assert.equal(sendCli.status, 0, sendCli.stdout + sendCli.stderr);

    const outDir = path.join(dir, "_send", "Unit 1 Investigator");
    const docxOut = path.join(outDir, "Unit 1 Investigator - Log a Call on a Case.docx");
    const pdfOut = path.join(outDir, "Unit 1 Investigator - Log a Call on a Case.pdf");
    assert.equal(fs.existsSync(docxOut), true);
    assert.equal(fs.existsSync(pdfOut), true);
    assert.equal(fs.readFileSync(pdfOut).subarray(0, 5).toString("ascii"), "%PDF-");

    const manFiles = fs.readdirSync(path.join(dir, "_send")).filter((f) => rs.MANIFEST_RE.test(f));
    assert.equal(manFiles.length, 1);
    const man = JSON.parse(fs.readFileSync(path.join(dir, "_send", manFiles[0]), "utf8"));
    assert.equal(man.includePdf, true);
    assert.equal(man.copy.length, 1);
    assert.equal(man.copy[0].sha256, sha256Buf(fs.readFileSync(docxOut)));
    assert.equal(man.copy[0].pdfSha256, sha256Buf(fs.readFileSync(pdfOut)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("review_state, build_ok_list, make_send_copies, config, and test files contain zero em or en dashes", () => {
  const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  const files = [
    path.join(KIT, "lib", "review_state.js"),
    path.join(KIT, "lib", "config.js"),
    path.join(KIT, "templates", "qrg.config.example.json"),
    path.join(KIT, "scripts", "build_ok_list.js"),
    path.join(KIT, "scripts", "make_send_copies.js"),
    path.join(KIT, "test", "review_state.test.js"),
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    assert.equal(dashRe.test(text), false, "em/en dash found in " + path.relative(KIT, f));
  }
});
