#!/usr/bin/env node
// annotate_screenshot.js: QRG callout engine (red box plus numbered badge matched to step numbers).
//
// Method: immutable source, crop, redact, red #C8122C box, provenance.json. Standalone (bare requires only).
//
// Usage:
//   node tools/annotate_screenshot.js <manifest.json> [--grid]
//
// Manifest shape:
// {
//   "srcDir": "<abs dir of immutable source PNGs>",
//   "outDir": "<abs dir for annotated outputs>",
//   "displayWidth": 600,            // px the generator shows the image at (badge/stroke scale)
//   "figures": [
//     { "src": "01.png", "out": "inv01_fig01.png", "note": "what this shows",
//       "crop":   { "left": 0, "top": 0, "width": 800, "height": 400 },   // optional, source px
//       "redact": [ { "x": 0, "y": 0, "w": 300, "h": 40, "fill": "#ffffff" } ],  // after crop
//       "boxes":  [ { "x": 10, "y": 20, "w": 120, "h": 40, "n": 3, "badge": "tl" } ] // after crop
//     }
//   ]
// }
// Coordinates for redact/boxes are in post-crop pixels. badge: tl|tr|bl|br|l|r|t|b|in|none.
// "draw": false on a box skips the red rectangle and places only the badge (for sources that
// already carry a red box; added 10/21/2026).
// A box with "n" but no w/h ({x, y, n}) draws a badge only, centered at x,y (for already-boxed images).
// --grid writes <out>.grid.png (50 px grid on the cropped image) to help pick coordinates.
// Writes <outDir>/provenance.json (source, crop, redactions, boxes, output). Source is never touched.

let sharp; try { sharp = require("sharp"); } catch (e) { console.error("STOP: sharp is not installed or does not load. In the kit folder run  npm install  (not with --omit=optional), then  npm run check"); process.exit(2); }
const fs = require("fs");
const path = require("path");

const RED = "#C8122C";
const args = process.argv.slice(2);
const manifestPath = args.find(a => !a.startsWith("--"));
const GRID = args.includes("--grid");
if (!manifestPath) { console.error("usage: node annotate_screenshot.js <manifest.json> [--grid]"); process.exit(2); }

const man = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const baseDir = path.dirname(path.resolve(manifestPath));
const srcDir = path.resolve(baseDir, man.srcDir);
const outDir = path.resolve(baseDir, man.outDir);
fs.mkdirSync(outDir, { recursive: true });

// Opt-in print sizing (added after a reviewer found badges "a little small" and "slightly blurry" and expected them to be
// a uniform size across the document). With "badgeIn" in the manifest (the printed
// badge diameter in inches; 0.24 is the house size), each figure's badge and box stroke are sized from the width the figure
// prints at, so every badge prints the same size whatever the crop or figure width. The printed width comes from the
// figure's "printIn", else from the afig(K, "<out>", "<caption>", <width>) call in the manifest's "guide" file (path relative
// to the manifest; no width = the 6.5 in content width), capped by the 5.25 in figure height limit the generators use
// ("figMaxIn" overrides). A figure that would print below "minDpi" (default 220) is upscaled 2x (lanczos3) before the
// overlay is drawn, so badge edges stay sharp. Box and redact coordinates stay in source (post-crop) pixels.
// Manifests without "badgeIn" are drawn exactly as before.
const BADGE_IN = man.badgeIn || 0;
const MIN_DPI = man.minDpi || 220;
const FIG_MAX_IN = man.figMaxIn || 5.25;
const CONTENT_IN = 6.5;
const guideWidths = {};
if (man.guide) {
  const g = fs.readFileSync(path.resolve(baseDir, man.guide), "utf8");
  for (const m of g.matchAll(/afig\(\s*K\s*,\s*"([^"]+)"\s*,\s*"(?:[^"\\]|\\.)*"\s*(?:,\s*([0-9.]+))?\s*\)/g)) {
    guideWidths[m[1]] = m[2] ? parseFloat(m[2]) : CONTENT_IN;
  }
}
function printWidthIn(fig, W, H) {
  let w = Math.min(CONTENT_IN, fig.printIn || guideWidths[fig.out] || CONTENT_IN);
  if (w * H / W > FIG_MAX_IN) w = FIG_MAX_IN * W / H;
  return w;
}

function badgeXY(b, pos, r, W, H) {
  const gap = Math.round(r * 0.4);
  let cx, cy;
  if (!b.w) pos = "point";
  switch (pos) {
    case "point": cx = b.x; cy = b.y; break;
    case "tr": cx = b.x + b.w + gap + r; cy = b.y - gap - r; break;
    case "bl": cx = b.x - gap - r; cy = b.y + b.h + gap + r; break;
    case "br": cx = b.x + b.w + gap + r; cy = b.y + b.h + gap + r; break;
    case "l": cx = b.x - gap - r; cy = b.y + b.h / 2; break;
    case "r": cx = b.x + b.w + gap + r; cy = b.y + b.h / 2; break;
    case "t": cx = b.x + b.w / 2; cy = b.y - gap - r; break;
    case "b": cx = b.x + b.w / 2; cy = b.y + b.h + gap + r; break;
    case "in": cx = b.x + r + gap; cy = b.y + b.h / 2; break; // inside the box, left end
    default: cx = b.x - gap - r; cy = b.y - gap - r; // tl
  }
  // Keep inside the image. If clamping pushes the badge onto the box, it still reads clearly.
  cx = Math.min(Math.max(cx, r + 2), W - r - 2);
  cy = Math.min(Math.max(cy, r + 2), H - r - 2);
  return [Math.round(cx), Math.round(cy)];
}

