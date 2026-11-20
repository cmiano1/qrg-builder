// check_kit.js: a quick health check of the kit install. Syntax-checks every kit script (node --check, which never
// runs a build), checks the packages and their versions, and checks that Word and PowerShell can be found for renders.
// Usage: node qrg_kit/scripts/check_kit.js     (or  npm run check  in the kit folder)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const KIT = path.resolve(__dirname, "..");
const MIN_NODE_MAJOR = 22;

function isSupportedNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(String(version).replace(/^v/i, "").split(".")[0], 10);
  return Number.isFinite(major) && major >= MIN_NODE_MAJOR;
}

async function runCheck() {
  let bad = 0;
  const ok = (m) => console.log("  ok   " + m), no = (m) => { bad++; console.log("  FAIL " + m); }, warn = (m) => console.log("  warn " + m);

  console.log("Kit " + KIT);
  const pkg = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8"));
  console.log("kit version " + pkg.version + ", node " + process.version);
  if (!isSupportedNodeVersion(process.versions.node)) no("node " + MIN_NODE_MAJOR + " or newer is needed");

  console.log("\nScripts");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", "_work", "_archive"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith(".js")) files.push(p);
  } };
  walk(KIT);
  let syn = 0;
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) no(path.relative(KIT, f) + ": " + (r.stderr || "").split("\n").slice(0, 4).join(" "));
    else syn++;
  }
  ok(syn + " of " + files.length + " scripts pass node --check");

  console.log("\nPackages");
  const VIDEO = { "ffmpeg-static": "^5.3.0", "ffprobe-static": "^3.1.0" };
  for (const [name, want, video] of [...Object.entries(pkg.dependencies).filter(([n]) => !VIDEO[n]).map(([n, v]) => [n, v, false]), ...Object.entries(VIDEO).map(([n, v]) => [n, v, true])]) {
    const pj = path.join(KIT, "node_modules", name, "package.json");
    if (!fs.existsSync(pj)) { (video ? warn : no)(name + " not installed" + (video ? " (video tools only: npm run add-video in the kit folder)" : ". Run  npm install  in " + KIT)); continue; }
    const v = JSON.parse(fs.readFileSync(pj, "utf8")).version;
    ok(name + " " + v + " (wants " + want + ")");
  }
  try { require(path.join(KIT, "node_modules", "sharp")); ok("sharp loads (native image library present)"); } catch (e) { no("sharp does not load: " + e.message.split("\n")[0]); }
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

  console.log("\nWord render (Windows only)");
  if (process.platform !== "win32") warn("not Windows: Word renders are off; build, QA, and offline proofing work");
  else {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", "if (Test-Path 'Registry::HKEY_CLASSES_ROOT\\Word.Application') { 'word' } else { 'none' }"], { encoding: "utf8", timeout: 30000, windowsHide: true });
    if (r.error) no("powershell.exe not found: " + r.error.message);
    else if (/word/.test(r.stdout)) ok("powershell.exe and Word (COM) found");
    else no("Word is not registered for COM. Renders need desktop Word.");
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
