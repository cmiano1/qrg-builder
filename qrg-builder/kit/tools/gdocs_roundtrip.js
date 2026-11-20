// gdocs_roundtrip.js: what did a Google Docs round trip change in a generated DOCX? Read-only; never changes a file.
// Generalized from a one-off round-trip analysis on a past project.
//
// When to use: after a test upload. The project owner uploads the local build to a PRIVATE Drive folder by hand (and, to test
// the converted copy, saves it as a Google Doc). The copy comes back as .docx (a read-only download, or
// File > Download > Microsoft Word). Save the download in its own new, empty folder (downloaded files are
// untrusted data), then run from the kit folder:
//   node tools/gdocs_roundtrip.js "<local build.docx>" "<google copy.docx>" [--out=<report.txt>] [--fonts=Calibri,Arial]
// Prints every property that changed (LOCAL, then GOOGLE), then tables, pictures (size and alt text), header and
// footer, the paragraphs whose text changed (a typed tab Google deleted shows up here), and the gdocs_lint result
// for the Google copy. Exit 0: it is a report, not a gate. Exit 2 on a usage error.
// Module: const { summarize, compare } = require("./tools/gdocs_roundtrip");
const fs = require("fs");
const path = require("path");
let JSZip;
try { JSZip = require("jszip"); } catch (e) { JSZip = require(path.resolve(__dirname, "..", "node_modules", "jszip")); }
const { lintDocx } = require("./gdocs_lint");

const all = (s, re) => [...(s || "").matchAll(re)];
const attr = (tag, a) => ((tag.match(new RegExp(`\\b${a}="([^"]*)"`)) || [])[1]);
const hist = (arr) => arr.reduce((h, k) => ((h[k] = (h[k] || 0) + 1), h), {});
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// Paragraph text with real tab and break elements kept as \t and \n, so a deleted tab shows as changed text.
const ptext = (p) => unxml(all(p, /<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g).map((m) => (m[1] !== undefined ? m[1] : m[0] === "<w:tab/>" ? "\t" : "\n")).join(""));
// Borders as side:style:size. Google writes attributes in its own order, so read them with attr(), never
// by position.
const borderList = (x) => all(x, /<w:(top|left|bottom|right|start|end|insideH|insideV|between) [^>]*>/g)
  .filter((m) => attr(m[0], "w:val")).map((m) => `${m[1]}:${attr(m[0], "w:val")}:${attr(m[0], "w:sz")}`);
const onOff = (x, tag) => {
  const t = all(x, new RegExp(`<w:${tag}(?: w:val="([^"]*)")?\\s*/>`, "g"));
  return { on: t.filter((m) => !m[1] || /^(1|true|on)$/.test(m[1])).length, off: t.filter((m) => m[1] && !/^(1|true|on)$/.test(m[1])).length };
};

