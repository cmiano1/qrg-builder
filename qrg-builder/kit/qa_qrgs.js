// qa_qrgs.js: QA for one set of QRGs built by build_qrgs.js. Read-only on the guides. Exit 1 on any finding.
// Checks every current build in the set's output folder (not _archive/), or with --scratch the newest test build of each guide:
//   - Google safety: tools/gdocs_lint.js (page size, table widths, real tabs, no exact line spacing, inline pictures with
//     alt text, one font, borders 1/2 pt or more, heading keep-with-next, no text boxes or shapes). A lint FAIL is a
//     finding; WARN lines are printed only.
//   - Structure: one Title, the section order from the config, one continuous step list, the page-break rules (steps keep
//     their lines together, steps keep with the figure after them, a callout right under a heading keeps with what
//     follows, a gap after every table), and the footer (title, real tab at the right margin, PAGE field).
//   - Figures: numbered in order, caption steps match the badges in assets/<key>NN/annotate.json (matched by image hash),
//     alt text matches the caption, and each captioned figure keeps with its caption.
//   - Text: em and en dashes, British spellings and filler words, people's names (config qa.names + qa_names.txt),
//     session and build words, guide numbers, dates, other guides' titles, and any qa.extraBanned patterns.
// Writes a text extract per guide to <set dir>/_work/qa_text_NN.txt (read it: the QA cannot judge meaning).
// Usage:
//   node qa_qrgs.js --set=<id>                 all live builds in the set
//   node qa_qrgs.js --set=<id> 03              one guide
//   node qa_qrgs.js --set=<id> 03 --scratch    the newest test build of 03
//   node qa_qrgs.js --set=<id> --file="<one build.docx>"   any one build (archived, or a hand-edited copy)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadConfig, arg, flag } = require("./lib/config"); // first: it stops plainly if the packages are missing
const JSZip = require("jszip");
const mammoth = require("mammoth");
const { lintDocx } = require("./tools/gdocs_lint.js");

const P = loadConfig();
const setId = arg("set") || process.env.QRG_SET;
if (!setId) { console.error("usage: node qa_qrgs.js --set=<id> [NN] [--scratch] [--file=<docx>]"); process.exit(2); }
const SET = P.getSet(setId);
const KEY = SET.assetKey || SET.id.replace(/[^A-Za-z0-9]/g, "");
const args = process.argv.slice(2);
const useScratch = flag("scratch");
const ONLY = args.find((a) => /^\d\d$/.test(a));
const FILE = arg("file") || "";
const DIR = FILE ? path.dirname(path.resolve(FILE)) : useScratch ? SET.scratchDir : SET.outDir;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_RE = new RegExp("^" + esc(SET.prefix) + " (\\d\\d) - .+ - [A-Z]+ \\d{8}-\\d{4}\\.docx$");
const STAMP_TAIL = / - [A-Z]+ \d{8}-\d{4}\.docx$/;
if (FILE && !NAME_RE.test(path.basename(FILE))) { console.log('--file must be a "' + SET.prefix + ' NN - ... - STATUS YYYYMMDD-HHMM.docx" build'); process.exit(2); }
const SECTIONS = P.cfg.sections;
const EM_DASH = String.fromCharCode(0x2014), EN_DASH = String.fromCharCode(0x2013); // kept as codes so this file stays ASCII
const GUIDE_TITLES = (fs.existsSync(SET.guidesDir) ? fs.readdirSync(SET.guidesDir) : []).filter((f) => /^\d\d\.js$/.test(f))
  .map((f) => (fs.readFileSync(path.join(SET.guidesDir, f), "utf8").match(/\btitle:\s*"([^"]+)"/) || [])[1]).filter(Boolean);
const NAMES_RE = P.names.length ? new RegExp("\\b(" + P.names.map(esc).join("|") + ")\\b", "g") : null;
// Words that tie a guide to one person, session, or the build. Override with qa.sessionWords (a regex source string).
const SESSION_RE = new RegExp(P.cfg.qa.sessionWords
  || "\\b(Day [1-9]|session|training|recording|walkthrough|sandbox|UAT|TBD|TBC|TODO|FIXME|to be confirmed|CHECK BEFORE|reviewer|dry run|facilitator|trainer|trainee|last updated)\\b", "gi");
// Guide numbers: any word from the set prefixes or footer tags, or QRG / guide, followed by a two-digit number.
const NUM_WORDS = [...new Set(P.sets.flatMap((s) => (s.prefix + " " + s.footerTag).split(/\s+/)).filter((w) => w.length >= 3 && /^[A-Za-z]+$/.test(w)))];
const GUIDE_NUM_RE = new RegExp("\\b(" + [...NUM_WORDS.map(esc), "QRG", "guide"].join("|") + ") ?(0\\d|[1-9]\\d)\\b", "gi");
const STYLE_RE = /\b(organis|colour|towards|behaviour|favour|grey|tick|untick|leverage|robust|seamless|delve|elevate|unlock|tapestry)\w*/gi;
const STYLE_ALLOW = (P.cfg.qa.styleAllow || []).map((s) => new RegExp(esc(s), "g"));
const EXTRA = (P.cfg.qa.extraBanned || []).map((x) => [x.label || "banned", new RegExp(x.pattern, x.flags || "g")]);
const ID_RES = (P.cfg.qa.idPatterns || []).map((p) => new RegExp(p, "g"));

let files = FILE ? [path.basename(FILE)]
  : fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => NAME_RE.test(f) && (!ONLY || f.startsWith(SET.prefix + " " + ONLY + " "))) : [];
