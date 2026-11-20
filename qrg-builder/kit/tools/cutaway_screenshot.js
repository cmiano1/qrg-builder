#!/usr/bin/env node
// cutaway_screenshot.js: torn-edge cut-away for wide, shallow screenshots, plus an optional white margin
// (visual QA rule: a wide, shallow screen becomes a cut-away of the part the step names).
//
// A wide strip shown at page width shrinks its UI text until it can't be read. A plain crop can lose a control the
// steps name (for example a Finish button at the far right). This helper keeps the parts that matter and removes the
// empty band(s) between them, joining the kept parts with a white torn band (jagged edges, gray edge line), a common
// job-aid convention. The cut stays visible to the reader on purpose.
//
// Usage (from the kit folder):
//   node tools/cutaway_screenshot.js --src <src.png> --out <derived.png> --keep 0-745,1290-1420
//        [--crop left,top,width,height] [--axis x|y] [--gap 24] [--amp 7] [--period 18] [--pad t,r,b,l] [--overwrite]
//
//   --crop    applied first, in source px (same meaning as annotate_screenshot.js "crop").
//   --keep    ranges to keep, in post-crop px, along the axis: x keeps column ranges (the tear runs top to bottom),
//             y keeps row ranges (the tear runs left to right). Two or more ranges, in order, not overlapping.
//   --gap     width of the white band between kept parts (px). --amp and --period shape the jagged edge; the teeth
//             reach --amp px into each kept part, so leave that much empty space at each cut.
//   --pad     optional white margin added last (px, top,right,bottom,left), for a crop whose first row sits on the
//             image edge because the UI above it can't be included. --keep may be left out when only --pad is wanted.
//
// Writes <derived.png> plus <derived>.cutaway.json (source, crop, keep ranges, and a segment map: each kept range's
// post-crop start and its start in the output, pad included), so annotate_screenshot.js box coordinates can be moved
// exactly: along the axis, out = seg.outFrom + (v - seg.from) for a v inside seg [from, to); across it, out = v + acrossOffset.
// The source is never touched. Feed <derived.png> to annotate_screenshot.js as the figure's src, with no crop.

let sharp; try { sharp = require("sharp"); } catch (e) { console.error("STOP: sharp is not installed or does not load. In the kit folder run  npm install  (not with --omit=optional), then  npm run check"); process.exit(2); }
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : def; }
const SRC = opt("src"), OUT = opt("out"), KEEP = opt("keep"), CROP = opt("crop");
const AXIS = opt("axis", "x"), GAP = Number(opt("gap", 24)), AMP = Number(opt("amp", 7)), PERIOD = Number(opt("period", 18));
const OVERWRITE = argv.includes("--overwrite");
const PAD = (opt("pad", "0,0,0,0")).split(",").map(Number);
if (PAD.length !== 4 || PAD.some((v) => Number.isNaN(v) || v < 0)) throw new Error("--pad must be t,r,b,l");
if (!SRC || !OUT || (!KEEP && !PAD.some((v) => v > 0))) { console.error("usage: node cutaway_screenshot.js --src <png> --out <png> --keep a-b,c-d [--crop l,t,w,h] [--axis x|y]"); process.exit(2); }
if (AXIS !== "x" && AXIS !== "y") throw new Error("--axis must be x or y");
if (fs.existsSync(OUT) && !OVERWRITE) throw new Error("output exists (pass --overwrite): " + OUT);
if (path.resolve(SRC) === path.resolve(OUT)) throw new Error("out must differ from src");

const ranges = KEEP ? KEEP.split(",").map((r) => r.split("-").map(Number)) : null;
if (ranges && ranges.length < 2) throw new Error("--keep needs two or more ranges");
for (let i = 0; ranges && i < ranges.length; i++) {
  const [a, b] = ranges[i];
  if (!(b > a) || Number.isNaN(a) || Number.isNaN(b)) throw new Error("bad range " + ranges[i]);
  if (i && a <= ranges[i - 1][1]) throw new Error("ranges overlap or are out of order");
}

// Deterministic jitter so a rebuild draws the same edge.
function jitter(k) { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return 0.6 + 0.4 * (s - Math.floor(s)); }

