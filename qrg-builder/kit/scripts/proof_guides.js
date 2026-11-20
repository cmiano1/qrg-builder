// proof_guides.js: offline English spelling and grammar check on built .docx QRGs using harper.js (pure Node/WASM),
// backed by the project custom dictionary (qrg.config.json qa.dictionary + qa_dictionary.txt). Advisory only (exits 0
// when flags are raised): read each flag in context, and read _work/qa_text_NN.txt for meaning and factual accuracy.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/proof_guides.js --set=<id> [NN ...]
//   node qrg_kit/scripts/proof_guides.js "<file.docx>" ...
// Output: <review dir>/_work/proof_<stamp>.json, plus a readable list on stdout.
const fs = require("fs");
const path = require("path");
const { loadConfig, arg, stamp } = require("../lib/config");
const { liveInventory, writeJsonSafe } = require("../lib/inventory");
const { proofDocxFiles } = require("../lib/proof");

async function main() {
  const P = loadConfig();
  const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const docx = pos.filter((a) => /\.docx$/i.test(a)).map((f) => path.resolve(f));
  const SET = arg("set");
  const files = docx.length
    ? docx
    : Object.values(liveInventory(P, { set: SET || undefined }).guides)
      .filter((g) => !pos.length || pos.includes(g.nn))
      .map((g) => g.path);
  if (!files.length) {
    console.error("usage: proof_guides.js --set=<id> [NN ...]  |  proof_guides.js <file.docx> ...");
    process.exit(2);
  }

  const work = path.join(P.reviewDir, "_work");
  fs.mkdirSync(work, { recursive: true });
  const out = path.join(work, "proof_" + stamp() + ".json");

  const rows = await proofDocxFiles(files, { dictionary: P.dictionary });
  writeJsonSafe(out, rows);

  for (const x of rows) {
    const text = String(x.text || "").trim();
    const sentence = String(x.sentence || "").trim();
    const ctx = sentence && sentence !== text ? " | in: " + sentence.slice(0, 100) : "";
    console.log("  " + x.kind + " | " + x.file + " | " + text.slice(0, 60) + ctx);
  }
  console.log("files " + files.length + "; flags " + rows.length + " (" + out + ")");
}

main().catch((err) => {
  console.error("FAIL proof_guides: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
});