if (!FILE) files = files.filter((f) => fs.existsSync(path.join(SET.guidesDir, f.match(NAME_RE)[1] + ".js")));
if (useScratch && !FILE) { // newest build of each guide (stamps sort as text)
  const newest = {};
  for (const f of files.sort()) newest[f.replace(STAMP_TAIL, "")] = f;
  files = Object.values(newest);
}
let bad = 0;
const fail = (m) => { bad++; console.log("  FAIL " + m); };
const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const attr = (tag, a) => ((tag.match(new RegExp(`w:${a}="([^"]+)"`)) || [])[1]);
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const text = (p) => unxml([...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""));

// "(step 1)", "(steps 4 and 5)", "(steps 6 to 10)", "(steps 22, 24, and 25)" -> [numbers]
function captionSteps(cap) {
  const m = cap.match(/\(steps? ([^)]+)\)/);
  if (!m) return null;
  const out = [];
  for (const part of m[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
    const r = part.match(/^(\d+) to (\d+)$/);
    if (r) { for (let i = +r[1]; i <= +r[2]; i++) out.push(i); continue; }
    if (/^\d+$/.test(part.trim())) out.push(+part.trim());
  }
  return out;
}

(async () => {
  console.log("Set " + SET.id + " (" + SET.prefix + "). Checking " + (FILE ? "one file in " : useScratch ? "scratch builds in " : "live builds in ") + DIR);
  if (!files.length) { console.log("No current builds found."); process.exit(1); }
  if (!useScratch && !FILE) { // two live builds of one guide = active-version drift
    const prefixes = files.map((f) => f.replace(STAMP_TAIL, ""));
    prefixes.forEach((p, i) => { if (prefixes.indexOf(p) !== i) fail("more than one live build of " + p); });
  }
  fs.mkdirSync(SET.workDir, { recursive: true });

  for (const f of files) {
    const nn = f.match(NAME_RE)[1];
    console.log("\n== " + f);
    const buf = fs.readFileSync(path.join(DIR, f));
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml").async("string");
    const paras = xml.split(/(?=<w:p>|<w:p )/);

    const lint = await lintDocx(buf, { page: P.cfg.page, fullWidth: true, fonts: [P.cfg.font] });
    for (const r of lint) {
      if (r.level === "FAIL") fail("google " + r.rule + ": " + r.detail);
      else console.log("  warn google " + r.rule + ": " + r.detail);
    }
    const pg = xml.match(/<w:pgSz[^>]*>/)[0], mar = xml.match(/<w:pgMar[^>]*>/)[0];
    const contentW = +attr(pg, "w") - +attr(mar, "left") - +attr(mar, "right");
    console.log(`  page ${attr(pg, "w")} x ${attr(pg, "h")} twips, content width ${contentW}; tables ${xml.split("<w:tbl>").length - 1}; `
      + `google lint ${lint.filter((r) => r.level === "FAIL").length} fail, ${lint.filter((r) => r.level === "WARN").length} warn`);

    // Title and section order.
    const styles = [...xml.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)].map((m) => m[1]);
    const count = (s) => styles.filter((x) => x === s).length;
    console.log(`  styles: Title ${count("Title")}, Heading1 ${count("Heading1")}, Heading2 ${count("Heading2")}`);
    if (count("Title") !== 1) fail("expected exactly one Title paragraph");
    const title = text(paras.find((p) => p.includes('<w:pStyle w:val="Title"/>')) || "");
    const h1 = paras.filter((p) => p.includes('<w:pStyle w:val="Heading1"/>')).map(text);
    { const body = paras.map(text).join("\n");
      for (const t of GUIDE_TITLES) if (t !== title && body.includes(t)) fail(`mentions another guide by title: "${t}"`); }
    if (nn !== "00" && h1.join("|") !== SECTIONS.join("|")) fail(`sections are "${h1.join(", ")}"; expected "${SECTIONS.join(", ")}"`);

    // Footer: "{title}  ·  {footerTag}", a real tab to a right tab stop at the margin, "Page", PAGE field.
    const footer = zip.file("word/footer1.xml") ? await zip.file("word/footer1.xml").async("string") : "";
    const ftext = text(footer);
    const tabPos = +((footer.match(/<w:tab w:val="right" w:pos="(\d+)"/) || [])[1]);
    const footProblems = [];
    if (!ftext.startsWith(title + "  ·  " + SET.footerTag)) footProblems.push(`text "${ftext}"`);
    if (!/<w:tab\/>/.test(footer)) footProblems.push("no tab element");
    if (tabPos !== contentW) footProblems.push(`right tab at ${tabPos}, margin at ${contentW}`);
    if (!/<w:instrText[^>]*>\s*PAGE\s*</.test(footer)) footProblems.push("no PAGE field");
    console.log(`  footer: ${footProblems.length ? "BAD" : "ok"} ("${ftext}" + page number)`);
    if (footProblems.length) fail("footer: " + footProblems.join("; "));

    // Every numbered step on one list, and no list overrides left.
    const numIds = [...xml.matchAll(/<w:numPr>[\s\S]*?<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    const numbering = await zip.file("word/numbering.xml").async("string");
    console.log(`  numbered paragraphs: ${numIds.length} on numId ${[...new Set(numIds)].join(",")}; lvlOverride left: ${/<w:lvlOverride/.test(numbering)}`);
    if (/<w:lvlOverride/.test(numbering)) fail("numbering still has lvlOverride (pack() did not run)");

    // Page-break rules: every step keeps its lines together, and the run of steps just before a figure keeps with it.
    const isStep = (p) => p.includes("<w:numPr>") && p.includes("<w:keepNext") && !p.includes("<w:drawing>");
    const stepParas = paras.filter(isStep);
    const noKeepLines = stepParas.filter((p) => !p.includes("<w:keepLines/>")).length;
    // keepRun: N in the guide file checks only the last N steps before each figure (for a long run that cannot all fit).
    const gfile = path.join(SET.guidesDir, nn + ".js");
    const keepRun = fs.existsSync(gfile) ? +((fs.readFileSync(gfile, "utf8").match(/^\s*keepRun:\s*(\d+)/m) || [])[1] || Infinity) : Infinity;
    let loose = 0;
    paras.forEach((p, i) => {
      if (!p.includes("<w:drawing>")) return;
      for (let j = i - 1, k = 0; j >= 0 && isStep(paras[j]) && k < keepRun; j--, k++) if (!paras[j].includes("<w:keepNext/>")) loose++;
    });
    console.log(`  steps: ${stepParas.length}; without keepLines: ${noKeepLines}; steps before a figure not kept with it: ${loose}`);
    if (noKeepLines) fail(noKeepLines + " step(s) can split across pages (no keepLines)");
    if (loose) fail(loose + " step(s) just before a figure are not kept with it");
    let leads = 0, leadLoose = 0, crowded = 0;
    for (const m of xml.matchAll(/<w:tbl>/g)) {
      const before = xml.slice(0, m.index);
      const prev = before.slice(Math.max(before.lastIndexOf("<w:p>"), before.lastIndexOf("<w:p ")));
      const end = xml.indexOf("</w:tbl>", m.index) + "</w:tbl>".length;
      const tbl = xml.slice(m.index, end);
      const next = (xml.slice(end).match(/^<w:p[ >][\s\S]*?<\/w:p>/) || [""])[0];
      const nextIsGap = !!next && !/<w:t[ >]/.test(next) && !next.includes("<w:drawing>");
      if (!xml.slice(end).startsWith("<w:sectPr") && !nextIsGap && !/<w:pStyle w:val="Heading\d"\/>/.test(next) && !next.includes("<w:drawing>")) crowded++;
      if (!/<w:pStyle w:val="Heading\d"\/>/.test(prev) || (tbl.match(/<w:tc>/g) || []).length !== 1) continue;
      leads++;
      if (!tbl.includes("<w:keepNext/>") || (nextIsGap && !next.includes("<w:keepNext/>"))) leadLoose++;
    }
    console.log(`  callouts right under a heading: ${leads}; not kept with what follows: ${leadLoose}; text right after a table: ${crowded}`);
    if (leadLoose) fail(leadLoose + " callout(s) right under a heading are not kept with what follows");
    if (crowded) fail(crowded + " table(s) with text right after them (no gap paragraph)");

    // Figures in document order, matched to the annotated PNGs by content hash.
    const ann = path.join(SET.assetsDir, KEY + nn, "annotate.json");
    const manifest = fs.existsSync(ann) ? JSON.parse(fs.readFileSync(ann, "utf8")) : { figures: [] };
    const outDir = path.join(path.dirname(ann), manifest.outDir || "out");
    const byHash = {};
    for (const fig of manifest.figures) {
      const fp = path.join(outDir, fig.out);
      if (fs.existsSync(fp)) byHash[sha(fs.readFileSync(fp))] = fig;
    }
    const rels = await zip.file("word/_rels/document.xml.rels").async("string");
    const relAttr = (tag, a) => ((tag.match(new RegExp(` ${a}="([^"]+)"`)) || [])[1]);
    const relTarget = Object.fromEntries([...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => [relAttr(m[0], "Id"), relAttr(m[0], "Target")]));
    const figs = [];
    paras.forEach((p, i) => {
      const e = p.match(/<a:blip r:embed="([^"]+)"/);
      if (!e) return;
      const docPr = (p.match(/<wp:docPr [^>]*>/) || [""])[0];
      figs.push({ media: "word/" + relTarget[e[1]], caption: text(paras[i + 1] || ""), keep: p.includes("<w:keepNext/>"),
        descr: unxml((docPr.match(/ descr="([^"]*)"/) || [])[1] || "") });
    });
    console.log(`  figures: ${figs.length}`);
    let figNo = 0;
    for (const fg of figs) {
      figNo++;
      const fig = byHash[sha(await zip.file(fg.media).async("nodebuffer"))];
      const capNo = (fg.caption.match(/^Figure (\d+)\./) || [])[1];
      const steps = captionSteps(fg.caption) || [];
      const badges = fig ? [...new Set((fig.boxes || []).map((b) => b.n).filter((n) => n != null))].sort((a, b) => a - b) : [];
      const altOk = fg.descr === "Screenshot: " + fg.caption.replace(/^Figure \d+\.\s*/, "");
      const ok = fig && +capNo === figNo && steps.join(",") === badges.join(",") && altOk && fg.keep;
      console.log(`  ${ok ? "ok  " : "BAD "} Fig ${capNo} ${fig ? fig.out : "(no annotate.json match: rerun the annotator?)"} caption steps [${steps}] badges [${badges}]`
        + `${altOk ? "" : " ALT TEXT MISMATCH"}${fg.keep ? "" : " NOT KEPT WITH CAPTION"}`);
      if (!ok) fail(`figure ${figNo}: caption, badge, alt text, or keep-with-caption problem`);
    }
    // A manifest figure kept for the record but not in the guide: start its note with "UNUSED".
    const usedFigs = manifest.figures.filter((x) => !/^UNUSED|Not used in the guide/.test(x.note || ""));
    if (usedFigs.length && usedFigs.length !== figs.length) fail(`annotate.json has ${usedFigs.length} figures in use (${manifest.figures.length} total), document has ${figs.length}`);

    // Text checks.
    let em = 0, en = 0;
    for (const n of Object.keys(zip.files)) {
      if (!n.endsWith(".xml")) continue;
      const s = await zip.files[n].async("string");
      em += s.split(EM_DASH).length - 1; en += s.split(EN_DASH).length - 1;
    }
    console.log(`  em dashes: ${em}, en dashes: ${en}`);
    if (em || en) fail("dashes found");
    const raw = (await mammoth.extractRawText({ buffer: buf })).value;
    let styleText = raw;
    for (const re of STYLE_ALLOW) styleText = styleText.replace(re, "");
    const checks = [
      ["style words", STYLE_RE, styleText],
      ["names", NAMES_RE, raw],
      ["session or build words", SESSION_RE, raw],
      ["guide numbers", GUIDE_NUM_RE, raw],
      ["dates", /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, raw],
      ...ID_RES.map((re) => ["internal IDs", re, raw]),
      ...EXTRA.map(([label, re]) => [label, re, raw]),
    ];
    for (const [label, re, src] of checks) {
      if (!re) continue;
      const hits = src.match(re) || [];
      if (hits.length) fail(label + ": " + [...new Set(hits)].join(", "));
    }
    const outTxt = path.join(SET.workDir, "qa_text_" + nn + ".txt");
    fs.writeFileSync(outTxt, raw);
    console.log(`  text extract: ${outTxt} (${raw.length} chars)`);
  }
  console.log(bad ? `\nRESULT: ${bad} finding(s)` : "\nRESULT: clean");
  process.exit(bad ? 1 : 0);
})();
