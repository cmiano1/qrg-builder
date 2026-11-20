#!/usr/bin/env node
// image_contact_sheet.js: one labeled contact sheet from a list of still images .
// For sorting a batch of screenshots (for example Snagit PNGs) without opening each one at full size.
// Each tile is the image scaled to fit a box, with its file name printed under it. Thumbnails are for
// choosing only; crop final figures from the full-size source. Sources are only read.
// Deps: sharp.
// Usage (from the kit folder):
//   node tools/image_contact_sheet.js <out.png> <img> [img ...] [--tile 360] [--cols 3]
"use strict";
const fs = require("fs");
const path = require("path");
let sharp; try { sharp = require("sharp"); } catch (e) { console.error("STOP: sharp is not installed or does not load. In the kit folder run  npm install  (not with --omit=optional), then  npm run check"); process.exit(2); }

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const flagged = new Set();
["tile", "cols"].forEach((k) => { const i = argv.indexOf("--" + k); if (i >= 0) { flagged.add(i); flagged.add(i + 1); } });
const pos = argv.filter((a, i) => !flagged.has(i));
if (pos.length < 2) { console.error("usage: node tools/image_contact_sheet.js <out.png> <img> [img ...] [--tile 360] [--cols 3]"); process.exit(2); }
const out = pos[0];
const imgs = pos.slice(1);
const tile = Number(opt("tile", "360"));
const cols = Number(opt("cols", "3"));
const labelH = 28;
const pad = 8;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

(async () => {
  const rows = Math.ceil(imgs.length / cols);
  const W = cols * (tile + pad) + pad;
  const H = rows * (tile + labelH + pad) + pad;
  const layers = [];
  for (let i = 0; i < imgs.length; i++) {
    const f = imgs[i];
    const r = Math.floor(i / cols), c = i % cols;
    const x = pad + c * (tile + pad), y = pad + r * (tile + labelH + pad);
    if (!fs.existsSync(f)) { console.log("MISSING " + f); continue; }
    const buf = await sharp(f).resize(tile, tile, { fit: "inside", background: "#ffffff" }).png().toBuffer();
    const m = await sharp(buf).metadata();
    layers.push({ input: buf, left: x + Math.floor((tile - m.width) / 2), top: y + Math.floor((tile - m.height) / 2) });
    const label = (i + 1) + ". " + path.basename(f);
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='" + tile + "' height='" + labelH + "'>" +
      "<text x='4' y='19' font-family='Arial' font-size='14' fill='#000'>" + esc(label) + "</text></svg>";
    layers.push({ input: Buffer.from(svg), left: x, top: y + tile });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: "#d9d9d9" } }).composite(layers).png().toFile(out);
  console.log("wrote " + out + " (" + imgs.length + " tiles, " + W + "x" + H + ")");
})();
