#!/usr/bin/env node
'use strict';
/* Window contact sheet.
 * Samples one frame every --every seconds between --from and --to of a long video, using input seeking
 * (-ss before -i, fast on multi-GB meeting recordings), and writes a contact sheet with each tile labeled
 * by its timestamp, plus index.json. Thumbnails are for choosing only: extract the final frame again with
 * extract_video_frame.js --fast-seek. Never touches the source video.
 * Deps: ffmpeg-static (video add-on: npm run add-video), sharp.
 * Usage: node window_contact_sheet.js <video> --from 00:29:00 --to 00:42:00 --every 30 --out <dir> [--width 640] [--cols 4] [--crop w:h:x:y]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
let ffmpeg; try { ffmpeg = require('ffmpeg-static'); } catch (e) { console.error('ERROR: ffmpeg-static is not installed. In the kit folder run: npm run add-video'); process.exit(2); }
const sharp = require('sharp');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const video = argv[0];
if (!video || video.startsWith('--')) { console.error('Usage: node window_contact_sheet.js <video> --from hh:mm:ss --to hh:mm:ss --every S --out DIR'); process.exit(2); }
const sec = (t) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
const hms = (s) => new Date(s * 1000).toISOString().substr(11, 8);
const from = sec(opt('from', '0')), to = sec(opt('to', '60')), every = Number(opt('every', '30'));
const out = path.resolve(opt('out', 'window_sheet'));
const width = Number(opt('width', '640')), cols = Number(opt('cols', '4')), crop = opt('crop', '');
if (!fs.existsSync(video)) { console.error('ERROR: video not found: ' + video); process.exit(1); }
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });

(async () => {
  const tiles = [];
  for (let t = from; t <= to; t += every) {
    const f = path.join(out, 'frames', hms(t).replace(/:/g, '') + '.png');
    const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', (crop ? `crop=${crop},` : "") + `scale=${width}:-2`, '-y', f], { windowsHide: true });
    if (r.status !== 0 || !fs.existsSync(f)) { console.error('WARN: no frame at ' + hms(t)); continue; }
    tiles.push({ t: hms(t), file: f });
  }
  if (!tiles.length) { console.error('ERROR: no frames'); process.exit(1); }
  const meta = await sharp(tiles[0].file).metadata();
  const th = meta.height, lab = 34, rows = Math.ceil(tiles.length / cols);
  const comps = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = (i % cols) * width, y = Math.floor(i / cols) * (th + lab);
    comps.push({ input: tiles[i].file, left: x, top: y + lab });
    const svg = `<svg width="${width}" height="${lab}"><rect width="100%" height="100%" fill="#222"/><text x="8" y="25" font-family="Arial" font-size="24" fill="#ffd200">${i + 1}  ${tiles[i].t}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y });
  }
  await sharp({ create: { width: cols * width, height: rows * (th + lab), channels: 3, background: '#000' } }).composite(comps).png().toFile(path.join(out, 'contact-sheet.png'));
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ video, from: hms(from), to: hms(to), every, tiles }, null, 2));
  console.log(`OK -> ${path.join(out, 'contact-sheet.png')} (${tiles.length} tiles)`);
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
