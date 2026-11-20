"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const JSZip = require("jszip");
const mammoth = require("mammoth");
const { lintDocx } = require("../tools/gdocs_lint");
const { discoverRenderer, renderDocxToImages } = require("../lib/render");

const KIT = path.resolve(__dirname, "..");
const SKILL = path.resolve(KIT, "..");

function makeTempDir(prefix = "qrg-ticket7-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function walkFiles(dir, skip = new Set(["node_modules", "_work", "_archive", "_archive_backups", ".git"])) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, skip));
    else out.push(full);
  }
  return out;
}

function runNode(scriptAbs, args = [], opts = {}) {
  return spawnSync(process.execPath, [scriptAbs, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

test("Every Kit script is free of hardcoded ~/.claude/skills/ paths, Git Bash assumptions, and em/en dashes", () => {
  const jsFiles = walkFiles(KIT, new Set(["node_modules", "_work", "_archive", "_archive_backups", ".git", "test"]))
    .filter((f) => f.endsWith(".js"));
  assert.ok(jsFiles.length >= 20, "expected Kit .js scripts to inspect");

  const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  const claudePathRe = /~\/\.claude\/skills|\.claude[\\/]skills/i;
  const gitBashRe = /Git Bash/i;

  const violations = [];
  for (const file of jsFiles) {
    const rel = path.relative(SKILL, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    if (claudePathRe.test(text)) violations.push(rel + ": hardcoded .claude/skills path");
    if (gitBashRe.test(text)) violations.push(rel + ": Git Bash assumption");
    if (dashRe.test(text)) violations.push(rel + ": em or en dash");
  }
  assert.deepEqual(violations, [], "Kit script portability violations:\n" + violations.join("\n"));
});

test("pack_skill auto-detects Skill root from any cwd, excludes repo engineering docs and node_modules, and enforces dash/word checks", async () => {
  const outDir = makeTempDir("qrg-pack-");
  const outsideCwd = makeTempDir("qrg-pack-cwd-");
  const packScript = path.join(KIT, "scripts", "pack_skill.js");

  try {
    // 1. Clean pack from an unrelated working directory.
    const cleanProbeWord = ["FakeClient", "NameXYZ"].join("");
    const r = runNode(packScript, [outDir, "--words=" + cleanProbeWord], { cwd: outsideCwd });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /check clean: no dashes/);
    assert.doesNotMatch(r.stdout, /\.claude\/skills/i, "pack_skill output must not hardcode ~/.claude/skills/");

    const zips = fs.readdirSync(outDir).filter((f) => f.endsWith(".zip"));
    assert.equal(zips.length, 1, "expected exactly one packaged zip");
    const zipPath = path.join(outDir, zips[0]);
    const manifestPath = zipPath.replace(/[.]zip$/, ".json");
    assert.equal(fs.existsSync(manifestPath), true, "expected companion manifest json");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.kitVersion, "2.0.0");
    assert.ok(Array.isArray(manifest.files) && manifest.files.length > 30);

    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
    const entryNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    assert.ok(entryNames.length > 30, "expected packaged Skill files inside zip");
    assert.ok(entryNames.every((n) => n.startsWith("qrg-builder/")), "every zip entry must live under qrg-builder/");
    assert.ok(entryNames.includes("qrg-builder/SKILL.md"));
    assert.ok(entryNames.includes("qrg-builder/references/setup_for_teammates.md"));
    assert.ok(entryNames.includes("qrg-builder/kit/package.json"));
    assert.ok(entryNames.includes("qrg-builder/kit/scripts/review_ui.js"));

    // Must exclude repo-level engineering docs and node_modules.
    const forbidden = entryNames.filter(
      (n) =>
        /(?:^|\/)(AGENTS\.md|GLOSSARY\.md|node_modules|_work|_archive|\.git)(?:\/|$)/i.test(n) ||
        /^docs\//i.test(n) ||
        /^qrg-builder\/docs\//i.test(n)
    );
    assert.deepEqual(forbidden, [], "forbidden entries found in Skill zip: " + forbidden.join(", "));

    // 2. Banned word check blocks zip creation without --force.
    const blockedDir = makeTempDir("qrg-pack-blocked-");
    try {
      const rBlocked = runNode(packScript, [blockedDir, "--words=Calibri"], { cwd: outsideCwd });
      assert.equal(rBlocked.status, 1, "expected banned word match to fail with exit 1");
      assert.match(rBlocked.stdout, /word Calibri/i);
      assert.equal(fs.readdirSync(blockedDir).length, 0, "blocked pack must not write a zip");
    } finally {
      fs.rmSync(blockedDir, { recursive: true, force: true });
    }

    // 3. Running from a project qrg_kit copy (without SKILL.md above it) refuses with tool-agnostic message.
    const projDir = makeTempDir("qrg-pack-proj-");
    try {
      const init = runNode(path.join(KIT, "scripts", "init_project.js"), [
        "--dir=" + projDir,
        "--project=Pack Test",
        "--set=UNIT1-INV",
        "--label=Unit 1 Investigator",
      ]);
      assert.equal(init.status, 0, init.stdout + init.stderr);
      const copiedPack = path.join(projDir, "qrg_kit", "scripts", "pack_skill.js");
      // Link node_modules from KIT only if needed; config.js checks node_modules/docx.
      fs.symlinkSync(path.join(KIT, "node_modules"), path.join(projDir, "qrg_kit", "node_modules"), "dir");
      const rCopied = runNode(copiedPack, [outDir], { cwd: projDir });
      assert.equal(rCopied.status, 2, rCopied.stdout + rCopied.stderr);
      assert.match(rCopied.stderr, /STOP:/);
      assert.doesNotMatch(rCopied.stderr, /\.claude\/skills/i, "error message must not hardcode ~/.claude/skills/");
    } finally {
      fs.rmSync(projDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});

test("Skill and Kit markdown docs are OS-agnostic, AI-tool-agnostic, v2-accurate, and free of em/en dashes", () => {
  const mdFiles = walkFiles(SKILL).filter((f) => f.endsWith(".md"));
  assert.ok(mdFiles.length >= 10, "expected Skill and Kit markdown docs");

  const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
  const violations = [];

  for (const file of mdFiles) {
    const rel = path.relative(SKILL, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    if (dashRe.test(text)) violations.push(rel + ": em or en dash");
    if (/~\/\.claude\/skills/i.test(text)) violations.push(rel + ": hardcoded ~/.claude/skills/ path");
    if (/\bword_proof\.ps1\b|\bpdf_to_png\.ps1\b/i.test(text)) violations.push(rel + ": references removed v1 PowerShell script");
    if (/\bNode(?:\.js)?\s+20\b/i.test(text)) violations.push(rel + ": stale Node 20 requirement");
    if (/QRG_SCRATCH=1\s+QRG_ONLY=/i.test(text)) violations.push(rel + ": Bash-only env var command prefix");
  }
  assert.deepEqual(violations, [], "Markdown doc violations:\n" + violations.join("\n"));
});

test("SKILL.md, content_rules.md, setup_for_teammates.md, and review_and_release.md satisfy v2.0.0 coverage and date-rule consistency", () => {
  const skillMd = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  const contentRules = fs.readFileSync(path.join(SKILL, "references", "content_rules.md"), "utf8");
  const setupMd = fs.readFileSync(path.join(SKILL, "references", "setup_for_teammates.md"), "utf8");
  const reviewMd = fs.readFileSync(path.join(SKILL, "references", "review_and_release.md"), "utf8");

  // Date-rule consistency: zero dates inside evergreen QRGs; MM/DD/YYYY only in logs, briefs, and state files.
  assert.doesNotMatch(skillMd, /MM\/DD\/YYYY in prose/i, "SKILL.md must not say MM/DD/YYYY in prose");
  assert.doesNotMatch(contentRules, /Dates in prose are\s+MM\/DD\/YYYY/i, "content_rules.md must not contradict evergreen date rule");
  assert.match(skillMd, /zero dates|no dates/i);
  assert.match(skillMd, /MM\/DD\/YYYY/);
  assert.match(contentRules, /no dates|zero dates/i);
  assert.match(contentRules, /MM\/DD\/YYYY/);

  // SKILL.md v2 capabilities: cross-platform, dual review surface, offline proofing + AI meaning review, Word-default + ask for PDF.
  assert.match(skillMd, /Node 22|Node\.js 22/i);
  assert.match(skillMd, /US Letter/i);
  assert.match(skillMd, /LibreOffice/i);
  assert.match(skillMd, /review_ui\.js/);
  assert.match(skillMd, /build_ok_list\.js/);
  assert.match(skillMd, /qa_dictionary\.txt/);
  assert.match(skillMd, /qa_text_NN\.txt/);
  assert.match(skillMd, /--with-pdf/);
  assert.match(skillMd, /--scratch/);
  assert.match(skillMd, /--only=/);
  assert.match(skillMd, /PDF/i);

  // setup_for_teammates.md: all 5 AI/CLI tools, zip + Git install, no-admin LibreOffice on Win/macOS/Linux, QRG_SOFFICE.
  for (const term of [
    /Claude Code/i,
    /Antigravity/i,
    /Codex/i,
    /Cursor/i,
    /CLI/i,
    /Git/i,
    /zip/i,
    /PortableApps|LibreOffice Portable/i,
    /soffice\.com/i,
    /~\/Applications/,
    /AppImage/i,
    /--appimage-extract-and-run/,
    /QRG_SOFFICE/,
    /render\.soffice/,
    /Windows/i,
    /macOS/i,
    /Linux/i,
  ]) {
    assert.match(setupMd, term, "setup_for_teammates.md missing expected coverage: " + term);
  }

  // review_and_release.md: dual review surface + Word-default with optional --with-pdf.
  assert.match(reviewMd, /review_ui\.js/);
  assert.match(reviewMd, /build_ok_list\.js/);
  assert.match(reviewMd, /--with-pdf/);
  assert.match(reviewMd, /review\.withPdf/);
});

test("Updated Team Playbook builds cleanly for v2.0.0, passes US Letter Google Docs lint, and renders via LibreOffice", async () => {
  const outDir = makeTempDir("qrg-playbook-");
  const outsideCwd = makeTempDir("qrg-playbook-cwd-");
  const script = path.join(KIT, "playbook", "build_playbook.js");
  try {
    const r = runNode(script, [outDir], { cwd: outsideCwd });
    assert.equal(r.status, 0, r.stdout + r.stderr);

    const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".docx"));
    assert.equal(files.length, 1, "expected one built Playbook .docx");
    const docxPath = path.join(outDir, files[0]);
    const buf = fs.readFileSync(docxPath);

    // Zero em/en dashes in XML.
    const zip = await JSZip.loadAsync(buf);
    const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".xml")) continue;
      const xml = await zip.files[name].async("string");
      assert.equal(dashRe.test(xml), false, "Playbook XML must not contain em/en dashes: " + name);
    }

    // Strict US Letter Google Docs lint (allowing Courier New for code blocks).
    const lint = await lintDocx(buf, { page: "letter", fullWidth: true, fonts: ["Calibri", "Courier New"] });
    const fails = lint.filter((x) => x.level === "FAIL");
    assert.deepEqual(fails, [], "Playbook gdocs_lint FAILs: " + JSON.stringify(fails));

    // v2.0.0 content checks.
    const text = (await mammoth.extractRawText({ buffer: buf })).value;
    for (const expected of [
      /Kit 2\.0\.0/,
      /Node\.js 22/i,
      /US Letter/i,
      /LibreOffice/i,
      /Portable/i,
      /AppImage/i,
      /Browser Review UI/i,
      /OK List/i,
      /qa_dictionary\.txt/i,
      /--with-pdf/,
      /--scratch/,
      /--only=/,
      /Claude Code/i,
      /Antigravity/i,
      /Codex/i,
      /Cursor/i,
      /Git/i,
      /MM\/DD\/YYYY/,
    ]) {
      assert.match(text, expected, "Playbook text missing expected v2 coverage: " + expected);
    }
    for (const forbidden of [
      /Node\.js 20/i,
      /Git Bash/i,
      /\.claude[\\/]skills/i,
      /QRG_SCRATCH=1/,
      /Word renders the guides/i,
    ]) {
      assert.doesNotMatch(text, forbidden, "Playbook text contains stale v1 wording: " + forbidden);
    }

    // Visual render via LibreOffice + pure-Node PNG.
    const renderer = discoverRenderer({ kitDir: KIT });
    assert.equal(renderer.kind, "libreoffice", "expected LibreOffice installed on test machine");
    const renderOut = path.join(outDir, "render");
    const res = await renderDocxToImages({
      docxPath,
      outDir: renderOut,
      baseName: "playbook",
      scale: 110,
      renderer,
    });
    assert.equal(res.ok, true, "Playbook render failed: " + JSON.stringify(res));
    assert.ok(res.pages >= 10 && res.pages <= 13, "expected Playbook to render around 11 pages, got " + res.pages);
    assert.equal(res.files.length, res.pages);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});

test("2-page Quick-Start QRG (Make QRGs with the QRG Builder Skill) builds cleanly, passes QA/lint, passes offline proofing, and renders as strictly 2 US Letter pages", async () => {
  const outDir = makeTempDir("qrg-quickstart-");
  const outsideCwd = makeTempDir("qrg-quickstart-cwd-");
  const script = path.join(KIT, "playbook", "build_quickstart_qrg.js");
  const { QUICKSTART_DICTIONARY, TITLE, FOOTER_TAG } = require("../playbook/build_quickstart_qrg");
  const { proofDocxFiles } = require("../lib/proof");
  const { decimalNumberingLevels, isNumberedStep, hasKeepLines } = require("../lib/docx_helpers");

  try {
    const outPath = path.join(outDir, "Quickstart.docx");
    const r = runNode(script, ["--out=" + outPath], { cwd: outsideCwd });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(fs.existsSync(outPath), true, "expected Quick-Start QRG .docx to be created");

    const buf = fs.readFileSync(outPath);
    const zip = await JSZip.loadAsync(buf);

    // 1. Zero em or en dashes in XML.
    const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".xml")) continue;
      const xml = await zip.files[name].async("string");
      assert.equal(dashRe.test(xml), false, "Quick-Start QRG XML must not contain em/en dashes: " + name);
    }

    // 2. Strict US Letter Google Docs lint with Calibri only (zero findings).
    const lint = await lintDocx(buf, { page: "letter", fullWidth: true, fonts: ["Calibri"] });
    assert.deepEqual(lint, [], "Quick-Start QRG gdocs_lint findings: " + JSON.stringify(lint));

    // 3. Standard QRG structure, US Letter geometry, continuous step list, and footer check.
    const docXml = await zip.file("word/document.xml").async("string");
    const paras = docXml.split(/(?=<w:p>|<w:p )/);
    const unxml = (s) =>
      s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
    const pText = (p) => unxml([...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""));

    const titleParas = paras.filter((p) => p.includes('<w:pStyle w:val="Title"/>')).map(pText);
    assert.deepEqual(titleParas, [TITLE]);

    const h1Paras = paras.filter((p) => p.includes('<w:pStyle w:val="Heading1"/>')).map(pText);
    assert.deepEqual(h1Paras, [
      "Purpose",
      "Who does this",
      "Before you start",
      "Steps",
      "What happens next",
      "Troubleshooting",
    ]);

    const numXml = await zip.file("word/numbering.xml").async("string");
    assert.equal(/<w:lvlOverride/.test(numXml), false, "numbering.xml must not retain lvlOverride");
    const decimalMap = decimalNumberingLevels(numXml);
    const stepParas = paras.filter((p) => isNumberedStep(p, decimalMap));
    assert.ok(stepParas.length >= 10, "expected numbered steps in Quick-Start QRG");
    assert.equal(
      stepParas.every((p) => hasKeepLines(p)),
      true,
      "every numbered step must have keepLines"
    );

    const footerXml = await zip.file("word/footer1.xml").async("string");
    const midDot = String.fromCharCode(0x00b7);
    assert.ok(pText(footerXml).startsWith(TITLE + "  " + midDot + "  " + FOOTER_TAG), "footer must carry title and tag");
    assert.equal(/<w:tab\/>/.test(footerXml), true, "footer must use a real tab element");

    // 4. QRG text rules: zero dates, zero session words, zero banned style words.
    const raw = (await mammoth.extractRawText({ buffer: buf })).value;
    assert.equal(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(raw), false, "Quick-Start QRG must contain zero dates");
    assert.equal(
      /\b(Day [1-9]|session|training|recording|walkthrough|sandbox|UAT|TBD|TBC|TODO|FIXME|to be confirmed|CHECK BEFORE|dry run|facilitator|trainer|trainee|last updated)\b/i.test(
        raw
      ),
      false,
      "Quick-Start QRG must contain zero session or placeholder words"
    );
    assert.equal(
      /\b(organis|colour|towards|behaviour|favour|grey|tick|untick|leverage|robust|seamless|delve|elevate|unlock|tapestry)\w*/i.test(
        raw
      ),
      false,
      "Quick-Start QRG must contain zero banned style words"
    );

    // 5. Offline proofing via harper.js with zero spelling/grammar errors.
    const proofIssues = await proofDocxFiles([outPath], { dictionary: QUICKSTART_DICTIONARY });
    assert.deepEqual(proofIssues, [], "Quick-Start QRG offline proofing issues: " + JSON.stringify(proofIssues));

    // 6. Visual render via LibreOffice + pure-Node PNG: STRICTLY 2 US Letter pages.
    const renderer = discoverRenderer({ kitDir: KIT });
    assert.equal(renderer.kind, "libreoffice", "expected LibreOffice installed on test machine");
    const renderOut = path.join(outDir, "render");
    const res = await renderDocxToImages({
      docxPath: outPath,
      outDir: renderOut,
      baseName: "quickstart",
      scale: 110,
      renderer,
    });
    assert.equal(res.ok, true, "Quick-Start QRG render failed: " + JSON.stringify(res));
    assert.equal(res.pages, 2, "Quick-Start QRG must render as strictly 2 US Letter pages, got " + res.pages);
    assert.equal(res.files.length, 2);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});
