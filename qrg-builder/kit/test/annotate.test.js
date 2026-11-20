"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { PNG } = require("pngjs");

const KIT = path.resolve(__dirname, "..");
const ANNOTATE_SCRIPT = path.join(KIT, "tools", "annotate_screenshot.js");

function makeTempDir(prefix = "qrg-annotate-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSolidPng(filePath, width, height, [r, g, b] = [245, 245, 245]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function countColorPixels(png, region, targetHex, tolerance = 8) {
  const [tr, tg, tb] = hexToRgb(targetHex);
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const x1 = Math.min(png.width, region.x + region.w);
  const y1 = Math.min(png.height, region.y + region.h);
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * png.width + x) * 4;
      const dr = Math.abs(png.data[idx] - tr);
      const dg = Math.abs(png.data[idx + 1] - tg);
      const db = Math.abs(png.data[idx + 2] - tb);
      if (dr <= tolerance && dg <= tolerance && db <= tolerance) count++;
    }
  }
  return count;
}

function runAnnotate(args, opts = {}) {
  return spawnSync(process.execPath, [ANNOTATE_SCRIPT, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

test("annotate_screenshot auto-discovers qrg.config.json from manifest directory and draws box and badge in palette.accent", () => {
  const root = makeTempDir();
  const outsideCwd = makeTempDir("qrg-outside-cwd-");
  try {
    // qrg.config.json stores hex WITHOUT leading "#"
    fs.writeFileSync(
      path.join(root, "qrg.config.json"),
      JSON.stringify({
        project: "Teal Brand Pilot",
        page: "letter",
        palette: { accent: "007A87" },
      }, null, 2) + "\n"
    );

    const assetDir = path.join(root, "sets", "UNIT1-INV", "assets", "UNIT1INV01");
    writeSolidPng(path.join(assetDir, "src", "screen.png"), 600, 400);

    const manifestPath = path.join(assetDir, "annotate.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        displayWidth: 600,
        badgeIn: 0.24,
        figures: [
          {
            src: "screen.png",
            out: "fig01.png",
            printIn: 6.5,
            boxes: [{ x: 120, y: 120, w: 200, h: 80, n: 1, badge: "tl" }],
          },
        ],
      }, null, 2) + "\n"
    );

    // Run from an unrelated cwd so discovery must walk up from the manifest's directory.
    const r = runAnnotate([manifestPath], { cwd: outsideCwd });
    assert.equal(r.status, 0, r.stdout + r.stderr);

    const outPng = PNG.sync.read(fs.readFileSync(path.join(assetDir, "out", "fig01.png")));
    assert.equal(outPng.width, 1200);
    assert.equal(outPng.height, 800);

    // Box top edge sits around x=240..640, y=240 (upscaled 2x); badge sits top-left of (240, 240).
    const boxEdgeRegion = { x: 300, y: 230, w: 280, h: 20 };
    const badgeRegion = { x: 160, y: 160, w: 80, h: 80 };

    assert.ok(
      countColorPixels(outPng, boxEdgeRegion, "#007A87") > 200,
      "expected callout box stroke to be drawn in configured palette.accent #007A87"
    );
    assert.ok(
      countColorPixels(outPng, badgeRegion, "#007A87") > 200,
      "expected numbered step badge to be filled in configured palette.accent #007A87"
    );
    assert.equal(
      countColorPixels(outPng, { x: 0, y: 0, w: outPng.width, h: outPng.height }, "#C8122C"),
      0,
      "expected zero hardcoded #C8122C red pixels when palette.accent is configured"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});

test("annotate_screenshot respects manifest accent override, CLI --color/--accent overrides, and --config discovery", () => {
  const root = makeTempDir();
  const altDir = makeTempDir("qrg-alt-cfg-");
  try {
    fs.writeFileSync(
      path.join(root, "qrg.config.json"),
      JSON.stringify({ project: "Config Purple", page: "letter", palette: { accent: "6A1B9A" } }, null, 2) + "\n"
    );
    const altCfgPath = path.join(altDir, "custom.config.json");
    fs.writeFileSync(
      altCfgPath,
      JSON.stringify({ project: "Alt Green", page: "letter", palette: { accent: "#2E7D32" } }, null, 2) + "\n"
    );

    const assetDir = path.join(root, "sets", "DEMO", "assets", "DEMO01");
    writeSolidPng(path.join(assetDir, "src", "screen.png"), 600, 400);

    const boxEdgeRegion = { x: 300, y: 230, w: 280, h: 20 };
    const badgeRegion = { x: 160, y: 160, w: 80, h: 80 };
    const manifestPath = path.join(assetDir, "annotate.json");

    // 1. Explicit --config=<path> overrides auto-discovered qrg.config.json.
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        displayWidth: 600,
        badgeIn: 0.24,
        figures: [{ src: "screen.png", out: "from_alt_cfg.png", printIn: 6.5, boxes: [{ x: 120, y: 120, w: 200, h: 80, n: 1, badge: "tl" }] }],
      }, null, 2) + "\n"
    );
    const rAltCfg = runAnnotate([manifestPath, "--config=" + altCfgPath], { cwd: altDir });
    assert.equal(rAltCfg.status, 0, rAltCfg.stdout + rAltCfg.stderr);
    const altPng = PNG.sync.read(fs.readFileSync(path.join(assetDir, "out", "from_alt_cfg.png")));
    assert.ok(countColorPixels(altPng, boxEdgeRegion, "#2E7D32") > 200, "expected --config palette.accent #2E7D32 on box");
    assert.ok(countColorPixels(altPng, badgeRegion, "#2E7D32") > 200, "expected --config palette.accent #2E7D32 on badge");
    assert.equal(countColorPixels(altPng, { x: 0, y: 0, w: altPng.width, h: altPng.height }, "#6A1B9A"), 0);

    // 2. Manifest-level accent override takes precedence over qrg.config.json.
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        displayWidth: 600,
        badgeIn: 0.24,
        accent: "#D95F02",
        figures: [{ src: "screen.png", out: "from_manifest.png", printIn: 6.5, boxes: [{ x: 120, y: 120, w: 200, h: 80, n: 2, badge: "tl" }] }],
      }, null, 2) + "\n"
    );
    const rMan = runAnnotate([manifestPath], { cwd: root });
    assert.equal(rMan.status, 0, rMan.stdout + rMan.stderr);
    const manPng = PNG.sync.read(fs.readFileSync(path.join(assetDir, "out", "from_manifest.png")));
    assert.ok(countColorPixels(manPng, boxEdgeRegion, "#D95F02") > 200, "expected manifest accent #D95F02 on box");
    assert.ok(countColorPixels(manPng, badgeRegion, "#D95F02") > 200, "expected manifest accent #D95F02 on badge");
    assert.equal(countColorPixels(manPng, { x: 0, y: 0, w: manPng.width, h: manPng.height }, "#6A1B9A"), 0);

    // 3. CLI --color=<hex> (without #) and --accent=<hex> (with #) override manifest and config.
    const rCliColor = runAnnotate([manifestPath, "--color=1F5C99"], { cwd: root });
    assert.equal(rCliColor.status, 0, rCliColor.stdout + rCliColor.stderr);
    const cliColorPng = PNG.sync.read(fs.readFileSync(path.join(assetDir, "out", "from_manifest.png")));
    assert.ok(countColorPixels(cliColorPng, boxEdgeRegion, "#1F5C99") > 200, "expected --color=1F5C99 on box");
    assert.ok(countColorPixels(cliColorPng, badgeRegion, "#1F5C99") > 200, "expected --color=1F5C99 on badge");

    const rCliAccent = runAnnotate([manifestPath, "--accent=#0D47A1"], { cwd: root });
    assert.equal(rCliAccent.status, 0, rCliAccent.stdout + rCliAccent.stderr);
    const cliAccentPng = PNG.sync.read(fs.readFileSync(path.join(assetDir, "out", "from_manifest.png")));
    assert.ok(countColorPixels(cliAccentPng, boxEdgeRegion, "#0D47A1") > 200, "expected --accent=#0D47A1 on box");
    assert.ok(countColorPixels(cliAccentPng, badgeRegion, "#0D47A1") > 200, "expected --accent=#0D47A1 on badge");

    // 4. Discovery falls back to cwd when manifest directory has no qrg.config.json above it.
    const detachedDir = path.join(altDir, "detached_assets");
    writeSolidPng(path.join(detachedDir, "src", "screen.png"), 600, 400);
    const detachedManifest = path.join(detachedDir, "annotate.json");
    fs.writeFileSync(
      detachedManifest,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        displayWidth: 600,
        badgeIn: 0.24,
        figures: [{ src: "screen.png", out: "from_cwd.png", printIn: 6.5, boxes: [{ x: 120, y: 120, w: 200, h: 80, n: 3, badge: "tl" }] }],
      }, null, 2) + "\n"
    );
    const rCwd = runAnnotate([detachedManifest], { cwd: root });
    assert.equal(rCwd.status, 0, rCwd.stdout + rCwd.stderr);
    const cwdPng = PNG.sync.read(fs.readFileSync(path.join(detachedDir, "out", "from_cwd.png")));
    assert.ok(countColorPixels(cwdPng, boxEdgeRegion, "#6A1B9A") > 200, "expected cwd qrg.config.json accent #6A1B9A on box");
    assert.ok(countColorPixels(cwdPng, badgeRegion, "#6A1B9A") > 200, "expected cwd qrg.config.json accent #6A1B9A on badge");

    // 5. Explicit missing --config fails loudly.
    const rMissingCfg = runAnnotate([manifestPath, "--config=" + path.join(altDir, "missing.json")], { cwd: root });
    assert.notEqual(rMissingCfg.status, 0, "expected missing --config path to fail");
    assert.match(rMissingCfg.stderr, /config/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(altDir, { recursive: true, force: true });
  }
});

