"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const KIT = path.resolve(__dirname, "..");

function makeTempDir(prefix = "qrg-review-ui-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function createFixtureProject(opts = {}) {
  const dir = makeTempDir();
  const cfg = {
    project: opts.project || "Field Ops Pilot",
    author: "Change Management",
    status: "DRAFT",
    page: "letter",
    font: "Calibri",
    palette: {
      accent: opts.accent || "1F5C99",
      heading: "1F3864",
      grey: "595959",
      light: "F2F2F2",
      tip: "1F5C99",
      warn: "9C6500",
    },
    sets: opts.sets || [
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
  for (const s of cfg.sets) {
    fs.mkdirSync(path.join(dir, s.dir, "guides"), { recursive: true });
    fs.mkdirSync(path.join(dir, s.out), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, "review"), { recursive: true });
  return { dir, cfgPath };
}

test("Browser Review UI server binds strictly to 127.0.0.1, falls back to a free port when busy, and serves clean accent-styled HTML with zero JSON jargon or em/en dashes", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const ui = require(path.join(KIT, "scripts", "review_ui.js"));

  assert.deepEqual(ui.parseCliArgs(["--port=4512", "--no-open", "--set=UNIT1-CW"]), {
    port: 4512,
    noOpen: true,
    set: "UNIT1-CW",
  });
  assert.deepEqual(ui.parseCliArgs(["--port", "0"]), {
    port: 0,
    noOpen: false,
    set: null,
  });

  // Cross-platform default browser launch commands
  const winCmd = ui.openBrowserCommand("http://127.0.0.1:4318", "win32");
  assert.equal(winCmd.command, "cmd");
  assert.deepEqual(winCmd.args, ["/c", "start", "", "http://127.0.0.1:4318"]);
  const macCmd = ui.openBrowserCommand("http://127.0.0.1:4318", "darwin");
  assert.equal(macCmd.command, "open");
  assert.deepEqual(macCmd.args, ["http://127.0.0.1:4318"]);
  const linCmd = ui.openBrowserCommand("http://127.0.0.1:4318", "linux");
  assert.equal(linCmd.command, "xdg-open");
  assert.deepEqual(linCmd.args, ["http://127.0.0.1:4318"]);

  const { dir, cfgPath } = createFixtureProject({ project: "Northstar Pilot", accent: "0F6B5B" });
  const P = loadConfig(["--config=" + cfgPath]);

  // Occupy a port on 127.0.0.1 to verify automatic free-port fallback
  const blocker = http.createServer((_req, res) => res.end("busy"));
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const busyPort = blocker.address().port;

  let srv = null;
  try {
    srv = await ui.startReviewServer(P, { port: busyPort });
    assert.equal(srv.host, "127.0.0.1");
    assert.notEqual(srv.port, busyPort);
    assert.equal(srv.port > 0, true);
    assert.equal(srv.url, "http://127.0.0.1:" + srv.port);
    assert.equal(srv.server.address().address, "127.0.0.1");

    const res = await fetch(srv.url + "/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /^text\/html\b/i);
    const html = await res.text();

    assert.match(html, /Northstar Pilot/);
    assert.match(html, /#0F6B5B/i);
    assert.match(html, /Export \.xlsx OK List/);
    assert.match(html, /Stage Send Copies/);
    assert.match(html, /Also include matching PDF copies/i);
    assert.match(html, /<dialog\b/);

    // Zero developer/JSON jargon and zero em/en dashes anywhere in the rendered HTML UI
    assert.doesNotMatch(html, /\.json/i);
    assert.doesNotMatch(html, /Download picks/i);
    assert.doesNotMatch(html, /picks-prototype/i);
    assert.doesNotMatch(html, /review_state/i);
    assert.doesNotMatch(html, /Throwaway Prototype/i);
    assert.doesNotMatch(html, /[\u2013\u2014]/);
  } finally {
    if (srv) await srv.close();
    await new Promise((resolve) => blocker.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
      // Valid 8-byte PNG header + distinct page marker
      const pngBytes = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from("PAGE:" + code + ":" + p),
      ]);
      fs.writeFileSync(
        path.join(rDir, setId + "_" + nn + "_p" + String(p).padStart(2, "0") + ".png"),
        pngBytes
      );
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

test("GET /api/state exposes locked, unlocked, on-hold, and broken-lock guides and GET /api/render serves PNGs while rejecting path traversal", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const ui = require(path.join(KIT, "scripts", "review_ui.js"));

  const { dir, cfgPath } = createFixtureProject();
  const g1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", pages: 2 });
  const g2 = addGuideArtifact(dir, { nn: "02", title: "Upload a Signed Document", lock: false, render: false });
  const g3 = addGuideArtifact(dir, { nn: "03", title: "Close an Active Case", pages: 1 });
  // Tamper with g3 after locking to trigger broken lock
  fs.writeFileSync(g3.docxPath, Buffer.from("HAND-EDITED-AFTER-LOCK"));

  fs.writeFileSync(
    path.join(dir, "review", "notes.json"),
    JSON.stringify({ "UNIT1-CW 01": { check: "Confirm step 4 button label." } }, null, 2)
  );
  fs.writeFileSync(
    path.join(dir, "review", "send_hold.json"),
    JSON.stringify({ "UNIT1-CW 01": {} }, null, 2)
  );

  // Create a symlink inside render dir pointing outside render/ to verify realpath containment
  const outsidePng = path.join(dir, "secret.png");
  fs.writeFileSync(outsidePng, Buffer.from("SECRET_PNG_OUTSIDE_RENDER"));
  const symlinkPath = path.join(g1.renderDir, "escape_p99.png");
  try {
    fs.symlinkSync(outsidePng, symlinkPath);
  } catch (e) {
    // Symlink creation may require privileges on Windows; handled gracefully
  }

  const P = loadConfig(["--config=" + cfgPath]);
  const srv = await ui.startReviewServer(P, { port: 0 });

  try {
    const stateRes = await fetch(srv.url + "/api/state");
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();

    assert.equal(state.project, "Field Ops Pilot");
    assert.equal(state.summary.total, 3);
    assert.equal(state.summary.locked, 1);
    assert.equal(state.summary.remaining, 1);

    const byCode = Object.fromEntries(state.guides.map((g) => [g.code, g]));
    assert.equal(byCode[g1.code].lockStatus, "locked");
    assert.equal(byCode[g1.code].checkNotes, "Confirm step 4 button label.");
    assert.equal(byCode[g1.code].onHold, "On send hold");
    assert.doesNotMatch(JSON.stringify(byCode[g1.code]), /send_hold\.json/i);
    assert.equal(byCode[g1.code].pageUrls.length, 2);

    assert.equal(byCode[g2.code].lockStatus, "unlocked");
    assert.equal(byCode[g2.code].pageUrls.length, 0);

    assert.equal(byCode[g3.code].lockStatus, "broken");
    assert.equal(byCode[g3.code].pdfStale, true);

    // Fetch valid rendered US Letter PNG
    const pngRes = await fetch(srv.url + byCode[g1.code].pageUrls[0]);
    assert.equal(pngRes.status, 200);
    assert.equal(pngRes.headers.get("content-type"), "image/png");
    const pngBuf = Buffer.from(await pngRes.arrayBuffer());
    assert.match(pngBuf.toString("latin1"), /PAGE:UNIT1-CW 01:1/);

    // Path traversal & non-PNG rejection tests
    const badUrls = [
      "/api/render/../../qrg.config.json",
      "/api/render/%2e%2e/%2e%2e/qrg.config.json",
      "/api/render/UNIT1-CW_01_20261119-1000/render.json",
      "/api/render/UNIT1-CW_01_20261119-1000/..%5c..%5cqrg.config.json",
      "/api/render/UNIT1-CW_01_20261119-1000/%2e%2e/locks.json",
      "/api/render/UNIT1-CW_01_20261119-1000/escape_p99.png",
    ];
    for (const u of badUrls) {
      const r = await fetch(srv.url + u);
      assert.equal(r.status >= 400 && r.status < 500, true, "expected 4xx for " + u + ", got " + r.status);
      const body = await r.text();
      assert.doesNotMatch(body, /Field Ops Pilot/);
      assert.doesNotMatch(body, /SECRET_PNG_OUTSIDE_RENDER/);
      assert.doesNotMatch(body, /UNIT1-CW_01\.pdf/);
    }
  } finally {
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /api/pick and /api/comment auto-save to review_state.json, refuse broken-lock and unlocked guides with 409, and preserve carry-forward after rebuild", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const ui = require(path.join(KIT, "scripts", "review_ui.js"));

  const { dir, cfgPath } = createFixtureProject();
  const g1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
  const g2 = addGuideArtifact(dir, { nn: "02", title: "Approve a Case Closure", stamp: "20261119-1000" });
  const g3 = addGuideArtifact(dir, { nn: "03", title: "Draft In Progress", lock: false, render: false });
  const g4 = addGuideArtifact(dir, { nn: "04", title: "Tampered Guide", stamp: "20261119-1000" });
  fs.writeFileSync(g4.docxPath, Buffer.from("TAMPERED_DOCX_BYTES"));

  const P = loadConfig(["--config=" + cfgPath]);
  const srv = await ui.startReviewServer(P, { port: 0 });

  try {
    // Save pick on g1 -> OK to send
    const r1 = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g1.code, call: "OK to send" }),
    });
    assert.equal(r1.status, 200);
    const d1 = await r1.json();
    assert.equal(d1.ok, true);
    assert.equal(d1.guide.call, "OK to send");
    assert.equal(d1.state.summary.ok, 1);

    // Save pick + comment on g2 -> Fix before sending
    const r2 = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g2.code, call: "Fix before sending" }),
    });
    assert.equal(r2.status, 200);

    const r2c = await fetch(srv.url + "/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g2.code, comment: "Step 3 still says Submit instead of Confirm." }),
    });
    assert.equal(r2c.status, 200);
    const d2c = await r2c.json();
    assert.equal(d2c.guide.comment, "Step 3 still says Submit instead of Confirm.");

    // Verify immediate atomic persistence in review/review_state.json
    const stateFile = path.join(dir, "review", "review_state.json");
    assert.equal(fs.existsSync(stateFile), true);
    const persisted = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assert.equal(persisted.guides[g1.code].call, "OK to send");
    assert.equal(persisted.guides[g2.code].call, "Fix before sending");
    assert.equal(persisted.guides[g2.code].comment, "Step 3 still says Submit instead of Confirm.");

    // Clicking active pick again toggles clear, then re-pick OK to send
    const rToggle = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g1.code, call: "OK to send" }),
    });
    assert.equal(rToggle.status, 200);
    assert.equal((await rToggle.json()).guide.call, "");

    const rRepick = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g1.code, call: "OK to send" }),
    });
    assert.equal(rRepick.status, 200);
    assert.equal((await rRepick.json()).guide.call, "OK to send");

    // Refuse picks and comments on unlocked (g3) and broken-lock (g4) guides with 409
    for (const badCode of [g3.code, g4.code]) {
      const rp = await fetch(srv.url + "/api/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: badCode, call: "OK to send" }),
      });
      assert.equal(rp.status, 409, "pick should be refused with 409 for " + badCode);
      const rc = await fetch(srv.url + "/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: badCode, comment: "Should be blocked" }),
      });
      assert.equal(rc.status, 409, "comment should be refused with 409 for " + badCode);
    }

    // Invalid call -> 400, missing guide -> 404, malformed JSON -> 400
    const rBadCall = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g1.code, call: "Ship it" }),
    });
    assert.equal(rBadCall.status, 400);

    const rMissing = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "UNIT1-CW 99", call: "OK to send" }),
    });
    assert.equal(rMissing.status, 404);

    const rMalformed = await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-valid-json",
    });
    assert.equal(rMalformed.status, 400);

    // Rebuild and relock g2 with a new stamp -> carry-forward resets g2 blank with earlierCall, keeps g1 OK to send
    fs.unlinkSync(g2.docxPath);
    addGuideArtifact(dir, {
      nn: "02",
      title: "Approve a Case Closure",
      stamp: "20261119-1115",
      docxContent: "DOCX:UNIT1-CW 02:REBUILT",
      how: "Fix round 1: renamed Submit to Confirm in step 3",
    });

    const reloadRes = await fetch(srv.url + "/api/state");
    assert.equal(reloadRes.status, 200);
    const reloaded = await reloadRes.json();
    const byCode = Object.fromEntries(reloaded.guides.map((g) => [g.code, g]));

    assert.equal(byCode[g1.code].call, "OK to send");
    assert.equal(byCode[g1.code].changed, false);

    assert.equal(byCode[g2.code].lockStatus, "locked");
    assert.equal(byCode[g2.code].call, "");
    assert.equal(byCode[g2.code].comment, "");
    assert.equal(byCode[g2.code].changed, true);
    assert.match(byCode[g2.code].earlierCall, /Fix before sending/);
    assert.match(byCode[g2.code].earlierCall, /Step 3 still says Submit instead of Confirm/);
  } finally {
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("POST /api/export-xlsx writes a valid .xlsx OK List with current picks and POST /api/stage-send previews and stages Word-only and Word+PDF Send Copies", async () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const { readOkListPicks, MANIFEST_RE } = require(path.join(KIT, "lib", "review_state.js"));
  const ui = require(path.join(KIT, "scripts", "review_ui.js"));

  const { dir, cfgPath } = createFixtureProject();
  const g1 = addGuideArtifact(dir, { nn: "01", title: "Log a Call on a Case", stamp: "20261119-1000" });
  const g2 = addGuideArtifact(dir, { nn: "02", title: "Upload a Signed Form", stamp: "20261119-1000" });
  const g3 = addGuideArtifact(dir, { nn: "03", title: "Close a Case", stamp: "20261119-1000" });
  const g4 = addGuideArtifact(dir, { nn: "04", title: "Tampered Guide", stamp: "20261119-1000" });
  fs.writeFileSync(g4.docxPath, Buffer.from("TAMPERED_AFTER_LOCK"));

  const P = loadConfig(["--config=" + cfgPath]);
  const srv = await ui.startReviewServer(P, { port: 0 });

  try {
    // Dry preview works cleanly even before any pick or .xlsx exists
    const rEmptyDry = await fetch(srv.url + "/api/stage-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includePdf: false, dry: true }),
    });
    assert.equal(rEmptyDry.status, 200);
    const emptyPlan = await rEmptyDry.json();
    assert.equal(emptyPlan.copy.length, 0);
    assert.equal(emptyPlan.skipped.length, 4);

    // Record picks and comments via browser API
    await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g1.code, call: "OK to send" }),
    });
    await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g2.code, call: "OK to send, note for later" }),
    });
    await fetch(srv.url + "/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g2.code, comment: "Mention PDF size limit next quarter." }),
    });
    await fetch(srv.url + "/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g3.code, call: "Fix before sending" }),
    });
    await fetch(srv.url + "/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: g3.code, comment: "Update screenshot 2." }),
    });

    // Export .xlsx OK List from the Browser Review UI
    const expRes = await fetch(srv.url + "/api/export-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(expRes.status, 200);
    const expData = await expRes.json();
    assert.equal(expData.ok, true);
    assert.match(expData.file, /^QRG OK List - DRAFT .*\.xlsx$/);
    assert.doesNotMatch(expData.message, /\.json/i);

    const xlsxPath = path.join(dir, "review", expData.file);
    assert.equal(fs.existsSync(xlsxPath), true);
    const parsedSheet = await readOkListPicks(xlsxPath, { skipBusyCheck: true });
    assert.equal(parsedSheet.picksByCode[g1.code].call, "OK to send");
    assert.equal(parsedSheet.picksByCode[g2.code].call, "OK to send, note for later");
    assert.equal(parsedSheet.picksByCode[g2.code].comment, "Mention PDF size limit next quarter.");
    assert.equal(parsedSheet.picksByCode[g3.code].call, "Fix before sending");
    assert.equal(parsedSheet.picksByCode[g3.code].comment, "Update screenshot 2.");

    // Stage Word-only Send Copies (includePdf: false)
    const stageWordRes = await fetch(srv.url + "/api/stage-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includePdf: false, dry: false }),
    });
    assert.equal(stageWordRes.status, 200);
    const stageWord = await stageWordRes.json();
    assert.equal(stageWord.ok, true);
    assert.equal(stageWord.includePdf, false);
    assert.equal(stageWord.copy.length, 2);
    assert.equal(stageWord.made, 2);
    assert.doesNotMatch(JSON.stringify(stageWord), /\.json/i);

    const sendSubdir = path.join(dir, "_send", "Unit 1 Case Worker");
    const docx1 = path.join(sendSubdir, "Unit 1 Case Worker - Log a Call on a Case.docx");
    const docx2 = path.join(sendSubdir, "Unit 1 Case Worker - Upload a Signed Form.docx");
    const pdf1 = path.join(sendSubdir, "Unit 1 Case Worker - Log a Call on a Case.pdf");
    const pdf2 = path.join(sendSubdir, "Unit 1 Case Worker - Upload a Signed Form.pdf");
    assert.equal(fs.existsSync(docx1), true);
    assert.equal(fs.existsSync(docx2), true);
    assert.equal(sha256Buf(fs.readFileSync(docx1)), g1.docxSha);
    assert.equal(sha256Buf(fs.readFileSync(docx2)), g2.docxSha);
    assert.equal(fs.existsSync(pdf1), false, "Word-only staging must not write PDFs");
    assert.equal(fs.existsSync(pdf2), false, "Word-only staging must not write PDFs");

    // Stage Word + PDF Send Copies (includePdf: true)
    const stagePdfRes = await fetch(srv.url + "/api/stage-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includePdf: true, dry: false }),
    });
    assert.equal(stagePdfRes.status, 200);
    const stagePdf = await stagePdfRes.json();
    assert.equal(stagePdf.ok, true);
    assert.equal(stagePdf.includePdf, true);
    assert.equal(stagePdf.copy.length, 2);
    assert.equal(stagePdf.same, 2);
    assert.equal(stagePdf.pdfMade, 2);
    assert.doesNotMatch(JSON.stringify(stagePdf), /\.json/i);

    assert.equal(fs.existsSync(pdf1), true);
    assert.equal(fs.existsSync(pdf2), true);
    assert.equal(sha256Buf(fs.readFileSync(pdf1)), g1.pdfSha);
    assert.equal(sha256Buf(fs.readFileSync(pdf2)), g2.pdfSha);

    // Verify dual-hash manifest on disk
    const sendDir = path.join(dir, "_send");
    const manifests = fs.readdirSync(sendDir).filter((f) => MANIFEST_RE.test(f)).sort();
    assert.equal(manifests.length, 2);
    const latestManifest = JSON.parse(fs.readFileSync(path.join(sendDir, manifests[manifests.length - 1]), "utf8"));
    assert.equal(latestManifest.includePdf, true);
    assert.equal(latestManifest.copy.length, 2);
    const m1 = latestManifest.copy.find((c) => c.code === g1.code);
    assert.equal(m1.sha256, g1.docxSha);
    assert.equal(m1.pdfSha256, g1.pdfSha);
    assert.equal(m1.pdfName, "Unit 1 Case Worker - Log a Call on a Case.pdf");
  } finally {
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI review_ui.js starts with --port=0 --no-open --set=<id>, prints http://127.0.0.1:<port>, filters sets, and exits cleanly", async () => {
  const { dir, cfgPath } = createFixtureProject({
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
      {
        id: "UNIT1-SUP",
        label: "Unit 1 Supervisor",
        prefix: "Unit 1 Supervisor",
        unitLine: "Unit 1 | Supervisor",
        footerTag: "Unit 1 Supervisor",
        dir: "sets/UNIT1-SUP",
        out: "QRGs/Unit 1 Supervisor",
        assetKey: "UNIT1SUP",
        sendFolder: "Unit 1 Supervisor",
      },
    ],
  });

  addGuideArtifact(dir, {
    set: "UNIT1-CW",
    prefix: "Unit 1 Case Worker",
    outLabel: "Unit 1 Case Worker",
    nn: "01",
    title: "Log a Call on a Case",
  });
  addGuideArtifact(dir, {
    set: "UNIT1-SUP",
    prefix: "Unit 1 Supervisor",
    outLabel: "Unit 1 Supervisor",
    nn: "01",
    title: "Approve a Case Closure",
  });

  // Invalid --port flag exits with code 2
  const badPort = spawnSync(
    process.execPath,
    [path.join(KIT, "scripts", "review_ui.js"), "--port=abc", "--no-open", "--config=" + cfgPath],
    { encoding: "utf8" }
  );
  assert.equal(badPort.status, 2);

  const child = spawn(
    process.execPath,
    [
      path.join(KIT, "scripts", "review_ui.js"),
      "--port=0",
      "--no-open",
      "--set=UNIT1-CW",
      "--config=" + cfgPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  try {
    const url = await new Promise((resolve, reject) => {
      let out = "";
      let errOut = "";
      const timer = setTimeout(() => {
        reject(new Error("Timed out waiting for review_ui.js URL. stdout=" + out + " stderr=" + errOut));
      }, 8000);
      child.stdout.on("data", (chunk) => {
        out += chunk.toString("utf8");
        const m = out.match(/http:\/\/127\.0\.0\.1:([0-9]+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      });
      child.stderr.on("data", (chunk) => {
        errOut += chunk.toString("utf8");
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("review_ui.js exited early with code " + code + ": " + errOut));
      });
    });

    const res = await fetch(url + "/api/state");
    assert.equal(res.status, 200);
    const state = await res.json();
    assert.equal(state.setFilter, "UNIT1-CW");
    assert.equal(state.guides.length, 1);
    assert.equal(state.guides[0].code, "UNIT1-CW 01");

    const exitCode = await new Promise((resolve) => {
      child.once("exit", (code) => resolve(code));
      child.kill("SIGTERM");
    });
    assert.equal(exitCode, 0);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Browser Review UI source and test files contain zero em or en dashes", () => {
  const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  const files = [
    path.join(KIT, "scripts", "review_ui.js"),
    path.join(KIT, "lib", "review_ui_html.js"),
    path.join(KIT, "test", "review_ui.test.js"),
  ];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    assert.equal(dashRe.test(content), false, "Found em/en dash in " + path.relative(KIT, f));
  }
});
