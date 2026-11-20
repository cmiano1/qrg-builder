// render_guides.js: renders live QRG builds through Word (DOCX to PDF), then to page PNGs, for visual QA and for the
// OK List. One render at a time on this machine (lib/lock.js "render" lock). Read-only on the guides.
// Each render goes to <review dir>/render/<set>_<NN>_<stamp>/ with short file names (<set>_<NN>.pdf, <set>_<NN>_p01.png ...)
// so paths stay well under the Windows 260-character limit, plus render.json (the SHA-256 of the exact file rendered).
// lock_guides.js only accepts a render whose SHA-256 matches the live file.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/render_guides.js --set=<id> [NN ...]        live builds in one set (all, or the numbers given)
//   node qrg_kit/scripts/render_guides.js "<code>" ["<code>" ...]    for example "UNIT1-INV 05"
//   --force     render again even if a matching render exists
//   --scale=N   PNG scale (default 110; 150 for close reading)
//   --file="<any.docx>" [--out="<dir>"]   one file that is not a live build (a scratch build, a hand-edited copy);
//               default out is <project>/_work/render_scratch/. No render.json, so it never counts for a lock.
// After it runs, LOOK at every page PNG (Read tool). A render is not a pass by itself.
// If Word hangs, the run stops after 5 minutes per file. It does not kill Word: check with  tasklist | grep -i winword
// and close only the hidden Word this run started (never a Word window you have open).
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, arg, flag } = require("../lib/config");
const { liveInventory, renderDir, findRender, writeJsonSafe } = require("../lib/inventory");
const { withLock } = require("../lib/lock");

const P = loadConfig();
const SET = arg("set");
const SCALE = +(arg("scale") || 110);
const FORCE = flag("force");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PS = (script, args) => spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(P.KIT, "tools", script), ...args],
  { encoding: "utf8", timeout: 5 * 60 * 1000, windowsHide: true });

// --file="<any.docx>" --out="<dir>": render one file that is not a live build (a scratch build, a hand-edited copy).
// No render.json is written, so lock_guides.js never takes this render as the render of a live file.
if (arg("file")) {
  const f = path.resolve(arg("file")), out = path.resolve(arg("out") || path.join(P.root, "_work", "render_scratch"));
  if (!fs.existsSync(f)) { console.error("not found: " + f); process.exit(2); }
  const base = path.basename(f, ".docx").replace(/ - [A-Z]+ [0-9]{8}-[0-9]{4}$/, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60);
  fs.mkdirSync(out, { recursive: true });
  for (const x of fs.readdirSync(out)) if (x === base + ".pdf" || (x.startsWith(base + "_p") && x.endsWith(".png"))) fs.unlinkSync(path.join(out, x));
  const pdf = path.join(out, base + ".pdf");
  const ok = withLock("render", P, () => {
    const w = PS("word_render.ps1", ["-In", f, "-Out", pdf]);
    if (w.error || w.status !== 0 || !fs.existsSync(pdf)) { console.log("FAIL Word render: " + (w.error ? w.error.code : "exit " + w.status) + "\n" + (w.stdout || "") + (w.stderr || "")); return false; }
    return PS("pdf_to_png.ps1", ["-In", pdf, "-OutDir", out, "-Scale", String(SCALE)]).status === 0;
  });
  if (!ok) process.exit(1);
  console.log("RENDERED " + path.basename(f) + ": " + fs.readdirSync(out).filter((x) => x.startsWith(base + "_p") && x.endsWith(".png")).length + " page(s) in " + out);
  process.exit(0);
}
const { guides, dup } = liveInventory(P, { set: SET || undefined });
if (dup.length) { console.error("STOP: more than one live build of a guide:\n  " + dup.join("\n  ")); process.exit(2); }
let codes;
if (SET) codes = Object.keys(guides).filter((c) => !pos.length || pos.includes(c.slice(-2)));
else if (pos.length) codes = pos;
else { console.error("usage: render_guides.js --set=<id> [NN ...]  |  render_guides.js \"<code>\" ..."); process.exit(2); }
const missing = codes.filter((c) => !guides[c]);
if (missing.length) { console.error("STOP: no live build for " + missing.join(", ")); process.exit(2); }

let bad = 0;
for (const code of codes) {
  const g = guides[code];
  const have = findRender(P, g);
  if (have && !have.stale && !FORCE) { console.log("SKIP " + code + ": already rendered (" + have.pages + " pages) " + have.dir); continue; }
  const dir = renderDir(P, g), base = g.set + "_" + g.nn;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(base)) fs.unlinkSync(path.join(dir, f));
  const pdf = path.join(dir, base + ".pdf");
  const ok = withLock("render", P, () => {
    const w = PS("word_render.ps1", ["-In", g.path, "-Out", pdf]);
    if (w.error || w.status !== 0 || !fs.existsSync(pdf)) {
      console.log("FAIL " + code + ": Word render " + (w.error ? w.error.code : "exit " + w.status) + "\n" + (w.stdout || "") + (w.stderr || ""));
      if (w.error && w.error.code === "ETIMEDOUT") console.log("  Word may still be running hidden: tasklist | grep -i winword");
      return false;
    }
    const r = PS("pdf_to_png.ps1", ["-In", pdf, "-OutDir", dir, "-Scale", String(SCALE)]);
    if (r.status !== 0) { console.log("FAIL " + code + ": PDF to PNG exit " + r.status + "\n" + (r.stderr || "")); return false; }
    return true;
  });
  if (!ok) { bad++; continue; }
  const pages = fs.readdirSync(dir).filter((x) => /_p[0-9]+[.]png$/i.test(x)).length;
  writeJsonSafe(path.join(dir, "render.json"), { code, file: g.file, sha256: g.sha256, pdfName: base + ".pdf", pages, scale: SCALE, renderedAt: new Date().toISOString() });
  console.log("RENDERED " + code + ": " + pages + " page(s) in " + dir);
}
if (bad) { console.log(bad + " render(s) failed"); process.exit(1); }