test("annotate_screenshot falls back cleanly to #C8122C when running standalone without qrg.config.json", () => {
  const standaloneDir = makeTempDir("qrg-standalone-");
  try {
    writeSolidPng(path.join(standaloneDir, "src", "screen.png"), 600, 400);
    const manifestPath = path.join(standaloneDir, "annotate.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        displayWidth: 600,
        badgeIn: 0.24,
        figures: [
          {
            src: "screen.png",
            out: "standalone.png",
            printIn: 6.5,
            boxes: [{ x: 120, y: 120, w: 200, h: 80, n: 1, badge: "tl" }],
          },
        ],
      }, null, 2) + "\n"
    );

    const env = { ...process.env };
    delete env.QRG_CONFIG;
    const r = runAnnotate([manifestPath], { cwd: standaloneDir, env });
    assert.equal(r.status, 0, r.stdout + r.stderr);

    const outPng = PNG.sync.read(fs.readFileSync(path.join(standaloneDir, "out", "standalone.png")));
    const boxEdgeRegion = { x: 300, y: 230, w: 280, h: 20 };
    const badgeRegion = { x: 160, y: 160, w: 80, h: 80 };

    assert.ok(countColorPixels(outPng, boxEdgeRegion, "#C8122C") > 200, "expected fallback #C8122C on box");
    assert.ok(countColorPixels(outPng, badgeRegion, "#C8122C") > 200, "expected fallback #C8122C on badge");

    const prov = JSON.parse(fs.readFileSync(path.join(standaloneDir, "out", "provenance.json"), "utf8"));
    assert.equal(prov.length, 1);
    assert.equal(prov[0].accent, "#C8122C");
    assert.equal(prov[0].printIn, 6.5);
  } finally {
    fs.rmSync(standaloneDir, { recursive: true, force: true });
  }
});

