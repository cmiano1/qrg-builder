"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const JSZip = require("jszip");

const KIT = path.resolve(__dirname, "..");

function makeTempDir(prefix = "qrg-kit-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedExampleProject() {
  const dir = makeTempDir("qrg-example-");
  const init = runNode("scripts/init_project.js", [
    "--dir=" + dir,
    "--project=Example Pilot",
    "--set=UNIT1-INV",
    "--label=Unit 1 Investigator",
    "--unit-line=Unit 1 | Investigator",
    "--kit=skill",
  ]);
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const ex = runNode("scripts/new_guide.js", ["--set=UNIT1-INV", "--example"], { cwd: dir });
  assert.equal(ex.status, 0, ex.stdout + ex.stderr);

  return { dir, exampleOutput: ex.stdout };
}

function runNode(scriptRel, args = [], opts = {}) {
  const scriptPath = path.isAbsolute(scriptRel) ? scriptRel : path.join(KIT, scriptRel);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

test("Kit package metadata targets version 2.0.0, Node >=22, exact docx 8.5.0 pin, and node --test", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8"));
  assert.equal(pkg.version, "2.0.0");
  assert.equal(pkg.engines && pkg.engines.node, ">=22");
  assert.equal(pkg.dependencies && pkg.dependencies.docx, "8.5.0");
  assert.match(pkg.scripts && pkg.scripts.test || "", /^node --test\b/);

  const lock = JSON.parse(fs.readFileSync(path.join(KIT, "package-lock.json"), "utf8"));
  assert.equal(lock.version, "2.0.0");
  assert.equal(lock.packages && lock.packages[""] && lock.packages[""].version, "2.0.0");
  assert.equal(lock.packages && lock.packages[""] && lock.packages[""].engines && lock.packages[""].engines.node, ">=22");
});

test("Health check passes on Node 22+ and rejects Node versions older than 22", () => {
  const r = runNode("scripts/check_kit.js");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /kit version 2\.0\.0/);
  assert.match(r.stdout, /RESULT: kit ready/);

  const checkKit = require(path.join(KIT, "scripts", "check_kit.js"));
  assert.equal(checkKit.MIN_NODE_MAJOR, 22);
  assert.equal(checkKit.isSupportedNodeVersion("20.19.0"), false);
  assert.equal(checkKit.isSupportedNodeVersion("21.7.3"), false);
  assert.equal(checkKit.isSupportedNodeVersion("22.0.0"), true);
  assert.equal(checkKit.isSupportedNodeVersion("24.1.0"), true);
});

