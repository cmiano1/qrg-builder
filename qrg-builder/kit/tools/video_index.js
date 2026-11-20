#!/usr/bin/env node
'use strict';

/*
 * Generalized video indexer (coarse-to-fine screenshot search).
 *
 * Uses the existing Node dependencies:
 *   ffmpeg-static
 *   ffprobe-static
 *   pngjs
 *
 * Produces:
 *   <outDir>/frames/frame-0001.png ...
 *   <outDir>/contact-sheet.png
 *   <outDir>/index.json
 *   <outDir>/index.md
 *
 * Modes:
 *   --mode uniform --samples 24
 *   --mode interval --interval 5
 *   --mode scene --threshold 0.30 --max 60
 *
 * The contact sheet intentionally has no rendered text labels. Tile order is
 * recorded in index.json/index.md so the visual index stays dependency-light.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');

let ffmpeg;
let ffprobe;
try {
  ffmpeg = require('ffmpeg-static');
  const fp = require('ffprobe-static');
  ffprobe = fp.path || fp;
} catch (err) {
  console.error('ERROR: the video packages are not installed. In the kit folder run: npm run add-video');
  console.error(err.message);
  process.exit(2);
}

function fail(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node video_index.js <video> --out <dir> [options]

Options:
  --mode uniform|interval|scene   Default: uniform
  --samples N                    Uniform target frame count. Default: 24
  --interval SECONDS             Interval mode spacing. Default: 5
  --threshold VALUE              Scene threshold 0..1. Default: 0.30
  --max N                        Max scene candidates. Default: 60
  --thumb-width N                Thumbnail width. Default: 480
  --columns N                    Contact-sheet columns. Default: 4
  --overwrite                    Allow replacing an existing output directory
`);
}

function parseArgs(argv) {
  const args = { mode: 'uniform', samples: 24, interval: 5, threshold: 0.30, max: 60, thumbWidth: 480, columns: 4, overwrite: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    if (a === '--overwrite') { args.overwrite = true; continue; }
    const v = argv[++i];
    if (v == null) fail(`Missing value for ${a}`);
    if (a === '--out') args.out = v;
    else if (a === '--mode') args.mode = v;
    else if (a === '--samples') args.samples = Number(v);
    else if (a === '--interval') args.interval = Number(v);
    else if (a === '--threshold') args.threshold = Number(v);
    else if (a === '--max') args.max = Number(v);
    else if (a === '--thumb-width') args.thumbWidth = Number(v);
    else if (a === '--columns') args.columns = Number(v);
    else fail(`Unknown option: ${a}`);
  }
  args.video = positional[0];
  return args;
}

function run(exe, args) {
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

function probe(video) {
  const r = run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,sample_aspect_ratio,display_aspect_ratio:format=duration', '-of', 'json', video]);
  if (r.status !== 0) fail(`ffprobe failed:\n${r.stderr}`);
  const data = JSON.parse(r.stdout);
  if (!data.streams || !data.streams[0]) fail('No video stream found.');
  const s = data.streams[0];
  return {
    duration: Number(data.format && data.format.duration),
    width: Number(s.width),
    height: Number(s.height),
    avgFrameRate: s.avg_frame_rate,
    sampleAspectRatio: s.sample_aspect_ratio,
    displayAspectRatio: s.display_aspect_ratio
  };
}

function ensureOutput(outDir, overwrite) {
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir);
    if (entries.length && !overwrite) fail(`Output directory is not empty: ${outDir}. Use --overwrite only for disposable work output.`);
    if (overwrite) fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
}

function extractCandidates(video, outDir, opts, meta) {
  const pattern = path.join(outDir, 'frames', 'frame-%04d.png');
  let selector;
  if (opts.mode === 'uniform') {
    const n = Math.max(1, Math.floor(opts.samples));
    if (!Number.isFinite(meta.duration) || meta.duration <= 0) fail('Uniform mode requires a valid video duration.');
    const fps = n / meta.duration;
    selector = `fps=${fps},scale=${opts.thumbWidth}:-2,showinfo`;
  } else if (opts.mode === 'interval') {
    if (!(opts.interval > 0)) fail('--interval must be > 0.');
    selector = `fps=1/${opts.interval},scale=${opts.thumbWidth}:-2,showinfo`;
  } else if (opts.mode === 'scene') {
    if (!(opts.threshold >= 0 && opts.threshold <= 1)) fail('--threshold must be between 0 and 1.');
    selector = `select='gt(scene,${opts.threshold})',scale=${opts.thumbWidth}:-2,showinfo`;
  } else {
    fail(`Unsupported mode: ${opts.mode}`);
  }

  const args = ['-hide_banner', '-i', video, '-vf', selector, '-vsync', 'vfr', '-an', '-y', pattern];
  const r = run(ffmpeg, args);
  if (r.status !== 0) fail(`ffmpeg candidate extraction failed:\n${r.stderr}`);

  const times = [];
  const re = /pts_time:([0-9.+-]+)/g;
  let m;
  while ((m = re.exec(r.stderr)) !== null) times.push(Number(m[1]));

  let files = fs.readdirSync(path.join(outDir, 'frames')).filter(f => /^frame-\d+\.png$/i.test(f)).sort();
  if (opts.mode === 'scene' && files.length > opts.max) {
    const keep = new Set(files.slice(0, opts.max));
    for (const f of files) if (!keep.has(f)) fs.unlinkSync(path.join(outDir, 'frames', f));
    files = files.slice(0, opts.max);
  }

  if (!files.length) {
    // Scene detection can legitimately yield no frames. Fall back to a small uniform index.
    if (opts.mode === 'scene') {
      console.warn('WARN: Scene mode yielded no candidates. Falling back to 12 uniform samples.');
      return extractCandidates(video, outDir, { ...opts, mode: 'uniform', samples: 12 }, meta);
    }
    fail('No candidate frames were produced.');
  }

  return files.map((file, i) => ({
    tile: i + 1,
    file,
    timestampSeconds: Number.isFinite(times[i]) ? times[i] : null
  }));
}

function formatTime(sec) {
  if (!Number.isFinite(sec)) return 'unknown';
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const x = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(x).padStart(3,'0')}`;
}

function buildSheet(outDir, items, columns) {
  const images = items.map(item => PNG.sync.read(fs.readFileSync(path.join(outDir, 'frames', item.file))));
  const tileW = Math.max(...images.map(i => i.width));
  const tileH = Math.max(...images.map(i => i.height));
  const cols = Math.max(1, Math.floor(columns));
  const rows = Math.ceil(images.length / cols);
  const gap = 8;
  const sheet = new PNG({ width: cols * tileW + (cols + 1) * gap, height: rows * tileH + (rows + 1) * gap });
  sheet.data.fill(245);

  images.forEach((img, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = gap + col * tileW;
    const y = gap + row * tileH;
    PNG.bitblt(img, sheet, 0, 0, img.width, img.height, x, y);
  });

  fs.writeFileSync(path.join(outDir, 'contact-sheet.png'), PNG.sync.write(sheet));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.video || !opts.out) { usage(); process.exit(2); }
  const video = path.resolve(opts.video);
  const outDir = path.resolve(opts.out);
  if (!fs.existsSync(video)) fail(`Video not found: ${video}`);
  if (!Number.isFinite(opts.thumbWidth) || opts.thumbWidth < 64) fail('--thumb-width must be >= 64.');
  if (!Number.isFinite(opts.columns) || opts.columns < 1) fail('--columns must be >= 1.');

  ensureOutput(outDir, opts.overwrite);
  const meta = probe(video);
  const items = extractCandidates(video, outDir, opts, meta);
  buildSheet(outDir, items, opts.columns);

  const manifest = {
    source: video,
    createdAt: new Date().toISOString(),
    mode: opts.mode,
    metadata: meta,
    contactSheet: 'contact-sheet.png',
    framesDirectory: 'frames',
    items: items.map(x => ({ ...x, timestamp: formatTime(x.timestampSeconds) }))
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(manifest, null, 2));

  const lines = [
    '# Video Index', '',
    `- Source: \`${video}\``,
    `- Mode: \`${opts.mode}\``,
    `- Duration: ${formatTime(meta.duration)}`,
    `- Contact sheet: \`contact-sheet.png\``, '',
    '| Tile | Timestamp | Frame |',
    '|---:|---|---|',
    ...manifest.items.map(i => `| ${i.tile} | ${i.timestamp} | \`frames/${i.file}\` |`),
    ''
  ];
  fs.writeFileSync(path.join(outDir, 'index.md'), lines.join('\n'));

  console.log(`OK: ${items.length} candidate frames`);
  console.log(`Contact sheet: ${path.join(outDir, 'contact-sheet.png')}`);
  console.log(`Manifest: ${path.join(outDir, 'index.md')}`);
}

main();
