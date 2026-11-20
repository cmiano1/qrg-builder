// gdocs_lint.js: Google-safety lint for generated DOCX files. Read-only; never changes a file.
// Each rule below comes from a real Google Docs result: a table-width fix, and a round-trip comparison of
// generated builds with the copies downloaded back from Drive after "Save as Google Docs".
//
// CLI (from the kit folder):
//   node tools/gdocs_lint.js [--page=letter|any] [--full-width] [--fonts=Calibri,Arial] <file.docx> [...]
//   Exit 1 if any FAIL. WARN lines are printed but do not fail the run.
// Module:
//   const { lintDocx } = require("./tools/gdocs_lint");
//   const findings = await lintDocx(buffer, { page: "letter", fullWidth: true });  // [{ level, rule, detail }]
//
// Rules (FAIL unless marked WARN):
//   page-size        pgSz is Standard US Letter (letter 12240x15840, 8.5 x 11 in), portrait. A4 is not supported.
//   table-width      every table: fixed layout; table, grid, and every cell width in DXA (no pct, no auto);
//                    grid sums to the table width; each cell matches its grid columns; with --full-width the
//                    table spans the content width (page width minus left and right margins).
//                    Why: a pct or auto width makes Google invent widths (the "one-letter strip" seen in Google Docs).
//   literal-tab      no tab character typed inside a text run (document, headers, footers). Use a real tab
//                    element. Why: Google deletes the typed tab ("Unit RolePage 1" in the footer).
//   line-spacing     no exact line spacing (WARN for "at least"). Why: Google only has multiples.
//   floating-image   every picture is inline (no anchored or wrapped pictures).
//   alt-text         every picture has alt text (accessibility; also checked after a Google round trip).
//   image-width      no picture wider than the content width.
//   image-format     pictures are PNG, JPEG, or GIF (no EMF, WMF, SVG, TIFF).
//   fonts            only the allowed fonts (default Calibri; bullet symbol fonts allowed in numbering).
//   hairline-border  no visible border thinner than 1/2 pt (sz 4). Why: Google thickens it to 1/2 pt.
//   object           no text boxes, shapes, VML, charts, SmartArt, embedded objects, or content controls.
//                    (The empty content control Google wraps around each comment anchor is ignored.)
//   heading-keep     every Heading paragraph sets keep-with-next on the paragraph itself. Why: Google drops
//                    keep-with-next from the style definition.
//   field (WARN)     fields other than PAGE and NUMPAGES.
//   tab-stop (WARN)  a tab stop past the right margin.
//   shading (WARN)   pattern shading (Google has solid fills only).
//   revisions (WARN) tracked changes or comments in a generated file.
//   sections (WARN)  more than one section.
//   list-override (WARN) lvlOverride/startOverride left in numbering.xml (Google drops them, so a list
//                    that should restart runs on instead).
//   upscaled (WARN)  a PNG shown wider than its own pixels at 96 dpi (looks soft on screen).
//   no-equivalent (WARN) formatting Google Docs has no setting for: small caps, double/dotted/wavy
//                    underline, character scaling, text effects (shadow, outline, emboss).
// Fonts, line spacing, and borders in styles.xml count only for styles the document uses (plus the
// defaults), so the unused default styles Google adds after a round trip do not raise false alarms.
const fs = require("fs");
const path = require("path");
let JSZip;
try { JSZip = require("jszip"); } catch (e) { JSZip = require(path.resolve(__dirname, "..", "node_modules", "jszip")); }

const PAGES = { letter: { w: 12240, h: 15840 } };
const TWIP_EMU = 635;
const BULLET_FONTS = ["Symbol", "Wingdings", "Courier New", "Noto Sans Symbols"];
const attr = (tag, a) => ((tag.match(new RegExp(`\\b${a}="([^"]*)"`)) || [])[1]);
const num = (v) => (v === undefined ? NaN : Math.round(parseFloat(v)));

