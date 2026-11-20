#!/usr/bin/env node
/*
 * extract_captions_vtt.js
 *
 * Pulls the embedded caption track (mov_text) out of a Google Meet recording
 * (.mp4) and saves it as a clean WebVTT (.vtt) file next to the video.
 *
 * What it does:
 *   - Reads the subtitle stream with the local ffmpeg-static (no system ffmpeg).
 *   - Keeps every cue and every start/end time exactly as recorded (ms precision).
 *     Cues are never merged, split, or retimed.
 *   - Turns "(Speaker Name)" label lines into WebVTT voice tags: <v Speaker Name>.
 *     Empty "()" labels become untagged lines (speaker unknown).
 *   - A cue holding more than one speaker (separated by "-" in the source) keeps
 *     each speaker on its own line inside the same cue.
 *   - Writes a header NOTE with the source file, extraction time, and cue count.
 *   - Refuses to overwrite an existing .vtt unless --force is passed.
 *   - Never modifies the source video.
 *
 * Usage:
 *   node extract_captions_vtt.js <video.mp4> [more.mp4 ...] [--force] [--out-dir <dir>]
 *
 * Output name: "<video name minus ' - Recording'> - Captions.vtt"
 *   e.g. "... 09_58 EDT - Recording.mp4" -> "... 09_58 EDT - Captions.vtt"
 *
 * Caveat: the captions are machine generated; text and speaker names may be wrong.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let ffmpeg;
try { ffmpeg = require('ffmpeg-static'); } catch (e) { console.error('ffmpeg-static is not installed. In the kit folder run: npm run add-video'); process.exit(2); }

const args = process.argv.slice(2);
const force = args.includes('--force');
let outDir = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--force') continue;
  if (args[i] === '--out-dir') { outDir = args[++i]; continue; }
  files.push(args[i]);
}
if (!files.length) {
  console.error('Usage: node extract_captions_vtt.js <video.mp4> [...] [--force] [--out-dir <dir>]');
  process.exit(1);
}

const TIME = /^(\d{2}:\d{2}:\d{2}),(\d{3}) --> (\d{2}:\d{2}:\d{2}),(\d{3})$/;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parseSrt(srt) {
  const lines = srt.replace(/\r/g, '').split('\n');
  const cues = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TIME);
    // A timing line is preceded by a cue-number line; anything else is body text.
    if (m && i > 0 && /^\d+$/.test(lines[i - 1].trim())) {
      if (cur) cur.body.pop(); // drop the cue-number line captured as body
      cur = { start: `${m[1]}.${m[2]}`, end: `${m[3]}.${m[4]}`, body: [] };
      cues.push(cur);
    } else if (cur) {
      cur.body.push(lines[i]);
    }
  }
  return cues;
}

function cueToVtt(body) {
  // Split into speaker segments on lone "-" lines.
  const segs = [[]];
  for (const l of body) {
    if (l.trim() === '-') segs.push([]); else segs[segs.length - 1].push(l);
  }
  const out = [];
  for (const seg of segs) {
    const ls = seg.map(s => s.trim()).filter(Boolean);
    if (!ls.length) continue;
    let speaker = '';
    const sp = ls[0].match(/^\((.*)\)$/);
    if (sp) { speaker = sp[1].trim(); ls.shift(); }
    const text = esc(ls.join(' ').trim());
    if (!text) continue;
    out.push(speaker ? `<v ${esc(speaker)}>${text}</v>` : text);
  }
  return out;
}

let failed = 0;
for (const video of files) {
  const abs = path.resolve(video);
  const base = path.basename(abs, path.extname(abs)).replace(/ - Recording$/, '');
  const out = path.join(outDir ? path.resolve(outDir) : path.dirname(abs), `${base} - Captions.vtt`);
  if (fs.existsSync(out) && !force) {
    console.error(`SKIP (exists, use --force): ${out}`);
    continue;
  }
  let srt;
  try {
    srt = execFileSync(ffmpeg, ['-v', 'error', '-i', abs, '-map', '0:s:0', '-f', 'srt', '-'],
      { maxBuffer: 512 * 1024 * 1024 }).toString('utf8');
  } catch (e) {
    console.error(`FAIL (no caption track or read error): ${abs}\n${e.message}`);
    failed++;
    continue;
  }
  const cues = parseSrt(srt);
  const blocks = [];
  let n = 0, tagged = 0, untagged = 0, emptyCues = 0;
  for (const c of cues) {
    const lines = cueToVtt(c.body);
    if (!lines.length) { emptyCues++; continue; }
    n++;
    lines.forEach(l => (l.startsWith('<v ') ? tagged++ : untagged++));
    blocks.push(`${n}\n${c.start} --> ${c.end}\n${lines.join('\n')}`);
  }
  const header = [
    'WEBVTT',
    '',
    'NOTE',
    `Source: ${path.basename(abs)}`,
    `Extracted: ${new Date().toISOString()} by extract_captions_vtt.js`,
    `Cues: ${n} (source cues ${cues.length}, empty dropped ${emptyCues})`,
    `Speaker lines: ${tagged} tagged, ${untagged} unknown`,
    'Timing is exactly as recorded in the video caption track.',
    'Machine-generated captions: text and speaker names may contain errors.',
  ].join('\n');
  fs.writeFileSync(out, `${header}\n\n${blocks.join('\n\n')}\n`, 'utf8');
  console.log(`OK ${n} cues (${tagged} tagged / ${untagged} unknown speaker lines) -> ${out}`);
}
process.exit(failed ? 1 : 0);
