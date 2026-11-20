#!/usr/bin/env node
// extract_snagx_png.js: copy the main PNG out of Snagit .snagx captures.
//
// A .snagx file is a zip. The capture itself is a {GUID}.png inside it (other entries are metadata and
// sometimes a smaller thumbnail). This helper writes the LARGEST .png entry of each capture to
// <out_dir>/<capture base name>.png and adds a row to <out_dir>/snagx_manifest.json (source path, entry
// name, bytes, width and height, extracted time). The source .snagx is only read, never changed.
// Output names come from the capture file name, never from entry names inside the zip.
//
// Usage (from the kit folder):
//   node tools/extract_snagx_png.js <out_dir> <capture.snagx> [more.snagx ...] [--overwrite] [--list]
//   --list       only print each capture's zip entries; write nothing
//   --overwrite  replace an existing <base>.png (default: skip it and say so)
// Exit 1 if any capture could not be read or had no PNG entry.
"use strict";
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const listOnly = args.includes("--list");
const pos = args.filter((a) => !a.startsWith("--"));
if (pos.length < 2) {
  console.error("usage: node tools/extract_snagx_png.js <out_dir> <capture.snagx> [more.snagx ...] [--overwrite] [--list]");
  process.exit(2);
}
const outDir = pos[0];
const files = pos.slice(1);

function pngSize(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

(async () => {
  if (!listOnly) fs.mkdirSync(outDir, { recursive: true });
  const manPath = path.join(outDir, "snagx_manifest.json");
  let manifest = [];
  if (!listOnly && fs.existsSync(manPath)) manifest = JSON.parse(fs.readFileSync(manPath, "utf8"));
  let bad = 0;
  for (const f of files) {
    const base = path.basename(f).replace(/\.snagx$/i, "");
    let zip;
    try {
      zip = await JSZip.loadAsync(fs.readFileSync(f));
    } catch (e) {
      bad++;
      console.log("ERROR  " + f + "  (" + e.message + ")");
      continue;
    }
    const entries = Object.values(zip.files).filter((z) => !z.dir);
    if (listOnly) {
      console.log("== " + f);
      for (const z of entries) {
        const b = await z.async("nodebuffer");
        const s = pngSize(b);
        console.log("   " + z.name + "  " + b.length + " bytes" + (s ? "  png " + s.width + "x" + s.height : ""));
      }
      continue;
    }
    let best = null;
    for (const z of entries) {
      if (!/\.png$/i.test(z.name)) continue;
      const b = await z.async("nodebuffer");
      if (!pngSize(b)) continue;
      if (!best || b.length > best.buf.length) best = { name: z.name, buf: b };
    }
    if (!best) {
      bad++;
      console.log("NO PNG " + f);
      continue;
    }
    const out = path.join(outDir, base + ".png");
    if (fs.existsSync(out) && !overwrite) {
      console.log("SKIP   " + out + " exists (use --overwrite)");
      continue;
    }
    fs.writeFileSync(out, best.buf);
    const s = pngSize(best.buf);
    manifest = manifest.filter((m) => m.output !== base + ".png");
    manifest.push({ output: base + ".png", source: path.resolve(f), entry: best.name, bytes: best.buf.length,
      width: s.width, height: s.height, extracted: new Date().toISOString() });
    console.log("OK     " + base + ".png  " + s.width + "x" + s.height + "  from " + best.name);
  }
  if (!listOnly) fs.writeFileSync(manPath, JSON.stringify(manifest, null, 2) + "\n");
  process.exit(bad ? 1 : 0);
})();
