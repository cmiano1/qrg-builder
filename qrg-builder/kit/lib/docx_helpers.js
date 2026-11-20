// lib/docx_helpers.js: the QRG house style as reusable Word building blocks (Node "docx" library, exact pin 8.5.0).
// Used by build_qrgs.js (the guides) and playbook/build_playbook.js (the team playbook), so both read the same.
//
// Why package.json exact-pins "docx": "8.5.0":
//   - The helpers rely on docx v8 constructor shapes (such as ImageRun without mandatory type, numbering.config,
//     Footer/Tab, TableLayoutType.FIXED, and lastModifiedBy) that broke in docx 9.x.
//   - pack() post-processes the generated OOXML zip (word/numbering.xml and word/document.xml), and
//     tools/gdocs_lint_selftest.js mutates specific generated XML patterns. Keeping docx pinned to 8.5.0 (and copying
//     package-lock.json in init_project.js) guarantees byte-consistent, Google-Docs-safe XML across every machine.
//   - Before changing the docx version, run npm test (including gdocs_lint_selftest.js) and visually compare renders.
//
// What the helpers guarantee (each rule came from a real Word or Google Docs failure):
//   - Standard US Letter (8.5 x 11 in, 1 in margins, 6.5 in content width) only; A4 is rejected.
//   - Real Title, Heading 1, and Heading 2 styles, so Word and Google show real headings and an outline.
//   - One font (config "font", Calibri by default) for every run, so Google needs no substitution.
//   - Tables: fixed layout with DXA widths on the table, the grid, and every cell, summing to the content width.
//     A percent-only width makes Google draw a one-letter-wide column.
//   - Borders 1/2 pt (size 4) or more. Google redraws thinner borders.
//   - Footer tab is a real tab element (new Tab()). A typed tab character is deleted by Google.
//   - No exact line spacing (Google has only multiples). Gap paragraphs get their height from a small font size.
//   - Every picture is inline with alt text taken from its caption.
//   - Page breaks: a step never splits (keepLines); the unbroken run of steps just before a figure keeps with it
//     (pack() inspects word/numbering.xml decimal numIds); a callout row never splits (cantSplit); a callout right
//     under a heading keeps with what follows (keepLeadCallouts); a thin gap paragraph follows every table
//     (separateTables), so two tables never touch (Word draws touching tables as one box) and text never sits on a
//     table's bottom border.
//   - pack() also strips lvlOverride/startOverride: Word's print layout restarted the step list after an inline
//     figure, which broke the match between badge numbers and step numbers.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, HeadingLevel,
  WidthType, BorderStyle, AlignmentType, ShadingType, Footer, PageNumber, TabStopType, TableLayoutType, Tab,
} = require("docx");

const PAGES = { letter: { width: 12240, height: 15840 } };
const MARGIN = 1440; // 1 inch, the Google Docs default, so a Google copy shows the same page

// Parse word/numbering.xml to map each numId to the set of ilvl values formatted as "decimal".
// This distinguishes numbered steps from bullet lists without relying on library-specific keepNext serialization.
function decimalNumberingLevels(numberingXml) {
  const abstractDecimal = new Map();
  for (const m of String(numberingXml || "").matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="([^"]+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const absId = m[1];
    const body = m[2];
    const lvls = new Set();
    for (const lm of body.matchAll(/<w:lvl\b[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
      const openTag = lm[0].slice(0, lm[0].indexOf(">") + 1);
      const ilvl = ((openTag.match(/\bw:ilvl="([^"]+)"/) || [])[1]) || "0";
      if (/<w:numFmt\b[^>]*w:val="decimal"[^>]*\/>/.test(lm[1])) lvls.add(ilvl);
    }
    if (lvls.size) abstractDecimal.set(absId, lvls);
  }
  const numMap = new Map();
  for (const m of String(numberingXml || "").matchAll(/<w:num\b[^>]*w:numId="([^"]+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const numId = m[1];
    const absId = (m[2].match(/<w:abstractNumId\b[^>]*w:val="([^"]+)"[^>]*\/>/) || [])[1];
    if (absId && abstractDecimal.has(absId)) numMap.set(numId, abstractDecimal.get(absId));
  }
  return numMap;
}

function paraBody(p) {
  const end = p.indexOf("</w:p>");
  return end === -1 ? p : p.slice(0, end + 6);
}

function paraProps(p) {
  const m = paraBody(p).match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
  return m ? m[1] : "";
}

function isNumberedStep(p, decimalMap) {
  const body = paraBody(p);
  if (/<w:drawing\b/.test(body)) return false;
  const pPr = paraProps(body);
  const numPr = (pPr.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/) || [])[1];
  if (!numPr) return false;
  const numId = (numPr.match(/<w:numId\b[^>]*w:val="([^"]+)"[^>]*\/>/) || [])[1];
  const ilvl = (numPr.match(/<w:ilvl\b[^>]*w:val="([^"]+)"[^>]*\/>/) || [])[1] || "0";
  return Boolean(numId && decimalMap && decimalMap.has(numId) && decimalMap.get(numId).has(ilvl));
}

function hasKeepNext(p) {
  return /<w:keepNext(?: w:val="(?:1|true|on)")?\/>/.test(paraProps(p));
}

function hasKeepLines(p) {
  return /<w:keepLines(?: w:val="(?:1|true|on)")?\/>/.test(paraProps(p));
}

function ensureKeepNext(p) {
  if (hasKeepNext(p)) return p;
  const end = p.indexOf("</w:p>");
  const head = end === -1 ? p : p.slice(0, end + 6);
  const tail = end === -1 ? "" : p.slice(end + 6);
  if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(head)) {
    const updated = head.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (full, inner) => {
      if (/<w:keepNext\b[^>]*\/>/.test(inner)) {
        return "<w:pPr>" + inner.replace(/<w:keepNext\b[^>]*\/>/, "<w:keepNext/>") + "</w:pPr>";
      }
      if (/<w:pStyle\b[^>]*\/>/.test(inner)) {
        return "<w:pPr>" + inner.replace(/(<w:pStyle\b[^>]*\/>)/, "$1<w:keepNext/>") + "</w:pPr>";
      }
      return "<w:pPr><w:keepNext/>" + inner + "</w:pPr>";
    });
    return updated + tail;
  }
  return head.replace(/^(<w:p(?:\s[^>]*)?>)/, "$1<w:pPr><w:keepNext/></w:pPr>") + tail;
}