test("annotate_screenshot rejects non-Letter qrg.config.json, rejects invalid hex colors, and scales against 6.5 in US Letter width", () => {
  const root = makeTempDir("qrg-letter-enforce-");
  try {
    const assetDir = path.join(root, "sets", "DEMO", "assets", "DEMO01");
    writeSolidPng(path.join(assetDir, "src", "wide.png"), 1300, 600);
    const manifestPath = path.join(assetDir, "annotate.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        srcDir: "src",
        outDir: "out",
        badgeIn: 0.24,
        figures: [
          {
            src: "wide.png",
            out: "wide.png",
            printIn: 7.5,
            boxes: [{ x: 100, y: 100, w: 200, h: 80, n: 1, badge: "tl" }],
          },
        ],
      }, null, 2) + "\n"
    );

    // 1. A4 config fails loudly (even when CLI --color override is supplied).
    fs.writeFileSync(
      path.join(root, "qrg.config.json"),
      JSON.stringify({ project: "A4 Reject", page: "a4", palette: { accent: "1F5C99" } }, null, 2) + "\n"
    );
    const rA4 = runAnnotate([manifestPath, "--color=#1F5C99"], { cwd: root });
    assert.equal(rA4.status, 2, "expected A4 qrg.config.json to fail with exit 2");
    assert.match(rA4.stderr, /a4/i);
    assert.match(rA4.stderr, /letter/i);

    // 2. Other non-Letter page (e.g. "legal") fails loudly.
    fs.writeFileSync(
      path.join(root, "qrg.config.json"),
      JSON.stringify({ project: "Legal Reject", page: "legal", palette: { accent: "1F5C99" } }, null, 2) + "\n"
    );
    const rLegal = runAnnotate([manifestPath], { cwd: root });
    assert.equal(rLegal.status, 2, "expected non-letter qrg.config.json to fail with exit 2");
    assert.match(rLegal.stderr, /letter/i);

    // 3. Valid US Letter config clamps printIn > 6.5 down to 6.5 in content width.
    fs.writeFileSync(
      path.join(root, "qrg.config.json"),
      JSON.stringify({ project: "Letter OK", page: "letter", palette: { accent: "1F5C99" } }, null, 2) + "\n"
    );
    const rLetter = runAnnotate([manifestPath], { cwd: root });
    assert.equal(rLetter.status, 0, rLetter.stdout + rLetter.stderr);
    const prov = JSON.parse(fs.readFileSync(path.join(assetDir, "out", "provenance.json"), "utf8"));
    assert.equal(prov[0].printIn, 6.5, "print width must be clamped to Standard US Letter 6.5 in content width");
    assert.equal(prov[0].accent, "#1F5C99");

    // 4. Invalid hex color fails loudly.
    const rBadColor = runAnnotate([manifestPath, "--color=nothex"], { cwd: root });
    assert.equal(rBadColor.status, 2, "expected invalid hex color to fail with exit 2");
    assert.match(rBadColor.stderr, /hex/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("video_index extracts showinfo timestamps identically via matchAll without legacy re.exec loops", () => {
  const videoIndexPath = path.join(KIT, "tools", "video_index.js");
  const src = fs.readFileSync(videoIndexPath, "utf8");
  assert.doesNotMatch(src, /\.exec\s*\(/, "video_index.js should not use re.exec(...) loops");
  assert.match(src, /matchAll\s*\(/, "video_index.js should use matchAll(...)");

  const videoIndex = require(videoIndexPath);
  const sampleStderr = [
    "[Parsed_showinfo_2 @ 0x55a] config in time_base: 1/90000, frame_rate: 30/1",
    "[Parsed_showinfo_2 @ 0x55a] n:   0 pts:      0 pts_time:0       pos:       48 fmt:yuv420p",
    "[Parsed_showinfo_2 @ 0x55a] n:   1 pts: 135000 pts_time:1.5     pos:    12345 fmt:yuv420p",
    "[Parsed_showinfo_2 @ 0x55a] n:   2 pts: 451230 pts_time:5.01367 pos:    54321 fmt:yuv420p",
    "[Parsed_showinfo_2 @ 0x55a] n:   3 pts:  -3000 pts_time:-0.033  pts_time:+12.25",
  ].join("\n");

  assert.deepEqual(videoIndex.extractPtsTimes(sampleStderr), [0, 1.5, 5.01367, -0.033, 12.25]);
  assert.deepEqual(videoIndex.extractPtsTimes("no timestamps here"), []);
  assert.deepEqual(videoIndex.extractPtsTimes(""), []);

  // CLI invocation still guards cleanly when optional video packages are absent (or prints usage if installed).
  const cli = spawnSync(process.execPath, [videoIndexPath], { cwd: KIT, encoding: "utf8" });
  assert.equal(cli.status, 2);
});
