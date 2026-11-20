// check_kit.js: a quick health check of the kit install. Syntax-checks every kit script (node --check, which never
// runs a build), checks the packages and native/ESM modules (sharp, @napi-rs/canvas, pdfjs-dist, harper.js), and checks
// cross-platform DOCX-to-PDF renderer availability (LibreOffice, Portable/AppImage, or Windows Word fallback).
// Usage: node qrg_kit/scripts/check_kit.js     (or  npm run check  in the kit folder)
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawnSync } = require("child_process");
const { discoverRenderer } = require("../lib/render");

const KIT = path.resolve(__dirname, "..");
const MIN_NODE_MAJOR = 22;

function isSupportedNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(String(version).replace(/^v/i, "").split(".")[0], 10);
  return Number.isFinite(major) && major >= MIN_NODE_MAJOR;
}

async function runCheck(opts = {}) {
  let bad = 0;
  const ok = (m) => console.log("  ok   " + m);
  const no = (m) => { bad++; console.log("  FAIL " + m); };
  const warn = (m) => console.log("  warn " + m);

  console.log("Kit " + KIT);
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8"));
  console.log("kit version " + pkg.version + ", node " + process.version);
  if (!isSupportedNodeVersion(process.versions.node)) no("node " + MIN_NODE_MAJOR + " or newer is needed");

  console.log("\nScripts");
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", "_work", "_archive"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith(".js")) files.push(p);
    }
  };
  walk(KIT);
  let syn = 0;
  let escBad = 0;
  const EN_DASH = String.fromCharCode(0x2013);
  const EM_DASH = String.fromCharCode(0x2014);
  const U_ESC_RE = new RegExp(String.fromCharCode(0x5c, 0x5c) + "u[0-9a-fA-F]{4}");
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) no(path.relative(KIT, f) + ": " + (r.stderr || "").split("\n").slice(0, 4).join(" "));
    else syn++;
    const src = fs.readFileSync(f, "utf8");
    if (src.includes(EN_DASH) || src.includes(EM_DASH)) {
      escBad++;
      no(path.relative(KIT, f) + ": contains em or en dash (use plain hyphen or String.fromCharCode)");
    }
    if (U_ESC_RE.test(src)) {
      escBad++;
      no(path.relative(KIT, f) + ": contains literal unicode hex escape (use String.fromCharCode)");
    }
  }
  ok(syn + " of " + files.length + " scripts pass node --check");
  if (!escBad) ok("0 scripts contain em/en dashes or literal unicode escapes");

  console.log("\nPackages");
  const VIDEO = { "ffmpeg-static": "^5.3.0", "ffprobe-static": "^3.1.0" };
  for (const [name, want, video] of [
    ...Object.entries(pkg.dependencies).filter(([n]) => !VIDEO[n]).map(([n, v]) => [n, v, false]),
    ...Object.entries(VIDEO).map(([n, v]) => [n, v, true]),
  ]) {
    const pj = path.join(KIT, "node_modules", name, "package.json");
    if (!fs.existsSync(pj)) {
      (video ? warn : no)(name + " not installed" + (video ? " (video tools only: npm run add-video in the kit folder)" : ". Run  npm install  in " + KIT));
      continue;
    }
    const v = JSON.parse(fs.readFileSync(pj, "utf8")).version;
    ok(name + " " + v + " (wants " + want + ")");
  }
  try {
    require(path.join(KIT, "node_modules", "sharp"));
    ok("sharp loads (native image library present)");
  } catch (e) {
    no("sharp does not load: " + e.message.split("\n")[0]);
  }
  try {
    const canvas = require(path.join(KIT, "node_modules", "@napi-rs", "canvas"));
    if (typeof canvas.createCanvas !== "function") throw new Error("createCanvas missing");
    canvas.createCanvas(1, 1);
    ok("@napi-rs/canvas loads (native Skia canvas present)");
  } catch (e) {
    no("@napi-rs/canvas does not load: " + e.message.split("\n")[0]);
  }
  try {
    const pdfjsEntry = path.join(KIT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs");
    const pdfjs = await import(pathToFileURL(pdfjsEntry).href);
    if (typeof pdfjs.getDocument !== "function") throw new Error("getDocument missing");
    ok("pdfjs-dist loads (pure-Node PDF rasterizer ready)");
  } catch (e) {
    no("pdfjs-dist does not load: " + e.message.split("\n")[0]);
  }
  try {
    const harper = await import("harper.js");
    // Use binaryInlined (data: URL) so paths with spaces (%20) and Windows drive letters work reliably.
    const { binaryInlined: binary } = await import("harper.js/binaryInlined");
    if (!harper.LocalLinter || !binary) throw new Error("missing LocalLinter or binaryInlined export");
    const linter = new harper.LocalLinter({ binary, dialect: harper.Dialect.American });
    try {
      await linter.setup();
    } finally {
      await linter.dispose();
    }
    ok("harper.js loads (offline spelling and grammar proofing ready)");
  } catch (e) {
    no("harper.js does not load: " + String(e && e.message ? e.message : e).split("\n")[0]);
  }

  console.log("\nRenderer (DOCX to PDF)");
  const renderer = discoverRenderer({ kitDir: KIT, ...(opts.discoverOpts || {}) });
  if (renderer.kind === "libreoffice") {
    ok(renderer.label + " found (" + renderer.source + "): " + renderer.command);
  } else if (renderer.kind === "word-com") {
    ok(renderer.label + " found (LibreOffice not installed; Word will be used on Windows)");
  } else {
    warn(renderer.reason + " Build, QA, and proofing still work; renders need LibreOffice (no admin needed: Windows PortableApps, macOS ~/Applications, Linux AppImage).");
  }

  console.log(bad ? "\nRESULT: " + bad + " problem(s)" : "\nRESULT: kit ready");
  return bad ? 1 : 0;
}

module.exports = { MIN_NODE_MAJOR, isSupportedNodeVersion, runCheck };

if (require.main === module) {
  runCheck().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(1);
  });
}
