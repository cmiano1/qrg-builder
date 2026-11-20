// gdocs_lint_selftest.js: proves each gdocs_lint.js rule still catches what it is meant to catch.
// Read-only: it reads one clean build, breaks it one rule at a time
// in memory, and lints each broken copy. Nothing is written to disk.
// Run (from the kit folder) after any change to gdocs_lint.js, with a build that lints clean:
//   node tools/gdocs_lint_selftest.js "<clean build.docx>"
// Exit 0: every rule fired on its broken copy (and the Google comment marker did not raise a false alarm).
// Exit 1: a rule missed, a break could not be applied (the build's XML changed shape; update the case), or
// the base file is not clean. Built against a docx-library QRG build (US Letter).
const fs = require("fs");
const path = require("path");
let JSZip;
try { JSZip = require("jszip"); } catch (e) { JSZip = require(path.resolve(__dirname, "..", "node_modules", "jszip")); }
const { lintDocx } = require("./gdocs_lint");

const OPTS = { page: "letter", fullWidth: true, fonts: ["Calibri"] };
const DOC = "word/document.xml", FOOT = "word/footer1.xml", NUM = "word/numbering.xml";
const GOOGLE_ANCHOR = '<w:sdt><w:sdtPr><w:id w:val="1416308784"/><w:tag w:val="goog_rdk_0"/></w:sdtPr><w:sdtContent><w:commentRangeStart w:id="0"/></w:sdtContent></w:sdt>';

// [rule, level, part, find (string or regex, first match), replacement]. A case with level null expects the
// rule NOT to fire (a false-alarm check).
const CASES = [
  ["page-size", "FAIL", DOC, /<w:pgSz w:w="12240" w:h="15840"/, '<w:pgSz w:w="11906" w:h="16838"'],
  ["table-width", "FAIL", DOC, '<w:tblLayout w:type="fixed"/>', ""],
  ["literal-tab", "FAIL", FOOT, /(<w:t[ >][^<]*)(<\/w:t>)/, "$1\t$2"],
  ["line-spacing", "FAIL", DOC, "<w:spacing ", '<w:spacing w:line="240" w:lineRule="exact" '],
  ["floating-image", "FAIL", DOC, "<wp:inline ", "<wp:anchor "],
  ["alt-text", "FAIL", DOC, / descr="[^"]+"/, ' descr=""'],
  ["image-width", "FAIL", DOC, /<wp:extent cx="\d+"/, '<wp:extent cx="7200000"'],
  ["fonts", "FAIL", DOC, "<w:rPr>", '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'],
  ["hairline-border", "FAIL", DOC, /(<w:tblBorders><w:top [^>]*w:sz=")4"/, '$12"'],
  ["object", "FAIL", DOC, "</w:pPr>", '</w:pPr><w:sdt><w:sdtPr><w:id w:val="1"/></w:sdtPr><w:sdtContent><w:r><w:t>x</w:t></w:r></w:sdtContent></w:sdt>'],
  ["object", null, DOC, "</w:pPr>", "</w:pPr>" + GOOGLE_ANCHOR],
  ["heading-keep", "FAIL", DOC, '<w:pStyle w:val="Heading1"/><w:keepNext/>', '<w:pStyle w:val="Heading1"/>'],
  ["image-format", "FAIL", "word/media/selftest.emf", null, "not a real picture"],
  ["tab-stop", "WARN", FOOT, /(<w:tab w:val="right" w:pos=")\d+"/, '$111000"'],
  ["list-override", "WARN", NUM, /(<w:num w:numId="\d+"[^>]*>\s*<w:abstractNumId w:val="\d+"\/>)/, '$1<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>'],
];

(async () => {
  const file = process.argv[2];
  if (!file) { console.log('usage: node tools/gdocs_lint_selftest.js "<clean build.docx>"'); process.exit(2); }
  const base = fs.readFileSync(file);
  const baseFails = (await lintDocx(base, OPTS)).filter((r) => r.level === "FAIL");
  if (baseFails.length) { console.log("Base file is not clean; fix it or pick another build first:"); baseFails.forEach((r) => console.log("  " + r.rule + ": " + r.detail)); process.exit(1); }
  let bad = 0;
  for (const [rule, level, part, find, repl] of CASES) {
    const zip = await JSZip.loadAsync(base);
    let note = "";
    if (find === null) zip.file(part, repl); // a new part
    else {
      const before = await zip.file(part).async("string");
      const after = before.replace(find, repl);
      if (after === before) { bad++; console.log(`MISS ${rule.padEnd(15)} the break did not apply (${part} changed shape)`); continue; }
      zip.file(part, after);
    }
    const found = (await lintDocx(await zip.generateAsync({ type: "nodebuffer" }), OPTS)).filter((r) => r.rule === rule && (level ? r.level === level : true));
    const ok = level ? found.length > 0 : found.length === 0;
    if (!ok) bad++;
    note = level ? (found[0] ? found[0].detail : "rule did not fire") : (found[0] ? "false alarm: " + found[0].detail : "no false alarm (Google comment marker)");
    console.log(`${ok ? "ok  " : "MISS"} ${rule.padEnd(15)} ${(level || "none").padEnd(4)} ${note.slice(0, 110)}`);
  }
  console.log(bad ? `\nRESULT: ${bad} case(s) failed` : `\nRESULT: all ${CASES.length} cases passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