function overlaySvg(W, H, fig, scale, rPrint) {
  // rPrint (print sizing, see BADGE_IN): badge radius in output pixels; the stroke keeps the same 2.6:11 ratio.
  const sw = rPrint ? Math.max(2, Math.round(rPrint * 2.6 / 11)) : Math.max(3, Math.round(2.6 * scale));
  const r = rPrint ? rPrint : Math.max(12, Math.round(11 * scale));
  const fs_ = Math.round(r * 1.25);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (const d of fig.redact || []) {
    s += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="${d.fill || "#ffffff"}"/>`;
  }
  for (const b of fig.boxes || []) {
    if (!b.w || b.draw === false) continue; // draw:false = badge only (source already has a red box)
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${Math.round(sw * 1.5)}" fill="none" stroke="${RED}" stroke-width="${sw}"/>`;
  }
  for (const b of fig.boxes || []) {
    if (b.n == null || b.badge === "none") continue;
    const [cx, cy] = badgeXY(b, b.badge || "tl", r, W, H);
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${RED}" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(sw * 0.6))}"/>`;
    s += `<text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${fs_}" fill="#ffffff">${b.n}</text>`;
  }
  return s + "</svg>";
}

function gridSvg(W, H) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (let x = 0; x < W; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${x % 100 ? "#00a0ff" : "#ff00ff"}" stroke-width="1" opacity="0.55"/>` + (x % 100 ? "" : `<text x="${x + 2}" y="12" font-size="11" font-family="Arial" fill="#ff00ff">${x}</text>`);
  for (let y = 0; y < H; y += 50) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${y % 100 ? "#00a0ff" : "#ff00ff"}" stroke-width="1" opacity="0.55"/>` + (y % 100 ? "" : `<text x="2" y="${y + 12}" font-size="11" font-family="Arial" fill="#ff00ff">${y}</text>`);
  return s + "</svg>";
}

(async () => {
  const prov = [];
  const dispW = man.displayWidth || 600;
  for (const fig of man.figures) {
    const src = path.join(srcDir, fig.src);
    if (!fs.existsSync(src)) { console.error("MISSING source", src); process.exitCode = 1; continue; }
    let img = sharp(src);
    const meta = await img.metadata();
    let W = meta.width, H = meta.height;
    if (fig.crop) {
      const c = fig.crop;
      img = img.extract({ left: c.left, top: c.top, width: c.width, height: c.height });
      W = c.width; H = c.height;
    }
    const base0 = await img.png().toBuffer();
    const scale = Math.max(1, W / dispW);
    const out = path.join(outDir, fig.out);
    let base = base0, ofig = fig, rPrint = 0, up = 1, pIn = 0;
    const W0 = W, H0 = H;
    if (BADGE_IN) {
      if (!fig.printIn && guideWidths[fig.out] == null) console.log("WARN " + fig.out + ": no printIn and no afig call in the guide; sized for " + CONTENT_IN + " in");
      pIn = printWidthIn(fig, W0, H0);
      if (W0 / pIn < MIN_DPI) up = 2;
      if (up > 1) {
        base = await sharp(base0).resize(W0 * up, H0 * up, { kernel: "lanczos3" }).png().toBuffer();
        const sc = (o) => Object.assign({}, o, { x: o.x * up, y: o.y * up }, o.w ? { w: o.w * up } : {}, o.h ? { h: o.h * up } : {});
        ofig = Object.assign({}, fig, { boxes: (fig.boxes || []).map(sc), redact: (fig.redact || []).map(sc) });
        W = W0 * up; H = H0 * up;
      }
      rPrint = Math.max(6, Math.round((BADGE_IN / 2) * W / pIn));
    }
    await sharp(base).composite([{ input: Buffer.from(overlaySvg(W, H, ofig, scale, rPrint)), left: 0, top: 0 }]).png().toFile(out);
    if (GRID) await sharp(base0).composite([{ input: Buffer.from(gridSvg(W0, H0)) }]).png().toFile(out.replace(/\.png$/, ".grid.png"));
    prov.push({ out: fig.out, source: src, sourceSize: `${meta.width}x${meta.height}`, crop: fig.crop || null, outSize: `${W}x${H}`, redact: fig.redact || [], boxes: fig.boxes || [], note: fig.note || "", built: new Date().toISOString(), ...(BADGE_IN ? { printIn: +pIn.toFixed(2), badgeIn: BADGE_IN, upscale: up, dpi: Math.round(W / pIn) } : {}) });
    console.log("OK", fig.out, `${W}x${H}`, `boxes=${(fig.boxes || []).length}` + (BADGE_IN ? ` print=${pIn.toFixed(2)}in dpi=${Math.round(W / pIn)} up=${up} r=${rPrint}px` : ""));
  }
  fs.writeFileSync(path.join(outDir, "provenance.json"), JSON.stringify(prov, null, 1));
})();
