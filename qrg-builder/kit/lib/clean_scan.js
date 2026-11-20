// lib/clean_scan.js: the "client-ready" scan of one .docx. Read-only. It reports what a script can see; a person still
// reads every hit (some are fine in context, for example a "Pending" status that really is on the screen).
// blockers = file artifacts a generator never writes (tracked changes, comments, hidden text, highlight, yellow shading):
//   any of these means someone edited the file by hand, so lock_guides.js refuses to lock it.
// hits = text lines worth a look: hold (a line waiting on someone), note (internal or reviewer text), id (an internal
//   tracking ID from qa.idPatterns), name (a person from qa.names / qa_names.txt), dash, draftmark, space (double space).
const JSZip = require("jszip");
const mammoth = require("mammoth");

const BASE_RULES = [
  ["hold", /\bto (be )?confirm(ed)?\b/i],
  ["hold", /\bbeing confirmed\b/i],
  ["hold", /\b(not yet|un)confirmed\b/i],
  ["hold", /\bconfirm (with|this|that|whether|if)\b/i],
  ["hold", /\b(TBD|TBC|TODO|FIXME|XXX)\b/],
  ["hold", /\bplaceholder\b/i],
  ["hold", /\bpending\b/i],
  ["hold", /\bawaiting\b/i],
  ["hold", /\bverify (with|whether|that)\b/i],
  ["hold", /\b(open|outstanding) question\b/i],
  ["hold", /\bstill (being )?(decided|settled|tested|checked)\b/i],
  ["hold", /\bnot (yet )?(decided|settled|known|tested|verified)\b/i],
  ["hold", /\b(check with|ask) your (supervisor|lead|manager|team lead|facilitator|trainer)\b/i],
  ["hold", /\byour (team|unit|business unit) (will|to) (decide|confirm|agree)\b/i],
  ["hold", /\b(may|might|can) (change|differ) (after|before|once)\b/i],
  ["hold", /\?\?/],
  ["note", /\b(SME|build team|reviewer|internal note|note to|for review|draft)\b/i],
  ["note", /\b(recording|transcript|walkthrough)\b/i],
  ["note", /\b\d{1,2}:\d{2}:\d{2}\b/],
  ["note", /\[[^\]]{2,80}\]/],
  ["note", /\b(sandbox|UAT|test (site|account|case|org|login))\b/i],
  ["dash", new RegExp("[" + String.fromCharCode(8211) + String.fromCharCode(8212) + "]")],
];
const xmlText = (x) => (x.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rulesFor(P) {
  const rules = [...BASE_RULES];
  for (const p of P.cfg.qa.idPatterns || []) rules.push(["id", new RegExp(p)]);
  if (P.names.length) rules.push(["name", new RegExp("\\b(" + P.names.map(esc).join("|") + ")\\b")]);
  return rules;
}

async function scanDocx(buf, P) {
  const RULES = rulesFor(P);
  const zip = await JSZip.loadAsync(buf);
  const part = async (n) => (zip.file(n) ? zip.file(n).async("string") : "");
  const doc = await part("word/document.xml");
  const hf = [];
  for (const n of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) hf.push([n, xmlText(await part(n))]);
  const core = await part("docProps/core.xml");
  const meta = {};
  for (const k of ["dc:title", "dc:subject", "dc:creator", "cp:lastModifiedBy", "cp:keywords", "dc:description", "cp:category"]) {
    const m = core.match(new RegExp("<" + k + "[^>]*>([^<]*)</" + k + ">"));
    if (m && m[1].trim()) meta[k] = m[1];
  }
  const app = await part("docProps/app.xml");
  const co = app.match(/<Company>([^<]*)<\/Company>/);
  if (co && co[1].trim()) meta.Company = co[1];
  const palette = new Set(Object.values(P.cfg.palette).map((c) => String(c).toUpperCase()));
  const reds = (doc.match(/<w:color w:val="(FF0000|E00000|CC0000|FF3333|C0504D|D00000|C00000)"/gi) || [])
    .filter((m) => !palette.has(m.slice(-8, -2).toUpperCase()));
  const xml = {
    trackedChanges: (doc.match(/<w:(ins|del|moveFrom|moveTo) /g) || []).length,
    comments: ((await part("word/comments.xml")).match(/<w:comment /g) || []).length,
    highlight: (doc.match(/<w:highlight /g) || []).length,
    hiddenText: (doc.match(/<w:vanish\/>|<w:vanish w:val="(true|1|on)"/g) || []).length,
    yellowShade: (doc.match(/w:fill="(FFFF00|FFF200|FFFF66|FFFF99)"/gi) || []).length,
    redText: reds.length,
    goBack: (doc.match(/w:name="_GoBack"/g) || []).length,
    images: (doc.match(/<pic:pic /g) || []).length,
    emptyParaRuns: 0,
  };
  const empties = doc.split(/<\/w:p>/).map((p) => xmlText(p).trim() === "" && !/<w:drawing|<w:tbl|<w:br w:type="page"/.test(p));
  let run = 0;
  for (const e of empties) { run = e ? run + 1 : 0; if (run === 3) xml.emptyParaRuns++; }

  const raw = (await mammoth.extractRawText({ buffer: buf })).value;
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const hits = [];
  lines.forEach((l, i) => {
    for (const [kind, re] of RULES) if (re.test(l)) { hits.push({ kind, line: i + 1, text: l.length > 220 ? l.slice(0, 220) + "..." : l }); break; }
    if (/ {2,}/.test(l.replace(/^(TIP|NOTE|IMPORTANT)  /, ""))) hits.push({ kind: "space", line: i + 1, text: "double space: " + l.slice(0, 120) });
  });
  for (const [n, t] of hf) {
    if (/\bdraft\b/i.test(t)) hits.push({ kind: "draftmark", line: 0, text: n + ": " + t.slice(0, 160) });
    for (const [kind, re] of RULES) if (kind !== "note" && re.test(t)) hits.push({ kind, line: 0, text: n + ": " + t.slice(0, 160) });
  }
  if (/\bDRAFT\b/.test(raw)) hits.push({ kind: "draftmark", line: 0, text: "the word DRAFT appears in the body" });
  if (meta["cp:lastModifiedBy"] && meta["cp:lastModifiedBy"] !== P.cfg.author) hits.push({ kind: "meta", line: 0, text: "last modified by " + meta["cp:lastModifiedBy"] + " (the file was saved in Word after the build)" });
  if (meta["dc:creator"] && P.cfg.author && meta["dc:creator"] !== P.cfg.author) hits.push({ kind: "meta", line: 0, text: "author is " + meta["dc:creator"] + ", config says " + P.cfg.author });
  const blockers = ["trackedChanges", "comments", "hiddenText", "highlight", "yellowShade"].filter((k) => xml[k] > 0).map((k) => k + " " + xml[k]);
  return { lines: lines.length, xml, meta, headerFooter: hf.map(([n, t]) => n + ": " + t), hits, blockers };
}

module.exports = { scanDocx };
