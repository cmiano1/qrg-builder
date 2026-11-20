// render_guides.js: renders live QRG builds to PDF (auto-detected headless LibreOffice, PortableApps /
// ~/Applications / AppImage, or optional Windows Word COM fallback) and per-page PNGs purely in Node.js
// (pdfjs-dist + @napi-rs/canvas) for visual QA and the OK List.
// One render at a time on this machine (lib/lock.js "render" lock). Read-only on the guides.
// Each render goes to <review dir>/render/<set>_<NN>_<stamp>/ with short file names (<set>_<NN>.pdf, <set>_<NN>_p01.png ...)
// so paths stay well under the Windows 260-character limit, plus render.json (the SHA-256 of the exact file rendered).
// lock_guides.js only accepts a render whose SHA-256 matches the live file.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/render_guides.js --set=<id> [NN ...]        live builds in one set (all, or the numbers given)
//   node qrg_kit/scripts/render_guides.js "<code>" ["<code>" ...]    for example "UNIT1-INV 05"
//   --force     render again even if a matching render exists
//   --scale=N   PNG scale in DPI (default 110; 150 for close reading)
//   --file="<any.docx>" [--out="<dir>"]   one file that is not a live build (a scratch build, a hand-edited copy);
//               default out is <project>/_work/render_scratch/. No render.json, so it never counts for a lock.
// After it runs, LOOK at every page PNG. A render is not a pass by itself.
const fs = require("fs");
const path = require("path");
const { loadConfig, arg, flag } = require("../lib/config");
const { liveInventory, renderDir, findRender, writeJsonSafe } = require("../lib/inventory");
const { withLockAsync } = require("../lib/lock");
const { discoverRenderer, renderDocxToImages } = require("../lib/render");

function reportFailure(label, res) {
  const stage = res.stage === "pdf-to-png" ? "PDF to PNG" : (res.renderer && res.renderer.label ? res.renderer.label : "DOCX render");
  console.log("FAIL " + label + ": " + stage + " " + (res.error || "failed")
    + (res.stdout ? "\n" + res.stdout : "")
    + (res.stderr ? "\n" + res.stderr : ""));
  if (res.timedOut && res.renderer && res.renderer.kind === "word-com") {
    console.log("  Word may still be running hidden: tasklist | grep -i winword");
  }
}

function requireRenderer(P) {
  const renderer = discoverRenderer({ cfg: P.cfg, projectRoot: P.root, kitDir: P.KIT });
  if (renderer.kind === "missing") {
    console.error("STOP: " + renderer.reason + "\n\n" + renderer.setupGuide);
    process.exit(2);
  }
  return renderer;
}

async function main() {
  const P = loadConfig();
  const SET = arg("set");
  const rawScale = arg("scale");
  const SCALE = rawScale === null ? 110 : Number(rawScale);
  if (!Number.isFinite(SCALE) || SCALE <= 0) {
    console.error("STOP: --scale must be a positive number (got " + JSON.stringify(rawScale) + ")");
    process.exit(2);
  }
  const FORCE = flag("force");
  const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  // --file="<any.docx>" [--out="<dir>"]: render one file that is not a live build (a scratch build, a hand-edited copy).
  // No render.json is written, so lock_guides.js never takes this render as the render of a live file.
  if (arg("file")) {
    const f = path.resolve(arg("file"));
    const out = path.resolve(arg("out") || path.join(P.root, "_work", "render_scratch"));
    if (!fs.existsSync(f)) { console.error("not found: " + f); process.exit(2); }
    const renderer = requireRenderer(P);
    const base = path.basename(f, ".docx").replace(/ - [A-Z]+ [0-9]{8}-[0-9]{4}$/, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60);
    fs.mkdirSync(out, { recursive: true });
    for (const x of fs.readdirSync(out)) {
      if (x === base + ".pdf" || (x.startsWith(base + "_p") && x.endsWith(".png"))) fs.unlinkSync(path.join(out, x));
    }
    const res = await withLockAsync("render", P, () =>
      renderDocxToImages({ docxPath: f, outDir: out, baseName: base, scale: SCALE, renderer })
    );
    if (!res.ok) { reportFailure(path.basename(f), res); process.exit(1); }
    console.log("RENDERED " + path.basename(f) + ": " + res.pages + " page(s) in " + out);
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

  let renderer = null;
  let bad = 0;
  for (const code of codes) {
    const g = guides[code];
    const have = findRender(P, g);
    if (have && !have.stale && !FORCE) {
      console.log("SKIP " + code + ": already rendered (" + have.pages + " pages) " + have.dir);
      continue;
    }
    if (!renderer) renderer = requireRenderer(P);
    const dir = renderDir(P, g), base = g.set + "_" + g.nn;
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f.startsWith(base)) fs.unlinkSync(path.join(dir, f));
    const res = await withLockAsync("render", P, () =>
      renderDocxToImages({ docxPath: g.path, outDir: dir, baseName: base, scale: SCALE, renderer })
    );
    if (!res.ok) { reportFailure(code, res); bad++; continue; }
    const pages = fs.readdirSync(dir).filter((x) => /_p[0-9]+[.]png$/i.test(x)).length;
    writeJsonSafe(path.join(dir, "render.json"), {
      code,
      file: g.file,
      sha256: g.sha256,
      pdfName: base + ".pdf",
      pages,
      scale: SCALE,
      renderedAt: new Date().toISOString(),
    });
    console.log("RENDERED " + code + ": " + pages + " page(s) in " + dir);
  }
  if (bad) { console.log(bad + " render(s) failed"); process.exit(1); }
}

main().catch((err) => {
  console.error("FAIL render_guides: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
