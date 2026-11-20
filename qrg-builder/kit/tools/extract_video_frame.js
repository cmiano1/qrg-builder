#!/usr/bin/env node
'use strict';

/* Exact-frame extraction helper. Uses the ffmpeg-static package (video add-on: npm run add-video).
 * --fast-seek: put -ss before -i (input seeking). Modern ffmpeg decodes to the exact
 * timestamp either way, but input seeking skips decoding everything before it, so a frame deep in a
 * multi-GB meeting recording takes seconds instead of minutes. Default behavior is unchanged. */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let ffmpeg;
try {
  ffmpeg = require('ffmpeg-static');
} catch (err) {
  console.error('ERROR: ffmpeg-static is not installed. In the kit folder run: npm run add-video');
  process.exit(2);
}

function fail(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node extract_video_frame.js <video> <timestamp> <output.png> [--overwrite] [--fast-seek]

Examples:
  node extract_video_frame.js demo.mp4 00:04:32.500 work\\figure.png
  node extract_video_frame.js demo.mp4 272.5 work\\figure.png --overwrite
`);
}

const argv = process.argv.slice(2);
const overwrite = argv.includes('--overwrite');
const fastSeek = argv.includes('--fast-seek');
const positional = argv.filter(x => x !== '--overwrite' && x !== '--fast-seek');
if (positional.length !== 3) { usage(); process.exit(2); }

const input = path.resolve(positional[0]);
const timestamp = positional[1];
const output = path.resolve(positional[2]);

if (!fs.existsSync(input)) fail(`Input video not found: ${input}`);
if (fs.existsSync(output) && !overwrite) fail(`Output already exists: ${output}. Use --overwrite only when replacement is intentional.`);
fs.mkdirSync(path.dirname(output), { recursive: true });

const args = [
  '-hide_banner',
  ...(fastSeek ? ['-ss', timestamp, '-i', input] : ['-i', input, '-ss', timestamp]),
  '-map', '0:v:0',
  '-frames:v', '1',
  '-vsync', '0',
  overwrite ? '-y' : '-n',
  output
];

const r = spawnSync(ffmpeg, args, { encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 32 * 1024 * 1024 });
if (r.error) fail(r.error.message);
if (r.status !== 0) fail(`ffmpeg failed:\n${r.stderr}`);
if (!fs.existsSync(output) || fs.statSync(output).size === 0) fail('ffmpeg returned success but no non-empty output file was created.');

console.log(`OK -> ${output}`);
