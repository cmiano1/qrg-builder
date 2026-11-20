"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const KIT = path.resolve(__dirname, "..");

function makeTempDir(prefix = "qrg-proof-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runNode(scriptRel, args = [], opts = {}) {
  const scriptPath = path.isAbsolute(scriptRel) ? scriptRel : path.join(KIT, scriptRel);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

test("harper.js is exact-pinned, word_proof.ps1 is removed, and check_kit verifies harper.js loads cleanly", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8"));
  const harperSpec = pkg.dependencies && pkg.dependencies["harper.js"];
  assert.ok(harperSpec, "expected harper.js in dependencies");
  assert.match(harperSpec, /^\d+\.\d+\.\d+$/, "harper.js must be exact-pinned without ^ or ~");
  assert.equal(pkg.dependencies && pkg.dependencies.docx, "8.5.0", "docx exact pin must be preserved");

  assert.equal(
    fs.existsSync(path.join(KIT, "tools", "word_proof.ps1")),
    false,
    "Windows-only tools/word_proof.ps1 must be removed"
  );

  const check = runNode("scripts/check_kit.js");
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /ok\s+harper\.js loads/i);
  assert.doesNotMatch(check.stdout, /proofing are off/i);
  assert.match(check.stdout, /RESULT: kit ready/);
});