function edgeSvg(W, H, cuts, sw) {
  // cuts: output coordinate where each band starts (along the axis). Build in "along = axis" space, then map.
  const len = AXIS === "x" ? H : W;
  const P = (along, across) => (AXIS === "x" ? `${along.toFixed(1)},${across.toFixed(1)}` : `${across.toFixed(1)},${along.toFixed(1)}`);
  let shadow = "", fill = "", line = "";
  cuts.forEach((a, ci) => {
    const left = [], right = [];
    const n = Math.ceil((2 * len) / PERIOD) + 2;
    for (let k = 0; k <= n; k++) {
      const t = Math.min(len + PERIOD, (k * PERIOD) / 2) - PERIOD / 2;
      const jL = jitter(k + ci * 101), jR = jitter(k + 37 + ci * 101);
      left.push(P(k % 2 === 0 ? a - AMP * jL : a + 1, t));
      right.push(P(k % 2 === 1 ? a + GAP + AMP * jR : a + GAP - 1, t));
    }
    const lp = left.join(" "), rp = right.join(" ");
    shadow += `<polyline points="${lp}" fill="none" stroke="#d6d6d6" stroke-width="${(sw * 3).toFixed(1)}"/>`;
    shadow += `<polyline points="${rp}" fill="none" stroke="#d6d6d6" stroke-width="${(sw * 3).toFixed(1)}"/>`;
    fill += `<polygon points="${lp} ${right.slice().reverse().join(" ")}" fill="#ffffff"/>`;
    line += `<polyline points="${lp}" fill="none" stroke="#9a9a9a" stroke-width="${sw.toFixed(1)}"/>`;
    line += `<polyline points="${rp}" fill="none" stroke="#9a9a9a" stroke-width="${sw.toFixed(1)}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shadow}${fill}${line}</svg>`;
}

(async () => {
  let img = sharp(SRC);
  const meta = await img.metadata();
  let crop = null, W = meta.width, H = meta.height;
  if (CROP) {
    const [left, top, width, height] = CROP.split(",").map(Number);
    crop = { left, top, width, height };
    img = img.extract(crop);
    W = width; H = height;
  }
  const base = await img.png().toBuffer();
  const lim = AXIS === "x" ? W : H;
  const keep = ranges || [[0, lim]];
  if (keep[keep.length - 1][1] > lim) throw new Error("a keep range runs past the image (" + lim + " px)");
  const segs = [], parts = [];
  let pos = 0;
  for (let i = 0; i < keep.length; i++) {
    const [from, to] = keep[i];
    const ext = AXIS === "x" ? { left: from, top: 0, width: to - from, height: H } : { left: 0, top: from, width: W, height: to - from };
    const buf = await sharp(base).extract(ext).png().toBuffer();
    parts.push({ input: buf, left: AXIS === "x" ? pos : 0, top: AXIS === "x" ? 0 : pos });
    segs.push({ from, to, outFrom: pos, outTo: pos + (to - from) });
    pos += to - from;
    if (i < keep.length - 1) pos += GAP;
  }
  const OW = AXIS === "x" ? pos : W, OH = AXIS === "x" ? H : pos;
  const cuts = segs.slice(0, -1).map((s) => s.outTo);
  const sw = Math.max(1.5, (AXIS === "x" ? OW : OH) / 500);
  const canvas = sharp({ create: { width: OW, height: OH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } });
  const joined = await canvas.composite(parts).png().toBuffer();
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  const [pt, pr, pb, pl] = PAD;
  const edged = cuts.length ? await sharp(joined).composite([{ input: Buffer.from(edgeSvg(OW, OH, cuts, sw)), left: 0, top: 0 }]).png().toBuffer() : joined;
  await sharp(edged).extend({ top: pt, right: pr, bottom: pb, left: pl, background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toFile(OUT);
  const alongPad = AXIS === "x" ? pl : pt;
  for (const s of segs) { s.outFrom += alongPad; s.outTo += alongPad; }
  const side = OUT.replace(/\.png$/i, "") + ".cutaway.json";
  const rec = { out: path.basename(OUT), source: path.resolve(SRC), sourceSize: `${meta.width}x${meta.height}`, crop, axis: AXIS,
    keep: ranges, gap: ranges ? GAP : null, amp: AMP, period: PERIOD, pad: { top: pt, right: pr, bottom: pb, left: pl },
    acrossOffset: AXIS === "x" ? pt : pl, postCropSize: `${W}x${H}`, outSize: `${OW + pl + pr}x${OH + pt + pb}`, segments: segs,
    built: new Date().toISOString(), tool: "tools/cutaway_screenshot.js" };
  fs.writeFileSync(side, JSON.stringify(rec, null, 1));
  console.log("OK", path.basename(OUT), `${W}x${H} -> ${OW + pl + pr}x${OH + pt + pb}`, "segments", JSON.stringify(segs));
})().catch((e) => { console.error(e.message); process.exit(1); });