async function lintDocx(buf, opts = {}) {
  const o = { page: "letter", fullWidth: false, fonts: ["Calibri"], altText: true, ...opts };
  if (o.page !== "any" && !PAGES[o.page]) {
    throw new Error(`Unsupported page size "${o.page}". QRGs must use Standard US Letter ("letter", 12240x15840 twips); A4 is not supported.`);
  }
  const out = [];
  const add = (level, rule, detail) => out.push({ level, rule, detail });
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const get = async (n) => (zip.file(n) ? zip.file(n).async("string") : "");
  const doc = await get("word/document.xml");
  const styles = await get("word/styles.xml");
  const numbering = await get("word/numbering.xml");
  const hf = [];
  for (const n of names.filter((x) => /^word\/(header|footer|footnotes|endnotes)\d*\.xml$/.test(x))) hf.push([n, await get(n)]);
  const textParts = [["word/document.xml", doc], ...hf];
  const usedStyles = stylesInUse(styles, textParts.map(([, x]) => x).join(""));

  // page-size and content width
  const sect = (doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || []);
  const last = sect[sect.length - 1] || "";
  const pgSz = (last.match(/<w:pgSz [^>]*>/) || [""])[0];
  const pgMar = (last.match(/<w:pgMar [^>]*>/) || [""])[0];
  const pw = num(attr(pgSz, "w:w")), ph = num(attr(pgSz, "w:h"));
  const contentW = pw - num(attr(pgMar, "w:left")) - num(attr(pgMar, "w:right"));
  if (o.page !== "any") {
    const want = PAGES[o.page];
    if (pw !== want.w || ph !== want.h) add("FAIL", "page-size", `page is ${pw}x${ph}, expected ${o.page} ${want.w}x${want.h}`);
  }
  if (attr(pgSz, "w:orient") === "landscape" || pw > ph) add("WARN", "page-size", "landscape page");
  if (sect.length > 1) add("WARN", "sections", `${sect.length} sections`);

  // table-width
  const tbls = doc.split("<w:tbl>").slice(1).map((t) => t.split("</w:tbl>")[0]);
  tbls.forEach((t0, i) => {
    const t = t0.replace(/<w:tblGridChange[\s\S]*?<\/w:tblGridChange>/g, "");
    const id = `table ${i + 1}`;
    const tblW = (t.match(/<w:tblW [^>]*>/) || [""])[0];
    const tw = num(attr(tblW, "w:w"));
    const problems = [];
    if (attr(tblW, "w:type") !== "dxa") problems.push(`table width type ${attr(tblW, "w:type") || "missing"}`);
    if (!/<w:tblLayout w:type="fixed"\/>/.test(t)) problems.push("layout not fixed");
    const grid = [...((t.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/) || [, ""])[1]).matchAll(/<w:gridCol w:w="([^"]+)"/g)].map((m) => num(m[1]));
    const gsum = grid.reduce((a, b) => a + b, 0);
    if (!grid.length) problems.push("no grid columns");
    else if (Math.abs(gsum - tw) > 2) problems.push(`grid sums to ${gsum}, table width ${tw}`);
    if (o.fullWidth && Math.abs(tw - contentW) > 2) problems.push(`table width ${tw}, content width ${contentW}`);
    if (tw > contentW + 2) problems.push(`table wider than the content width (${tw} > ${contentW})`);
    for (const row of t.split(/<w:tr[ >]/).slice(1)) {
      let col = 0;
      for (const tc of row.split("<w:tc>").slice(1)) {
        const tcW = (tc.match(/<w:tcW [^>]*>/) || [""])[0];
        const span = num((tc.match(/<w:gridSpan w:val="(\d+)"/) || [, "1"])[1]);
        const want = grid.slice(col, col + span).reduce((a, b) => a + b, 0);
        if (attr(tcW, "w:type") !== "dxa") problems.push(`cell width type ${attr(tcW, "w:type") || "missing"}`);
        else if (grid.length && Math.abs(num(attr(tcW, "w:w")) - want) > 2) problems.push(`cell ${num(attr(tcW, "w:w"))} vs grid ${want}`);
        col += span;
      }
    }
    if (problems.length) add("FAIL", "table-width", `${id}: ${[...new Set(problems)].join("; ")}`);
  });

  // literal-tab
  for (const [n, x] of textParts) {
    const hits = [...x.matchAll(/<w:t(?: [^>]*)?>([^<]*\t[^<]*)<\/w:t>/g)].map((m) => JSON.stringify(m[1]));
    if (hits.length) add("FAIL", "literal-tab", `${n}: ${hits.length} run(s) with a typed tab, e.g. ${hits.slice(0, 2).join(", ")}`);
  }

  // line-spacing
  for (const [n, x] of [...textParts, ["word/styles.xml (styles in use)", usedStyles], ["word/numbering.xml", numbering]]) {
    const ex = (x.match(/w:lineRule="exact"/g) || []).length;
    const al = (x.match(/w:lineRule="atLeast"/g) || []).length;
    if (ex) add("FAIL", "line-spacing", `${n}: ${ex} paragraph(s) with exact line spacing`);
    if (al) add("WARN", "line-spacing", `${n}: ${al} paragraph(s) with "at least" line spacing`);
  }

  // pictures
  const rels = await get("word/_rels/document.xml.rels");
  const relTarget = Object.fromEntries([...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  for (const [n, x] of textParts) {
    const drawings = [...x.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)].map((m) => m[1]);
    for (const [i, d] of drawings.entries()) {
      const label = `${n} picture ${i + 1}`;
      if (/<wp:anchor/.test(d)) add("FAIL", "floating-image", `${label} is anchored (floating), not inline`);
      const docPr = (d.match(/<wp:docPr [^>]*>/) || [""])[0];
      if (o.altText && !(attr(docPr, "descr") || "").trim()) add("FAIL", "alt-text", `${label} has no alt text`);
      const cx = num(attr((d.match(/<wp:extent [^>]*>/) || [""])[0], "cx"));
      if (cx > contentW * TWIP_EMU * 1.005) add("FAIL", "image-width", `${label} is ${(cx / 914400).toFixed(2)}" wide; content width ${(contentW / 1440).toFixed(2)}"`);
      // upscaled: compare the shown width (96 dpi pixels) with the PNG's own width (IHDR bytes 16-19).
      const target = n === "word/document.xml" && relTarget[attr(d.match(/<a:blip [^>]*>/)?.[0] || "", "r:embed")];
      const media = target && zip.file("word/" + target.replace(/^\/?word\//, ""));
      if (media) {
        const b = await media.async("nodebuffer");
        if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
          const shown = cx / 9525, own = b.readUInt32BE(16);
          if (shown > own * 1.02) add("WARN", "upscaled", `${label}: shown ${Math.round(shown)} px wide, image is ${own} px`);
        }
      }
    }
  }
  const badMedia = names.filter((n) => n.startsWith("word/media/") && !/\.(png|jpe?g|gif)$/i.test(n));
  if (badMedia.length) add("FAIL", "image-format", badMedia.join(", "));

  // fonts
  const fontsIn = (x) => [...x.matchAll(/<w:rFonts [^>]*>/g)].flatMap((m) => [attr(m[0], "w:ascii"), attr(m[0], "w:hAnsi")]).filter(Boolean);
  const themed = [...(doc + usedStyles).matchAll(/w:(ascii|hAnsi)Theme="([^"]+)"/g)].length;
  const bad = new Set();
  for (const [, x] of [...textParts, ["", usedStyles]]) fontsIn(x).forEach((f) => { if (!o.fonts.includes(f)) bad.add(f); });
  fontsIn(numbering).forEach((f) => { if (!o.fonts.includes(f) && !BULLET_FONTS.includes(f)) bad.add(f); });
  if (bad.size) add("FAIL", "fonts", `fonts outside ${o.fonts.join("/")}: ${[...bad].join(", ")}`);
  if (themed) add("WARN", "fonts", `${themed} theme font reference(s); Google may substitute`);

  // hairline-border
  const thin = [];
  for (const [n, x] of [...textParts, ["word/styles.xml", usedStyles]]) {
    for (const box of x.matchAll(/<w:(tblBorders|tcBorders|pBdr)>([\s\S]*?)<\/w:\1>/g)) {
      for (const b of box[2].matchAll(/<w:(top|left|bottom|right|start|end|insideH|insideV|between|bar) [^>]*>/g)) {
        const val = attr(b[0], "w:val");
        const sz = num(attr(b[0], "w:sz"));
        if (val && !/^(nil|none)$/.test(val) && sz < 4) thin.push(`${n.replace("word/", "")} ${box[1]} ${b[1]} sz ${sz}`);
      }
    }
  }
  if (thin.length) add("FAIL", "hairline-border", `${thin.length} border(s) under 1/2 pt, e.g. ${[...new Set(thin)].slice(0, 3).join("; ")}`);

  // object
  const objects = { "text box": /<w:txbxContent/, shape: /<wps:wsp/, VML: /<v:(shape|rect|textbox|group)\b/, chart: /<c:chart/, SmartArt: /<dgm:/, "alternate content": /<mc:AlternateContent/, "embedded object": /<w:object/, "content control": /<w:sdt>/ };
  // Google wraps each comment anchor in an empty content control (tag goog_rdk_N, holding only a
  // commentRangeStart); those are not content and are removed before the check.
  const noAnchors = (x) => x.replace(/<w:sdt><w:sdtPr>(?:(?!<\/w:sdtPr>)[\s\S])*?<w:tag w:val="goog_rdk_\d+"\/>(?:(?!<\/w:sdtPr>)[\s\S])*?<\/w:sdtPr><w:sdtContent>(?:<w:(?:commentRange(?:Start|End)|bookmark(?:Start|End)) [^>]*\/>)*<\/w:sdtContent><\/w:sdt>/g, "");
  for (const [n, x] of textParts) for (const [k, re] of Object.entries(objects)) if (re.test(noAnchors(x))) add("FAIL", "object", `${n}: ${k}`);

  // heading-keep
  const paras = doc.split(/(?=<w:p>|<w:p )/);
  const loose = paras.filter((p) => /<w:pStyle w:val="Heading\d"\/>/.test(p) && !/<w:keepNext(?: w:val="(?:1|true|on)")?\/>/.test(p)).length;
  if (loose) add("FAIL", "heading-keep", `${loose} heading paragraph(s) without keep-with-next on the paragraph`);

  // WARN rules
  for (const [n, x] of textParts) {
    const f = [...x.matchAll(/<w:instrText[^>]*>([^<]*)</g), ...x.matchAll(/<w:fldSimple w:instr="([^"]*)"/g)].map((m) => m[1].trim().split(/\s+/)[0]).filter((w) => w && !/^(PAGE|NUMPAGES)$/.test(w));
    if (f.length) add("WARN", "field", `${n}: ${[...new Set(f)].join(", ")}`);
    const tabs = [...x.matchAll(/<w:tab w:val="(?!clear)[^"]+"[^>]*w:pos="([^"]+)"/g)].map((m) => num(m[1])).filter((p) => p > contentW + 2);
    if (tabs.length) add("WARN", "tab-stop", `${n}: tab stop at ${tabs.join(", ")} past the content width ${contentW}`);
    const pat = [...x.matchAll(/<w:shd [^>]*w:val="([^"]+)"/g)].map((m) => m[1]).filter((v) => !/^(clear|nil|solid)$/.test(v));
    if (pat.length) add("WARN", "shading", `${n}: pattern shading ${[...new Set(pat)].join(", ")}`);
    if (/<w:(ins|del) /.test(x)) add("WARN", "revisions", `${n}: tracked changes`);
    const noEq = { "small caps": /<w:smallCaps(?: w:val="(?:1|true|on)")?\/>/, "special underline": /<w:u w:val="(?!single|none|words)[^"]+"/, "character scaling": /<w:w w:val="(?!100")/, "text effects": /<w:(shadow|outline|emboss|imprint)(?: w:val="(?:1|true|on)")?\/>|<w14:(glow|shadow|reflection|textOutline)/ };
    const found = Object.entries(noEq).filter(([, re]) => re.test(x)).map(([k]) => k);
    if (found.length) add("WARN", "no-equivalent", `${n}: ${found.join(", ")}`);
  }
  const comments = (await get("word/comments.xml")).match(/<w:comment /g) || [];
  if (comments.length) add("WARN", "revisions", `${comments.length} comment(s)`);
  if (/<w:(lvl|start)Override/.test(numbering)) add("WARN", "list-override", "lvlOverride/startOverride in numbering.xml");
  return out;
}

// The XML of docDefaults, the default styles, and every style the parts use (with its basedOn chain).
function stylesInUse(styles, partsXml) {
  const defs = {};
  for (const m of styles.matchAll(/<w:style [^>]*>[\s\S]*?<\/w:style>/g)) defs[attr(m[0], "w:styleId")] = m[0];
  const want = new Set([...partsXml.matchAll(/<w:(?:p|r|tbl)Style w:val="([^"]+)"/g)].map((m) => m[1]));
  for (const [id, x] of Object.entries(defs)) if (/^<w:style [^>]*w:default="(?:1|true)"/.test(x)) want.add(id);
  const seen = new Set();
  const visit = (id) => {
    if (!id || seen.has(id) || !defs[id]) return;
    seen.add(id);
    visit((defs[id].match(/<w:basedOn w:val="([^"]+)"/) || [])[1]);
    visit((defs[id].match(/<w:link w:val="([^"]+)"/) || [])[1]);
  };
  want.forEach(visit);
  return ((styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/) || [""])[0]) + [...seen].map((id) => defs[id]).join("");
}

module.exports = { lintDocx, PAGES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};
  const files = [];
  for (const a of args) {
    if (a.startsWith("--page=")) opts.page = a.slice(7);
    else if (a === "--full-width") opts.fullWidth = true;
    else if (a.startsWith("--fonts=")) opts.fonts = a.slice(8).split(",");
    else if (a === "--no-alt-text") opts.altText = false;
    else files.push(a);
  }
  if (!files.length) { console.log("usage: node tools/gdocs_lint.js [--page=letter|any] [--full-width] [--fonts=Calibri] <file.docx> [...]"); process.exit(2); }
  (async () => {
    let fails = 0;
    for (const f of files) {
      const res = await lintDocx(fs.readFileSync(f), opts);
      const nf = res.filter((r) => r.level === "FAIL").length;
      fails += nf;
      console.log(`\n${nf ? "FAIL" : "ok  "} ${path.basename(f)}${res.length ? "" : " (clean)"}`);
      for (const r of res) console.log(`  ${r.level.padEnd(4)} ${r.rule.padEnd(15)} ${r.detail}`);
    }
    console.log(fails ? `\nRESULT: ${fails} FAIL finding(s)` : "\nRESULT: no FAIL findings");
    process.exit(fails ? 1 : 0);
  })().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(2); });
}