test("init_project seeds qa_dictionary.txt without overwriting, and config loads qa.dictionary plus qa.dictionaryFile", () => {
  const { loadConfig } = require(path.join(KIT, "lib", "config.js"));
  const dir = makeTempDir("qrg-dict-init-");
  try {
    const r1 = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--project=Dict Pilot",
      "--set=UNIT1-INV",
      "--label=Unit 1 Investigator",
      "--kit=skill",
    ]);
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);

    const dictPath = path.join(dir, "qa_dictionary.txt");
    assert.equal(fs.existsSync(dictPath), true, "expected init_project to seed qa_dictionary.txt");
    const seededText = fs.readFileSync(dictPath, "utf8");
    assert.match(seededText, /^#/m, "expected seeded qa_dictionary.txt to include # comment lines");

    const cfgPath = path.join(dir, "qrg.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    assert.deepEqual(cfg.qa.dictionary, []);
    assert.equal(cfg.qa.dictionaryFile, "qa_dictionary.txt");

    // Populate qa_dictionary.txt with UTF-8 BOM, comments, blank lines, and domain terms, plus config list.
    fs.writeFileSync(
      dictPath,
      String.fromCharCode(0xfeff) + "# Approved product names and UI labels\n\nZyxelWidget\n  OmniDesk  \n# ignored comment\nCaseTrack\n",
      "utf8"
    );
    cfg.qa.dictionary = ["CaseTrack", "AcmeFlow Sync"];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

    const loaded = loadConfig(["node", "test", "--config=" + cfgPath]);
    assert.deepEqual(loaded.dictionary, ["CaseTrack", "AcmeFlow Sync", "ZyxelWidget", "OmniDesk"]);

    // Adding a second Set preserves existing qa_dictionary.txt untouched.
    const r2 = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--set=UNIT1-SUP",
      "--label=Unit 1 Supervisor",
      "--kit=skill",
    ]);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    assert.match(r2.stdout, /SKIPPED \(exists\) qa_dictionary\.txt/);
    assert.match(fs.readFileSync(dictPath, "utf8"), /ZyxelWidget/);

    // Custom qa.dictionaryFile path is respected.
    const customDict = path.join(dir, "custom_terms.txt");
    fs.writeFileSync(customDict, "# custom path\nVortexPortal\n", "utf8");
    cfg.qa.dictionaryFile = "custom_terms.txt";
    cfg.qa.dictionary = [];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

    const loadedCustom = loadConfig(["node", "test", "--config=" + cfgPath]);
    assert.deepEqual(loadedCustom.dictionary, ["VortexPortal"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("proof_guides flags real spelling and grammar errors offline, preserves advisory JSON contract, and suppresses project custom dictionary terms", () => {
  const dir = makeTempDir("qrg-proof-e2e-");
  try {
    const init = runNode("scripts/init_project.js", [
      "--dir=" + dir,
      "--project=Proof Pilot",
      "--set=UNIT1-INV",
      "--label=Unit 1 Investigator",
      "--unit-line=Unit 1 | Investigator",
      "--kit=skill",
    ]);
    assert.equal(init.status, 0, init.stdout + init.stderr);

    const ex = runNode("scripts/new_guide.js", ["--set=UNIT1-INV", "--example"], { cwd: dir });
    assert.equal(ex.status, 0, ex.stdout + ex.stderr);

    // Add Guide Source 02 with deliberate spelling errors, grammar errors, and client UI terms.
    const guide02Path = path.join(dir, "sets", "UNIT1-INV", "guides", "02.js");
    fs.writeFileSync(guide02Path, [
      "module.exports = (H) => {",
      "  const { h2, para, num, bullet, callout, refTable, titleBlock } = H;",
      "  return {",
      '    title: "Review an Escalation",',
      '    subtitle: "Check a Flagged Record",',
      "    build() {",
      "      return [",
      "        ...titleBlock(this.title, this.subtitle),",
      '        h2("Purpose"),',
      '        para("This sentance has a speling mistake. Open an case in ZyxelWidget to continue."),',
      '        h2("Who does this"),',
      '        bullet("Case Workers who monitor escalations."),',
      '        h2("Before you start"),',
      '        bullet("Sign in to **AcmeFlow Sync** before opening the queue."),',
      '        h2("Steps"),',
      '        num("Click the the **Save** button to store your changes."),',
      '        num("Check whether **Their** is an alert in the banner."),',
      '        callout("Use **Vortex-Hub** when reviewing urgent records.", "tip"),',
      '        h2("What happens next"),',
      '        para("The record updates in the activity list."),',
      '        h2("Troubleshooting"),',
      '        refTable(["Situation", "What to do"], [["Record missing", "Refresh the browser window."]], [3400, 5800]),',
      "      ];",
      "    },",
      "  };",
      "};",
      "",
    ].join("\n"));

    const build = runNode("build_qrgs.js", ["--set=UNIT1-INV"], { cwd: dir });
    assert.equal(build.status, 0, build.stdout + build.stderr);

    // 1. Clean worked example guide 01 proofs with 0 flags and exits 0.
    const proofClean = runNode("scripts/proof_guides.js", ["--set=UNIT1-INV", "01"], { cwd: dir });
    assert.equal(proofClean.status, 0, proofClean.stdout + proofClean.stderr);
    const cleanOutMatch = proofClean.stdout.match(/files 1; flags 0 \((.+\.json)\)/);
    assert.ok(cleanOutMatch, "expected clean summary with JSON path, got:\n" + proofClean.stdout);
    const cleanJsonPath = cleanOutMatch[1];
    assert.equal(path.dirname(cleanJsonPath), path.join(dir, "review", "_work"));
    assert.deepEqual(JSON.parse(fs.readFileSync(cleanJsonPath, "utf8")), []);

    // 2. Guide 02 flags real spelling errors, grammar errors, and unapproved domain terms, yet still exits 0 (advisory).
    const proofDirty = runNode("scripts/proof_guides.js", ["--set=UNIT1-INV", "02"], { cwd: dir });
    assert.equal(proofDirty.status, 0, "proofing must stay advisory (exit 0) even when flags exist: " + proofDirty.stderr);
    const dirtyOutMatch = proofDirty.stdout.match(/files 1; flags (\d+) \((.+\.json)\)/);
    assert.ok(dirtyOutMatch, "expected summary line with report path, got:\n" + proofDirty.stdout);
    const dirtyJsonPath = dirtyOutMatch[2];
    const rowsBefore = JSON.parse(fs.readFileSync(dirtyJsonPath, "utf8"));
    assert.equal(rowsBefore.length, Number(dirtyOutMatch[1]));
    assert.ok(rowsBefore.length >= 6, "expected multiple spelling and grammar flags, got: " + JSON.stringify(rowsBefore));

    const liveDir = path.join(dir, "QRGs", "Unit 1 Investigator");
    const guide02File = fs.readdirSync(liveDir).find((f) => f.startsWith("Unit 1 Investigator 02 ") && f.endsWith(".docx"));
    assert.ok(guide02File);

    for (const row of rowsBefore) {
      assert.deepEqual(Object.keys(row).sort(), ["file", "kind", "sentence", "text"]);
      assert.equal(row.file, guide02File);
      assert.ok(row.kind === "spelling" || row.kind === "grammar", "unexpected kind: " + row.kind);
      assert.equal(typeof row.text, "string");
      assert.ok(row.text.trim().length > 0);
      assert.equal(typeof row.sentence, "string");
      assert.ok(row.sentence.trim().length > 0);
    }

    const spellingBefore = rowsBefore.filter((r) => r.kind === "spelling");
    const grammarBefore = rowsBefore.filter((r) => r.kind === "grammar");
    assert.ok(spellingBefore.some((r) => r.text === "sentance"), "expected spelling flag for sentance");
    assert.ok(spellingBefore.some((r) => r.text === "speling"), "expected spelling flag for speling");
    assert.ok(spellingBefore.some((r) => r.text === "ZyxelWidget"), "expected domain term ZyxelWidget to be flagged before dictionary update");
    assert.ok(spellingBefore.some((r) => r.text === "AcmeFlow"), "expected domain term AcmeFlow to be flagged before dictionary update");
    assert.ok(grammarBefore.some((r) => r.text === "an"), "expected grammar flag for incorrect indefinite article 'an'");
    assert.ok(grammarBefore.some((r) => r.text === "the the"), "expected grammar flag for repeated word 'the the'");

    // Sentence context should isolate the containing sentence rather than dumping the entire paragraph.
    const sentanceFlag = spellingBefore.find((r) => r.text === "sentance");
    assert.equal(sentanceFlag.sentence, "This sentance has a speling mistake.");

    // Stdout prints readable lines for both spelling and grammar flags.
    assert.match(proofDirty.stdout, /^\s+spelling \| .* \| sentance \| in: This sentance has a speling mistake\./m);
    assert.match(proofDirty.stdout, /^\s+grammar \| .* \| the the \| in: /m);

    // 3. Add domain terms to qa_dictionary.txt and qrg.config.json qa.dictionary, then re-proof via explicit .docx path.
    fs.appendFileSync(path.join(dir, "qa_dictionary.txt"), "ZyxelWidget\nVortex-Hub\n", "utf8");
    const cfgPath = path.join(dir, "qrg.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.qa.dictionary = ["AcmeFlow Sync"];
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

    const proofAfterDict = runNode("scripts/proof_guides.js", [path.join(liveDir, guide02File)], { cwd: dir });
    assert.equal(proofAfterDict.status, 0, proofAfterDict.stdout + proofAfterDict.stderr);
    const afterMatch = proofAfterDict.stdout.match(/files 1; flags (\d+) \((.+\.json)\)/);
    assert.ok(afterMatch, proofAfterDict.stdout);
    const rowsAfter = JSON.parse(fs.readFileSync(afterMatch[2], "utf8"));

    // Custom dictionary terms are no longer flagged.
    assert.equal(rowsAfter.some((r) => /ZyxelWidget|AcmeFlow|Vortex/i.test(r.text)), false,
      "custom dictionary words should be suppressed, got: " + JSON.stringify(rowsAfter));

    // Real spelling and grammar mistakes are still caught.
    assert.ok(rowsAfter.some((r) => r.kind === "spelling" && r.text === "sentance"));
    assert.ok(rowsAfter.some((r) => r.kind === "spelling" && r.text === "speling"));
    assert.ok(rowsAfter.some((r) => r.kind === "grammar" && r.text === "an"));
    assert.ok(rowsAfter.some((r) => r.kind === "grammar" && r.text === "the the"));

    // 4. Missing/unmatched guide selection exits 2 with usage text.
    const usage = runNode("scripts/proof_guides.js", ["--set=UNIT1-INV", "99"], { cwd: dir });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /usage:/i);

    // 5. Batch proofing an entire Set (--set=UNIT1-INV) processes all live guides in one run.
    const batch = runNode("scripts/proof_guides.js", ["--set=UNIT1-INV"], { cwd: dir });
    assert.equal(batch.status, 0, batch.stdout + batch.stderr);
    const batchMatch = batch.stdout.match(/files 2; flags (\d+) \((.+\.json)\)/);
    assert.ok(batchMatch, "expected batch summary for 2 files, got:\n" + batch.stdout);
    const batchRows = JSON.parse(fs.readFileSync(batchMatch[2], "utf8"));
    assert.equal(batchRows.length, Number(batchMatch[1]));
    assert.ok(batchRows.length > 0);
    assert.equal(batchRows.every((r) => r.file === guide02File), true, "only guide 02 should have flags in batch");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("docx paragraph and sentence extraction handles self-closing tags, breaks, tracked deletions, callout prefixes, and non-BMP Unicode", async () => {
  const JSZip = require("jszip");
  const { extractParagraphs, extractSentence } = require(path.join(KIT, "lib", "proof.js"));

  const zip = new JSZip();
  zip.file("word/document.xml", [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    '<w:p w:rsidR="0001"/><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell one</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:p><w:r><w:t>Click</w:t><w:br></w:br><w:t>Save</w:t></w:r><w:del><w:r><w:delText>badtypo</w:delText></w:r></w:del></w:p>',
    '<w:p><w:r><w:t xml:space="preserve">TIP  </w:t></w:r><w:r><w:t>Review &amp; confirm &quot;Status&quot;.</w:t></w:r></w:p>',
    '<w:p><w:r><w:t xml:space="preserve"/><w:t>Final line.</w:t></w:r></w:p>',
    "</w:body></w:document>",
  ].join(""));
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const paras = await extractParagraphs(buf);
  assert.deepEqual(paras, [
    "Cell one",
    "Click Save",
    'Review & confirm "Status".',
    "Final line.",
  ]);

  // Verify non-BMP character (surrogate pair = 1 Unicode scalar in Rust/Harper Span, 2 UTF-16 code units in JS).
  const text = "\u{1F4CC} First sentence. Open an case now. Last sentence.";
  const chars = Array.from(text);
  const anIdx = chars.join("").indexOf("an") - 1; // index in Unicode code points (1 less than UTF-16 offset)
  assert.equal(chars.slice(anIdx, anIdx + 2).join(""), "an");
  assert.equal(extractSentence(text, anIdx, anIdx + 2), "Open an case now.");
});