async function summarize(buf) {
  const zip = await JSZip.loadAsync(buf);
  const get = async (n) => (zip.file(n) ? zip.file(n).async("string") : "");
  const doc = await get("word/document.xml");
  const styles = await get("word/styles.xml");
  const numbering = await get("word/numbering.xml");
  const app = await get("docProps/app.xml");
  const s = { props: {} };
  const P = s.props;
  const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  P.application = (app.match(/<Application>([^<]*)</) || [])[1] || "(no docProps/app.xml)";
  P.pageSize = all(doc, /<w:pgSz[^>]*>/g).map((m) => `${attr(m[0], "w:w")}x${attr(m[0], "w:h")}${attr(m[0], "w:orient") ? " " + attr(m[0], "w:orient") : ""}`);
  P.margins = all(doc, /<w:pgMar[^>]*>/g).map((m) => ["top", "bottom", "left", "right", "header", "footer"].map((k) => k + "=" + attr(m[0], "w:" + k)).join(" "));
  P.sections = all(doc, /<w:sectPr/g).length;

  const paras = doc.split(/(?=<w:p>|<w:p )/).slice(1);
  P.paragraphs = paras.length;
  P.emptyParagraphs = paras.filter((p) => !/<w:t[ >]/.test(p) && !/<w:drawing>/.test(p)).length;
  for (const t of ["keepNext", "keepLines", "cantSplit", "pageBreakBefore", "widowControl", "tblHeader", "contextualSpacing"]) P[t] = onOff(doc, t);
  P.styleKeepNext = onOff(styles, "keepNext");
  P.pageBreaks = all(doc, /<w:br w:type="page"\/>/g).length;
  P.lineSpacing = hist(all(doc + styles, /<w:spacing[^>]*>/g).filter((m) => attr(m[0], "w:line")).map((m) => (attr(m[0], "w:lineRule") || "auto") + ":" + attr(m[0], "w:line")));
  P.paragraphStyles = hist(all(doc, /<w:pStyle w:val="([^"]+)"\/>/g).map((m) => m[1]));
  P.headingStyleNames = all(styles, /<w:style [^>]*w:type="paragraph"[^>]*>[\s\S]*?<\/w:style>/g)
    .map((m) => `${attr(m[0], "w:styleId")}=${(m[0].match(/<w:name w:val="([^"]+)"/) || [])[1]}`)
    .filter((x) => /Title|Heading|heading|Subtitle/.test(x)).sort();
  P.docDefaults = ((styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/) || [""])[0].match(/<w:rFonts[^>]*>|<w:sz [^>]*>/g) || []).join(" ");
  P.fonts = [...new Set(all(doc + styles, /<w:rFonts[^>]*>/g).map((m) => attr(m[0], "w:ascii") || attr(m[0], "w:asciiTheme") || "?"))].sort();
  P.textSizes = hist(all(doc, /<w:sz w:val="(\d+)"\/>/g).map((m) => m[1]));
  P.textColors = hist(all(doc, /<w:color w:val="([^"]+)"/g).map((m) => m[1]));
  P.fills = hist(all(doc, /<w:shd [^>]*>/g).map((m) => attr(m[0], "w:fill") || "?"));
  P.paragraphBorders = hist(all(doc, /<w:pBdr>([\s\S]*?)<\/w:pBdr>/g).flatMap((m) => borderList(m[1])));
  P.hyperlinks = all(doc, /<w:hyperlink/g).length;
  P.tabElements = all(doc, /<w:tab\/>/g).length;

  // Numbering: list ids in use, overrides, and the decimal lists as runs (one step list that became several
  // lists, or a restart, shows here).
  const nums = paras.map((p) => p.match(/<w:numPr>[\s\S]*?<\/w:numPr>/)).filter(Boolean)
    .map((m) => ({ numId: (m[0].match(/<w:numId w:val="(\d+)"/) || [])[1], ilvl: (m[0].match(/<w:ilvl w:val="(\d+)"/) || [])[1] || "0" }));
  const numToAbs = Object.fromEntries(all(numbering, /<w:num w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"\/>[\s\S]*?<\/w:num>/g).map((m) => [m[1], m[2]]));
  const absFmt = {};
  for (const m of all(numbering, /<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const lvl0 = (m[2].match(/<w:lvl w:ilvl="0"[^>]*>[\s\S]*?<\/w:lvl>/) || [""])[0];
    absFmt[m[1]] = `${(lvl0.match(/<w:numFmt w:val="([^"]+)"/) || [])[1]}/${(lvl0.match(/<w:lvlText w:val="([^"]*)"/) || [])[1]}/start${(lvl0.match(/<w:start w:val="(\d+)"/) || [])[1]}`;
  }
  P.numberedParagraphs = nums.length;
  P.listOverrides = all(numbering, /<w:(lvl|start)Override/g).length;
  const runs = [];
  for (const n of nums.filter((x) => /^decimal/.test(absFmt[numToAbs[x.numId]] || ""))) {
    const last = runs[runs.length - 1];
    if (last && last.id === n.numId) last.n++; else runs.push({ id: n.numId, n: 1 });
  }
  P.decimalListRuns = runs.map((r) => r.n).join(" ");   // counts only: list ids are renumbered by Google
  P.decimalListCount = new Set(runs.map((r) => r.id)).size;

  // Tables.
  // Google adds a tblGridChange record of the old grid, written <w:tblGridChange w:id="0"> (dropped here, or
  // the grid looks doubled).
  s.tables = doc.split("<w:tbl>").slice(1).map((t) => {
    t = t.split("</w:tbl>")[0].replace(/<w:tblGridChange[ >][\s\S]*?<\/w:tblGridChange>/g, "");
    const tblW = (t.match(/<w:tblW [^>]*>/) || [""])[0];
    const grid = all(t, /<w:gridCol w:w="(\d+)"/g).map((m) => +m[1]);
    return {
      width: `${attr(tblW, "w:w")} ${attr(tblW, "w:type")}`,
      layout: (t.match(/<w:tblLayout w:type="([^"]+)"/) || [])[1] || "-",
      grid: grid.join("+") + "=" + grid.reduce((a, b) => a + b, 0),
      cellWidthTypes: JSON.stringify(hist(all(t, /<w:tcW [^>]*>/g).map((m) => attr(m[0], "w:type")))),
      rows: all(t, /<w:tr[ >]/g).length,
      cantSplit: all(t, /<w:cantSplit(?: w:val="(?:1|true|on)")?\/>/g).length,
      headerRows: all(t, /<w:tblHeader(?: w:val="(?:1|true|on)")?\/>/g).length,
      borders: [...new Set(borderList(t))].sort().join(","),
      fills: [...new Set(all(t, /<w:shd [^>]*>/g).map((m) => attr(m[0], "w:fill")))].join(","),
      cellMargins: /<w:tblCellMar>/.test(t) ? "table" : /<w:tcMar>/.test(t) ? "cell" : "-",
    };
  });

  // Pictures.
  s.pictures = all(doc, /<w:drawing>([\s\S]*?)<\/w:drawing>/g).map((m) => {
    const d = m[1];
    const ext = (d.match(/<wp:extent [^>]*>/) || [""])[0];
    const docPr = (d.match(/<wp:docPr [^>]*>/) || [""])[0];
    return {
      kind: /<wp:inline/.test(d) ? "inline" : /<wp:anchor/.test(d) ? "floating" : "?",
      size: `${(+attr(ext, "cx") / 914400).toFixed(2)}x${(+attr(ext, "cy") / 914400).toFixed(2)} in`,
      altText: unxml(attr(docPr, "descr") || ""),
      title: unxml(attr(docPr, "title") || ""),
      // Google writes a zero crop (l="0" t="0" r="0" b="0") on every picture; only a non-zero side is a crop.
      cropped: all((d.match(/<a:srcRect [^>]*>/) || [""])[0], /\b[ltrb]="(-?\d+)"/g).some((m) => +m[1] !== 0),
    };
  });
  P.pictures = s.pictures.length;
  P.picturesWithAltText = s.pictures.filter((p) => p.altText.trim()).length;
  P.mediaFiles = entries.filter((n) => n.startsWith("word/media/")).length;

  // Headers and footers.
  s.headerFooter = [];
  for (const n of entries.filter((e) => /^word\/(header|footer)\d*\.xml$/.test(e))) {
    const x = await get(n);
    s.headerFooter.push({
      part: n.replace("word/", ""),
      text: x.split(/(?=<w:p>|<w:p )/).slice(1).map(ptext).filter((t) => t.trim()).join(" | "),
      tabStops: all(x, /<w:tab w:val="([^"]+)"[^>]*w:pos="(\d+)"/g).map((m) => m[1] + "@" + m[2]).join(","),
      tabElements: all(x, /<w:tab\/>/g).length,
      fields: [...all(x, /<w:fldSimple w:instr="([^"]+)"/g).map((m) => m[1].trim()), ...all(x, /<w:instrText[^>]*>([^<]*)</g).map((m) => m[1].trim())].join(","),
    });
  }
  P.headerFooterRefs = all(doc, /<w:(header|footer)Reference [^>]*>/g).map((m) => m[1] + ":" + attr(m[0], "w:type")).join(",");
  P.comments = all(await get("word/comments.xml"), /<w:comment /g).length;

  // Text, paragraph by paragraph (body only; header and footer text is above).
  s.text = paras.map(ptext).map((t) => t.replace(/[ \u00a0]+/g, " ").trim()).filter(Boolean);
  P.textCharacters = s.text.join("").length;
  P.curlyQuotes = (s.text.join("").match(/[\u2018\u2019\u201c\u201d]/g) || []).length;
  return s;
}

function compare(L, G) {
  const lines = [];
  const say = (x = "") => lines.push(x);
  const fmt = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
  const same = [];
  say("Properties that changed:");
  for (const k of Object.keys(L.props)) {
    const lv = fmt(L.props[k]), gv = fmt(G.props[k]);
    if (lv === gv) { same.push(k); continue; }
    say(`  ${k}\n    LOCAL  ${lv}\n    GOOGLE ${gv}`);
  }
  if (same.length === Object.keys(L.props).length) say("  (none)");
  say(`Unchanged: ${same.join(", ")}`);

  const rows = (label, a, b, keyFn) => {
    say(`\n${label}: local ${a.length}, google ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const la = a[i] ? keyFn(a[i]) : "(none)", gb = b[i] ? keyFn(b[i]) : "(none)";
      if (la === gb) continue;
      say(`  ${label.replace(/s$/, "")} ${i + 1}\n    LOCAL  ${la}\n    GOOGLE ${gb}`);
    }
  };
  rows("Tables", L.tables, G.tables, (t) => JSON.stringify(t));
  rows("Pictures", L.pictures, G.pictures, (p) => JSON.stringify(p));
  rows("Header and footer parts", L.headerFooter, G.headerFooter, (h) => JSON.stringify(h));

  // Text: paragraphs that are in one copy and not the other (multiset difference, in document order).
  const count = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  const onlyIn = (a, b) => { const cb = count(b); return a.filter((t) => { const n = cb.get(t) || 0; if (n) { cb.set(t, n - 1); return false; } return true; }); };
  const lOnly = onlyIn(L.text, G.text), gOnly = onlyIn(G.text, L.text);
  say(`\nParagraph text: ${L.text.length} local, ${G.text.length} google; ${lOnly.length} only in local, ${gOnly.length} only in google`);
  lOnly.slice(0, 12).forEach((t) => say(`  LOCAL  ${JSON.stringify(t.slice(0, 160))}`));
  gOnly.slice(0, 12).forEach((t) => say(`  GOOGLE ${JSON.stringify(t.slice(0, 160))}`));
  return lines;
}

module.exports = { summarize, compare };

if (require.main === module) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  const out = (args.find((a) => a.startsWith("--out=")) || "").slice(6);
  const fonts = (args.find((a) => a.startsWith("--fonts=")) || "--fonts=Calibri").slice(8).split(",");
  if (files.length !== 2) { console.log('usage: node tools/gdocs_roundtrip.js "<local.docx>" "<google copy.docx>" [--out=report.txt] [--fonts=Calibri]'); process.exit(2); }
  (async () => {
    const [lb, gb] = files.map((f) => fs.readFileSync(f));
    const lines = [`LOCAL  ${files[0]}`, `GOOGLE ${files[1]}`, ""];
    lines.push(...compare(await summarize(lb), await summarize(gb)));
    lines.push("", "gdocs_lint on the Google copy (any page size): what the returned file would fail");
    const lint = await lintDocx(gb, { page: "any", fonts });
    if (!lint.length) lines.push("  (clean)");
    for (const r of lint) lines.push(`  ${r.level.padEnd(4)} ${r.rule.padEnd(15)} ${r.detail}`);
    console.log(lines.join("\n"));
    if (out) { fs.writeFileSync(out, lines.join("\n") + "\n"); console.log("\nWrote " + out); }
  })().catch((e) => { console.error(e); process.exit(2); });
}