test("init_project copies package-lock.json, preserves existing sets, and rejects A4 config", () => {
  const dir = makeTempDir();
  try {
    const r1 = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--project=Acme Pilot",
      "--set=UNIT1-INV",
      "--label=Unit 1 Investigator",
      "--unit-line=Unit 1 | Investigator",
    ]);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);

    const copiedLock = path.join(dir, "qrg_kit", "package-lock.json");
    assert.equal(fs.existsSync(copiedLock), true, "expected qrg_kit/package-lock.json to be copied");
    assert.equal(
      fs.readFileSync(copiedLock, "utf8"),
      fs.readFileSync(path.join(KIT, "package-lock.json"), "utf8"),
      "copied package-lock.json should match the Kit lockfile"
    );

    const cfg1 = JSON.parse(fs.readFileSync(path.join(dir, "qrg.config.json"), "utf8"));
    assert.equal(cfg1.page, "letter");
    assert.deepEqual(cfg1.sets.map((s) => s.id), ["UNIT1-INV"]);

    // Adding a second set preserves the first set and existing qrg_kit.
    const r2 = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--set=UNIT1-SUP",
      "--label=Unit 1 Supervisor",
    ]);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    const cfg2 = JSON.parse(fs.readFileSync(path.join(dir, "qrg.config.json"), "utf8"));
    assert.deepEqual(cfg2.sets.map((s) => s.id), ["UNIT1-INV", "UNIT1-SUP"]);

    // Passing --page=a4 fails loudly.
    const a4Dir = makeTempDir("qrg-kit-a4-");
    try {
      const rA4Flag = runNode("scripts/init_project.js", [
        "--dir=" + a4Dir,
        "--set=UNIT1-INV",
        "--page=a4",
      ]);
      assert.notEqual(rA4Flag.status, 0, "expected --page=a4 to fail");
      assert.match(rA4Flag.stderr, /letter/i);
    } finally {
      fs.rmSync(a4Dir, { recursive: true, force: true });
    }

    // Existing qrg.config.json with page "a4" fails loudly when adding a set.
    cfg2.page = "a4";
    fs.writeFileSync(path.join(dir, "qrg.config.json"), JSON.stringify(cfg2, null, 2) + "\n");
    const rA4Cfg = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--set=UNIT2-INV",
      "--label=Unit 2 Investigator",
    ]);
    assert.notEqual(rA4Cfg.status, 0, "expected existing A4 config to fail in init_project");
    assert.match(rA4Cfg.stderr, /letter/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("US Letter (8.5 x 11 in, 1 in margins, 6.5 in content width) is enforced and A4 fails loudly across config, generation, and lint", async () => {
  const docxHelpers = require(path.join(KIT, "lib", "docx_helpers.js"));
  const gdocsLint = require(path.join(KIT, "tools", "gdocs_lint.js"));

  assert.deepEqual(Object.keys(docxHelpers.PAGES), ["letter"]);
  assert.deepEqual(docxHelpers.PAGES.letter, { width: 12240, height: 15840 });
  assert.equal(docxHelpers.MARGIN, 1440);

  const baseCfg = {
    author: "Change Management",
    page: "letter",
    font: "Calibri",
    palette: { accent: "C00000", heading: "8B0000", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
  };
  const H = docxHelpers.makeHelpers(baseCfg);
  assert.equal(H.CONTENT_W, 9360);

  assert.throws(
    () => docxHelpers.makeHelpers({ ...baseCfg, page: "a4" }),
    /letter/i,
    "makeHelpers should reject A4 page size"
  );

  assert.deepEqual(Object.keys(gdocsLint.PAGES), ["letter"]);
  assert.deepEqual(gdocsLint.PAGES.letter, { w: 12240, h: 15840 });

  const doc = H.makeDocument({
    docTitle: "Letter Check",
    footerLeft: "Letter Check",
    body: [H.h2("Purpose"), H.para("Check US Letter dimensions.")],
  });
  const buf = await H.pack(doc);

  const cleanFindings = (await gdocsLint.lintDocx(buf, { page: "letter", fullWidth: true, fonts: ["Calibri"] }))
    .filter((f) => f.level === "FAIL");
  assert.deepEqual(cleanFindings, []);

  await assert.rejects(
    () => gdocsLint.lintDocx(buf, { page: "a4" }),
    /letter/i,
    "lintDocx should reject A4 page option"
  );

  const dir = makeTempDir("qrg-letter-");
  try {
    const docxPath = path.join(dir, "letter.docx");
    fs.writeFileSync(docxPath, buf);

    const cliA4 = runNode("tools/gdocs_lint.js", ["--page=a4", docxPath]);
    assert.notEqual(cliA4.status, 0, "gdocs_lint CLI should reject --page=a4");
    assert.match(cliA4.stderr + cliA4.stdout, /letter/i);

    const init = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--set=DEMO",
      "--label=Demo Role",
      "--kit=skill",
    ]);
    assert.equal(init.status, 0, init.stdout + init.stderr);

    const cfgPath = path.join(dir, "qrg.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.page = "a4";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

    const buildA4 = runNode("build_qrgs.js", ["--set=DEMO", "--config=" + cfgPath], { cwd: dir });
    assert.equal(buildA4.status, 2, "config validation should fail with exit 2 for page a4");
    assert.match(buildA4.stderr, /a4/i);
    assert.match(buildA4.stderr, /letter/i);

    cfg.page = "legal";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    const buildLegal = runNode("build_qrgs.js", ["--set=DEMO", "--config=" + cfgPath], { cwd: dir });
    assert.equal(buildLegal.status, 2, "config validation should fail with exit 2 for non-letter page");
    assert.match(buildLegal.stderr, /letter/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Worked example end-to-end pipeline: CLI flags, env vars, hand-edit guard, QA pass/fail, and gdocs_lint_selftest", async () => {
  const { dir, exampleOutput } = seedExampleProject();
  try {
    // new_guide prints cross-shell CLI flags instead of Bash env-var prefixes.
    assert.match(exampleOutput, /--scratch --only=/);
    assert.doesNotMatch(exampleOutput, /QRG_SCRATCH=1/);

    const guidesDir = path.join(dir, "sets", "UNIT1-INV", "guides");
    const scratchDir = path.join(dir, "sets", "UNIT1-INV", "_work", "scratch");
    const liveDir = path.join(dir, "QRGs", "Unit 1 Investigator");
    const logFile = path.join(dir, "sets", "UNIT1-INV", "_work", "last_qrgs_build.json");

    // Add a held guide source with deliberate QA violations for hold and QA-fail checks.
    fs.writeFileSync(path.join(guidesDir, "02.js"), [
      "module.exports = (H) => {",
      "  const { h2, para, num, bullet, refTable, titleBlock } = H;",
      "  return {",
      '    title: "Escalate a Case",',
      '    subtitle: "Send a case to a supervisor",',
      "    hold: true,",
      "    build() {",
      "      return [",
      "        ...titleBlock(this.title, this.subtitle),",
      '        h2("Purpose"), para("TODO: update on 11/19/2026."),',
      '        h2("Who does this"), bullet("Case Workers."),',
      '        h2("Before you start"), bullet("Open the case."),',
      '        h2("Steps"), num("Click **Escalate**."),',
      '        h2("What happens next"), para("The supervisor receives the case."),',
      '        h2("Troubleshooting"), refTable(["Situation", "What to do"], [["Button missing", "Check permissions."]], [3400, 5800]),',
      "      ];",
      "    },",
      "  };",
      "};",
      "",
    ].join("\n"));

    // 1. Cross-shell CLI flags: --scratch and --only=<pattern>
    const scratchCli = runNode("build_qrgs.js", [
      "--set=UNIT1-INV",
      "--scratch",
      "--only=Unit 1 Investigator 01 ",
    ], { cwd: dir });
    assert.equal(scratchCli.status, 0, scratchCli.stdout + scratchCli.stderr);
    assert.match(scratchCli.stdout, /DONE \(scratch\)\. 1 guide\(s\)/);
    assert.equal(fs.readdirSync(liveDir).filter((f) => f.endsWith(".docx")).length, 0);
    assert.equal(fs.existsSync(logFile), false);
    assert.equal(fs.readdirSync(scratchDir).filter((f) => f.includes("Log a Call on a Case")).length, 1);

    // Space-separated --only <pattern> also works.
    const scratchSpaceOnly = runNode("build_qrgs.js", [
      "--set=UNIT1-INV",
      "--scratch",
      "--only",
      "Unit 1 Investigator 01 ",
    ], { cwd: dir });
    assert.equal(scratchSpaceOnly.status, 0, scratchSpaceOnly.stdout + scratchSpaceOnly.stderr);

    // 2. Live build skips held guides by default; --include-hold includes them.
    const liveBuild = runNode("build_qrgs.js", ["--set=UNIT1-INV"], { cwd: dir });
    assert.equal(liveBuild.status, 0, liveBuild.stdout + liveBuild.stderr);
    assert.match(liveBuild.stdout, /SKIPPED \(on hold\) Unit 1 Investigator 02/);
    const liveFiles = fs.readdirSync(liveDir).filter((f) => f.endsWith(".docx"));
    assert.equal(liveFiles.length, 1);
    assert.match(liveFiles[0], /^Unit 1 Investigator 01 - Log a Call on a Case - DRAFT \d{8}-\d{4}\.docx$/);
    const liveGuide01 = path.join(liveDir, liveFiles[0]);

    const holdCli = runNode("build_qrgs.js", [
      "--set=UNIT1-INV",
      "--scratch",
      "--include-hold",
      "--only=Unit 1 Investigator 02 ",
    ], { cwd: dir });
    assert.equal(holdCli.status, 0, holdCli.stdout + holdCli.stderr);
    assert.match(holdCli.stdout, /Escalate a Case/);

    // 3. Hand-edit guard stops rebuilds over edited live files; --allow-rebuild-over-edits overrides.
    const future1 = new Date(Date.now() + 10_000);
    fs.utimesSync(liveGuide01, future1, future1);
    const guardStop = runNode("build_qrgs.js", [
      "--set=UNIT1-INV",
      "--only=Unit 1 Investigator 01 ",
    ], { cwd: dir });
    assert.equal(guardStop.status, 2, "expected hand-edit guard to stop with exit 2");
    assert.match(guardStop.stderr, /--allow-rebuild-over-edits/);

    const guardOverrideCli = runNode("build_qrgs.js", [
      "--set=UNIT1-INV",
      "--only=Unit 1 Investigator 01 ",
      "--allow-rebuild-over-edits",
    ], { cwd: dir });
    assert.equal(guardOverrideCli.status, 0, guardOverrideCli.stdout + guardOverrideCli.stderr);
    assert.match(guardOverrideCli.stdout, /GUARD OFF/);

    // 4. Backward-compatible environment variables still work identically.
    const envScratchHold = runNode("build_qrgs.js", ["--set=UNIT1-INV"], {
      cwd: dir,
      env: {
        ...process.env,
        QRG_SCRATCH: "1",
        QRG_ONLY: "Unit 1 Investigator 02 ",
        QRG_INCLUDE_HOLD: "1",
      },
    });
    assert.equal(envScratchHold.status, 0, envScratchHold.stdout + envScratchHold.stderr);
    assert.match(envScratchHold.stdout, /DONE \(scratch\)\. 1 guide\(s\)/);

    const refreshedLive01 = path.join(
      liveDir,
      fs.readdirSync(liveDir).find((f) => f.startsWith("Unit 1 Investigator 01 ") && f.endsWith(".docx"))
    );
    const future2 = new Date(Date.now() + 20_000);
    fs.utimesSync(refreshedLive01, future2, future2);
    const guardOverrideEnvLegacy = runNode("build_qrgs.js", ["--set=UNIT1-INV", "--only=Unit 1 Investigator 01 "], {
      cwd: dir,
      env: { ...process.env, ALLOW_REBUILD_OVER_EDITS: "1" },
    });
    assert.equal(guardOverrideEnvLegacy.status, 0, guardOverrideEnvLegacy.stdout + guardOverrideEnvLegacy.stderr);

    const future3 = new Date(Date.now() + 30_000);
    fs.utimesSync(refreshedLive01, future3, future3);
    const guardOverrideEnvPrefixed = runNode("build_qrgs.js", ["--set=UNIT1-INV", "--only=Unit 1 Investigator 01 "], {
      cwd: dir,
      env: { ...process.env, QRG_ALLOW_REBUILD_OVER_EDITS: "1" },
    });
    assert.equal(guardOverrideEnvPrefixed.status, 0, guardOverrideEnvPrefixed.stdout + guardOverrideEnvPrefixed.stderr);

    // 5. QA passes cleanly on the built worked example and writes qa_text_01.txt.
    const qaClean = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "01"], { cwd: dir });
    assert.equal(qaClean.status, 0, qaClean.stdout + qaClean.stderr);
    assert.match(qaClean.stdout, /RESULT: clean/);
    const qaTextPath = path.join(dir, "sets", "UNIT1-INV", "_work", "qa_text_01.txt");
    assert.equal(fs.existsSync(qaTextPath), true);
    assert.match(fs.readFileSync(qaTextPath, "utf8"), /Log a Call on a Case/);

    // 6. Google Docs lint self-test mutation suite passes all cases against the built worked example.
    const selftest = runNode("tools/gdocs_lint_selftest.js", [refreshedLive01]);
    assert.equal(selftest.status, 0, selftest.stdout + selftest.stderr);
    assert.match(selftest.stdout, /RESULT: all \d+ cases passed/);

    // 7. QA fails on broken content (TODO + date), A4 page size, and non-1-inch margins.
    const qaBadContent = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "02", "--scratch"], { cwd: dir });
    assert.equal(qaBadContent.status, 1);
    assert.match(qaBadContent.stdout, /session or build words: TODO/);
    assert.match(qaBadContent.stdout, /dates: 11\/19\/2026/);

    const cleanBuf = fs.readFileSync(refreshedLive01);
    const makeMutatedCopy = async (name, mutateDocXml) => {
      const zip = await JSZip.loadAsync(cleanBuf);
      const xml = await zip.file("word/document.xml").async("string");
      const mutated = mutateDocXml(xml);
      assert.notEqual(mutated, xml, "mutation did not change word/document.xml");
      zip.file("word/document.xml", mutated);
      const outPath = path.join(dir, "_work_mut", name);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, await zip.generateAsync({ type: "nodebuffer" }));
      return outPath;
    };

    const a4DocPath = await makeMutatedCopy(path.basename(refreshedLive01), (xml) =>
      xml.replace(/<w:pgSz w:w="12240" w:h="15840"/, '<w:pgSz w:w="11906" w:h="16838"')
    );
    const qaA4 = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "--file=" + a4DocPath], { cwd: dir });
    assert.equal(qaA4.status, 1);
    assert.match(qaA4.stdout, /FAIL google page-size/);

    const narrowMarginPath = await makeMutatedCopy(path.basename(refreshedLive01), (xml) =>
      xml.replace(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/, '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"')
    );
    const qaMargin = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "--file=" + narrowMarginPath], { cwd: dir });
    assert.equal(qaMargin.status, 1);
    assert.match(qaMargin.stdout, /US Letter margins/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Numbered-step detection uses word/numbering.xml metadata rather than keepNext serialization quirks, and docx 8.5.0 pin rationale is documented", async () => {
  const docxHelpers = require(path.join(KIT, "lib", "docx_helpers.js"));
  const { dir } = seedExampleProject();
  try {
    // Modify guide 01 to include a bullet with keepNext: true AND a trailing numbered step after Figure 2.
    const guide01Path = path.join(dir, "sets", "UNIT1-INV", "guides", "01.js");
    const origGuide = fs.readFileSync(guide01Path, "utf8");
    const updatedGuide = origGuide
      .replace(
        'b.push(bullet("Have your notes from the call at hand."));',
        'b.push(bullet("Have your notes from the call at hand.", 0, { keepNext: true }));'
      )
      .replace(
        'b.push(callout("Log the call while it is fresh.',
        'b.push(num("Confirm the saved call appears in the activity list."));\n      b.push(callout("Log the call while it is fresh.'
      );
    assert.notEqual(updatedGuide, origGuide);
    fs.writeFileSync(guide01Path, updatedGuide);

    const built = runNode("build_qrgs.js", ["--set=UNIT1-INV", "--scratch"], { cwd: dir });
    assert.equal(built.status, 0, built.stdout + built.stderr);

    const scratchDir = path.join(dir, "sets", "UNIT1-INV", "_work", "scratch");
    const scratchDocx = path.join(
      scratchDir,
      fs.readdirSync(scratchDir).find((f) => f.endsWith(".docx"))
    );

    // QA must count exactly 6 numbered steps (not 7 from the keepNext bullet) and pass clean.
    const qaClean = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "01", "--scratch"], { cwd: dir });
    assert.equal(qaClean.status, 0, qaClean.stdout + qaClean.stderr);
    assert.match(qaClean.stdout, /steps: 6;/);
    assert.match(qaClean.stdout, /RESULT: clean/);

    // Verify packed XML: steps before figures have <w:keepNext/>, and the trailing step has no keepNext="false" quirk.
    const cleanBuf = fs.readFileSync(scratchDocx);
    const cleanZip = await JSZip.loadAsync(cleanBuf);
    const cleanXml = await cleanZip.file("word/document.xml").async("string");
    const cleanNum = await cleanZip.file("word/numbering.xml").async("string");
    assert.equal(cleanXml.includes('<w:keepNext w:val="false"/>'), false, "num() should not rely on keepNext w:val=\"false\"");

    const decimalMap = docxHelpers.decimalNumberingLevels(cleanNum);
    const paras = cleanXml.split(/(?=<w:p>|<w:p )/);
    const trailingStep = paras.find((p) => p.includes("Confirm the saved call appears"));
    assert.ok(trailingStep);
    assert.equal(docxHelpers.isNumberedStep(trailingStep, decimalMap), true);
    assert.equal(docxHelpers.hasKeepNext(trailingStep), false);

    const keepBullet = paras.find((p) => p.includes("Have your notes from the call at hand."));
    assert.ok(keepBullet);
    assert.equal(docxHelpers.isNumberedStep(keepBullet, decimalMap), false, "bullet with keepNext: true must not be classified as a numbered step");

    // Mutate a step immediately before Figure 1 by completely deleting <w:keepNext/> (no keepNext tag at all).
    // QA must STILL recognize it as a numbered step via numbering.xml and fail.
    const stepBeforeFig1 = paras.find((p) => p.includes("Click ") && p.includes("Log a Call") && p.includes("<w:numPr>"));
    assert.ok(stepBeforeFig1 && stepBeforeFig1.includes("<w:keepNext/>"));
    const strippedStep = stepBeforeFig1.replace(/<w:keepNext\/>/g, "");
    const strippedXml = cleanXml.replace(stepBeforeFig1, strippedStep);
    assert.notEqual(strippedXml, cleanXml);

    const mutZip1 = await JSZip.loadAsync(cleanBuf);
    mutZip1.file("word/document.xml", strippedXml);
    const mutPath1 = path.join(dir, "_work_step_mut1", path.basename(scratchDocx));
    fs.mkdirSync(path.dirname(mutPath1), { recursive: true });
    fs.writeFileSync(mutPath1, await mutZip1.generateAsync({ type: "nodebuffer" }));

    const qaMissingKeepNext = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "--file=" + mutPath1], { cwd: dir });
    assert.equal(qaMissingKeepNext.status, 1, "QA must fail when a step before a figure has no keepNext tag at all");
    assert.match(qaMissingKeepNext.stdout, /steps: 6;/);
    assert.match(qaMissingKeepNext.stdout, /1 step\(s\) just before a figure are not kept with it/);

    // Mutate the trailing step (which has no keepNext tag) by removing <w:keepLines/>; QA must still catch it.
    const noKeepLinesStep = trailingStep.replace(/<w:keepLines\/>/g, "");
    const noKeepLinesXml = cleanXml.replace(trailingStep, noKeepLinesStep);
    assert.notEqual(noKeepLinesXml, cleanXml);

    const mutZip2 = await JSZip.loadAsync(cleanBuf);
    mutZip2.file("word/document.xml", noKeepLinesXml);
    const mutPath2 = path.join(dir, "_work_step_mut2", path.basename(scratchDocx));
    fs.mkdirSync(path.dirname(mutPath2), { recursive: true });
    fs.writeFileSync(mutPath2, await mutZip2.generateAsync({ type: "nodebuffer" }));

    const qaMissingKeepLines = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "--file=" + mutPath2], { cwd: dir });
    assert.equal(qaMissingKeepLines.status, 1, "QA must fail when a numbered step lacks keepLines");
    assert.match(qaMissingKeepLines.stdout, /1 step\(s\) can split across pages \(no keepLines\)/);

    // pack() also upgrades explicit keepNext: false on a decimal step before a figure to <w:keepNext/>.
    const assetDir = path.join(dir, "sets", "UNIT1-INV", "assets");
    const H = docxHelpers.makeHelpers(
      {
        author: "Change Management",
        page: "letter",
        font: "Calibri",
        palette: { accent: "C00000", heading: "8B0000", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
      },
      { assetsDir: assetDir }
    );
    const legacyStepDoc = H.makeDocument({
      docTitle: "Legacy Step Check",
      footerLeft: "Legacy Step Check",
      body: [
        new H.Paragraph({
          numbering: { reference: "steps", level: 0 },
          keepNext: false,
          keepLines: true,
          children: H.runs("Step serialized with explicit false keepNext."),
        }),
        ...H.afig("UNIT1INV01", "ex01_f01_logacall.png", "Figure 1. Legacy step figure (step 1).", 6.0),
      ],
    });
    const legacyBuf = await H.pack(legacyStepDoc);
    const legacyZip = await JSZip.loadAsync(legacyBuf);
    const legacyXml = await legacyZip.file("word/document.xml").async("string");
    const legacyPara = legacyXml.split(/(?=<w:p>|<w:p )/).find((p) => p.includes("Step serialized with explicit false keepNext."));
    assert.ok(legacyPara);
    assert.equal(docxHelpers.hasKeepNext(legacyPara), true);
    assert.equal(legacyPara.includes('w:val="false"'), false);

    // Confirm exact docx 8.5.0 pin rationale is documented in both lib/docx_helpers.js and README.md.
    const helpersSrc = fs.readFileSync(path.join(KIT, "lib", "docx_helpers.js"), "utf8");
    const readmeSrc = fs.readFileSync(path.join(KIT, "README.md"), "utf8");
    assert.match(helpersSrc, /8\.5\.0/);
    assert.match(readmeSrc, /8\.5\.0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