function makeHelpers(cfg, opts = {}) {
  const PAL = cfg.palette;
  const RED = PAL.accent, DARKRED = PAL.heading, GREY = PAL.grey, LIGHTGREY = PAL.light, NOTEBLUE = PAL.tip, WARNAMBER = PAL.warn;
  const FONT = cfg.font || "Calibri";
  const pageName = cfg.page == null ? "letter" : cfg.page;
  if (pageName !== "letter") {
    throw new Error('page "' + pageName + '" is not supported; QRGs must use Standard US Letter ("letter", 8.5 x 11 in)');
  }
  const PAGE = PAGES.letter;
  const CONTENT_W = PAGE.width - 2 * MARGIN;   // 9360 twips (6.5 in) on US Letter
  const CONTENT_EMU = CONTENT_W * 635;          // 635 EMU per twip
  const ASSETS = opts.assetsDir || null;
  const DEFAULT_FIG_MAX_H = Math.round((cfg.figureMaxHeightIn || 5.25) * 914400);
  let FIG_MAX_H = DEFAULT_FIG_MAX_H;

  // h2 = section heading (Word Heading 1); h3 = sub-step heading (Word Heading 2). _heading is not written to
  // the file; keepLeadCallouts() and separateTables() read it.
  function h2(text, o = {}) {
    const p = new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: o.pageBreak || false,
      keepNext: true,
      spacing: { before: o.pageBreak ? 0 : 300, after: 120 },
      border: { bottom: { color: RED, space: 3, style: BorderStyle.SINGLE, size: 12 } },
      children: [new TextRun({ text, bold: true, size: 26, color: DARKRED })],
    });
    p._heading = true;
    return p;
  }
  function h3(text) {
    const p = new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 180, after: 60 },
      children: [new TextRun({ text, bold: true, size: 23, color: "000000" })],
    });
    p._heading = true;
    return p;
  }
  // **bold** inside text becomes a bold run (use it for on-screen labels, exactly as the screen shows them).
  function runs(text) {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length);
    return parts.map((p) => (p.startsWith("**") && p.endsWith("**")
      ? new TextRun({ text: p.slice(2, -2), bold: true, size: 21 })
      : new TextRun({ text: p, size: 21 })));
  }
  function para(text, o = {}) {
    return new Paragraph({ spacing: { after: o.after ?? 80 }, ...(o.keepNext ? { keepNext: true } : {}), children: runs(text) });
  }
  // One "steps" list per guide keeps numbering continuous across figures, callouts, and sub-headings, so badge
  // numbers can match step numbers. steps2..steps6 restart at 1 if a document ever needs that.
  function num(text, ref = "steps", keepNext = false) {
    return new Paragraph({
      numbering: { reference: ref, level: 0 },
      ...(keepNext ? { keepNext: true } : {}),
      keepLines: true,
      spacing: { after: 60 },
      children: runs(text),
    });
  }
  // bullet(text, level, { keepNext }): keepNext (opt-in) keeps a short list with what follows; it also sets keepLines.
  function bullet(text, level = 0, o = {}) {
    const keep = o.keepNext ? { keepNext: true, keepLines: true } : {};
    return new Paragraph({ bullet: { level }, spacing: { after: 40 }, ...keep, children: runs(text) });
  }
  function fitWidths(widths) {
    const sum = widths.reduce((a, b) => a + b, 0);
    const out = widths.map((w) => Math.round(w * CONTENT_W / sum));
    out[out.length - 1] += CONTENT_W - out.reduce((a, b) => a + b, 0);
    return out;
  }
  // callout(text, "tip" | "note" | "warn"): a one-cell box. keepNext is set by keepLeadCallouts(), not by guide code.
  function callout(text, kind, o = {}) {
    const c = {
      tip: { label: "TIP", color: NOTEBLUE, fill: "EAF1FB" },
      note: { label: "NOTE", color: GREY, fill: LIGHTGREY },
      warn: { label: "IMPORTANT", color: WARNAMBER, fill: "FFF4CE" },
    }[kind];
    if (!c) throw new Error('callout kind must be "tip", "note", or "warn"; got ' + JSON.stringify(kind));
    const t = new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: c.color },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: c.color },
        left: { style: BorderStyle.SINGLE, size: 18, color: c.color },
        right: { style: BorderStyle.SINGLE, size: 4, color: c.color },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({
        cantSplit: true,
        children: [new TableCell({
          width: { size: CONTENT_W, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: c.fill },
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [new Paragraph({
            spacing: { after: 0 },
            ...(o.keepNext ? { keepNext: true } : {}),
            children: [new TextRun({ text: c.label + "  ", bold: true, color: c.color, size: 19 }), ...runs(text)],
          })],
        })],
      })],
    });
    t._callout = { text, kind };
    t._keepNext = !!o.keepNext;
    return t;
  }
  // refTable(headers, rows, relativeWidths): a real table with a repeating header row; widths are scaled to the page.
  function refTable(headers, rows, widthsIn) {
    const widths = fitWidths(widthsIn);
    const headerRow = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: headers.map((htext, c) => new TableCell({
        width: { size: widths[c], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: RED },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: htext, bold: true, color: "FFFFFF", size: 20 })] })],
      })),
    });
    const bodyRows = rows.map((r, i) => new TableRow({
      cantSplit: true,
      children: r.map((cell, c) => new TableCell({
        width: { size: widths[c], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: i % 2 ? "FFFFFF" : LIGHTGREY },
        margins: { top: 50, bottom: 50, left: 120, right: 120 },
        children: [new Paragraph({ spacing: { after: 0 }, children: runs(cell) })],
      })),
    }));
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
      },
      rows: [headerRow, ...bodyRows],
    });
  }
  function spacer(after = 120) { return new Paragraph({ spacing: { after }, children: [] }); }
  // A thin empty paragraph (5-point mark, no exact spacing). After a callout that keeps with what follows, the gap
  // keeps with next too, so the keep chain does not break at the gap.
  function gap(keepNext) {
    return new Paragraph({ spacing: { before: 0, after: 0 }, ...(keepNext ? { keepNext: true } : {}), run: { size: 10 }, children: [] });
  }
  function separateTables(children) {
    const out = [];
    for (const c of children) {
      const prev = out[out.length - 1];
      if (prev instanceof Table && !c._heading && !c._figure) out.push(gap(prev._keepNext));
      out.push(c);
    }
    return out;
  }
  // Word reads keep-with-next on the paragraph in a table's last row as "keep this table with the next paragraph".
  // Google Docs ignores it (no harm done there).
  function keepLeadCallouts(children) {
    return children.map((c, i) => ((c._callout && i > 0 && children[i - 1]._heading)
      ? callout(c._callout.text, c._callout.kind, { keepNext: true }) : c));
  }
  // Title block: no status word on the page (the file name carries the status).
  function titleBlock(title, subtitle, unitLine) {
    const out = [new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 30 },
      children: [new TextRun({ text: title, bold: true, size: 32, color: "000000" })],
    })];
    if (subtitle) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
      children: [new TextRun({ text: subtitle, italics: true, size: 23, color: RED })] }));
    const ul = unitLine == null ? opts.unitLine : unitLine;
    if (ul) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new TextRun({ text: ul, bold: true, size: 17, color: GREY })] }));
    return out;
  }
  // afig(key, file, caption, widthIn): an annotated screenshot from <assets>/<key>/out/<file>, with an italic
  // caption. widthIn keeps small crops small (no upscaling); omitted = the full content width. Height is capped
  // (figureMaxHeightIn, or the guide's figMaxH) so a figure and its caption fit on one page. Alt text is
  // "Screenshot: " + the caption without its "Figure N." label (qa_qrgs.js checks this).
  function afig(key, fileName, caption, widthIn) {
    const { PNG } = require("pngjs");
    if (!ASSETS && !path.isAbsolute(key)) throw new Error("afig: no assets folder for this document");
    const fp = path.isAbsolute(key) ? path.join(key, fileName) : path.join(ASSETS, key, "out", fileName);
    const data = fs.readFileSync(fp);
    const png = PNG.sync.read(data);
    const maxW = Math.min(CONTENT_EMU, widthIn ? Math.round(widthIn * 914400) : CONTENT_EMU), maxH = FIG_MAX_H;
    let w = maxW, h = w * png.height / png.width;
    if (h > maxH) { h = maxH; w = h * png.width / png.height; }
    const wPx = Math.floor(w / 9525), hPx = Math.round(wPx * png.height / png.width);
    const label = ((caption || "").match(/^Figure \d+/) || ["Screenshot"])[0];
    const altText = { name: label, title: label, description: "Screenshot: " + (caption || "").replace(/^Figure \d+\.\s*/, "") };
    const out = [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: !!caption, spacing: { before: 100, after: 40 },
      children: [new ImageRun({ data, transformation: { width: wPx, height: hPx }, altText })] })];
    out[0]._figure = true;
    if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new TextRun({ text: caption, italics: true, size: 17, color: GREY })] }));
    return out;
  }
  // makeDocument({ docTitle, footerLeft, body, figMaxH }): one section, the page from the config, a footer with
  // the left text and "Page N" at the right margin.
  function makeDocument({ docTitle, footerLeft, body, figMaxH }) {
    FIG_MAX_H = figMaxH ? Math.round(figMaxH * 914400) : DEFAULT_FIG_MAX_H;
    const children = typeof body === "function" ? body() : body;
    return new Document({
      creator: cfg.author,
      lastModifiedBy: cfg.author, // the library's default is "Un-named"; the clean scan reads a different name as a hand save
      title: docTitle,
      numbering: {
        config: ["steps", "steps2", "steps3", "steps4", "steps5", "steps6"].map((reference) => ({
          reference,
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 460, hanging: 300 } } } }],
        })),
      },
      styles: {
        default: {
          document: { run: { font: FONT, size: 21 } },
          title: { run: { font: FONT, size: 32, bold: true, color: "000000" } },
          heading1: { run: { font: FONT, size: 26, bold: true, color: DARKRED }, paragraph: { outlineLevel: 0 } },
          heading2: { run: { font: FONT, size: 23, bold: true, color: "000000" }, paragraph: { outlineLevel: 1 } },
        },
      },
      sections: [{
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              border: { top: { color: RED, space: 4, style: BorderStyle.SINGLE, size: 6 } },
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
              children: [
                new TextRun({ text: footerLeft, size: 15, color: GREY }),
                new TextRun({ children: [new Tab(), "Page ", PageNumber.CURRENT], size: 15, color: GREY }),
              ],
            })],
          }),
        },
        children: separateTables(keepLeadCallouts(children)),
      }],
    });
  }
  // Pack, then strip list overrides and keep each run of numbered steps with the figure after it.
  async function pack(doc) {
    const JSZip = require("jszip");
    const buf = await Packer.toBuffer(doc);
    const z = await JSZip.loadAsync(buf);
    const numFile = z.file("word/numbering.xml");
    let decimalMap = new Map();
    if (numFile) {
      const n = (await numFile.async("string")).replace(/<w:lvlOverride\b[\s\S]*?<\/w:lvlOverride>/g, "");
      z.file("word/numbering.xml", n);
      decimalMap = decimalNumberingLevels(n);
    }
    const d = await z.file("word/document.xml").async("string");
    const paras = d.split(/(?=<w:p>|<w:p )/);
    for (let i = 1; i < paras.length; i++) {
      if (!/<w:drawing\b/.test(paraBody(paras[i]))) continue;
      for (let j = i - 1; j >= 0 && isNumberedStep(paras[j], decimalMap); j--) {
        paras[j] = ensureKeepNext(paras[j]);
      }
    }
    z.file("word/document.xml", paras.join(""));
    return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  return {
    h2, h3, runs, para, num, bullet, callout, refTable, spacer, gap, titleBlock, afig, fitWidths,
    separateTables, keepLeadCallouts, makeDocument, pack,
    Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType, TableLayoutType,
    RED, DARKRED, GREY, LIGHTGREY, NOTEBLUE, WARNAMBER, CONTENT_W, CONTENT_EMU, ASSETS, FONT, PAGE, MARGIN,
  };
}

module.exports = {
  makeHelpers, PAGES, MARGIN,
  decimalNumberingLevels, isNumberedStep, hasKeepNext, hasKeepLines, ensureKeepNext,
};
