// pack_skill.js: zips the qrg-builder Skill (SKILL.md, references/, kit/) for a teammate, without node_modules, work
// folders, or archives. The zip holds one top folder, qrg-builder/, so it unzips cleanly into any AI tool's skills
// folder (Claude Code, Antigravity, Codex, Cursor) or any local folder for standalone CLI use.
// Before zipping it checks every text file for em or en dashes and for a word list you pass (client names, people's
// names), so nothing from your last project leaves with the Skill. Read-only on the Skill folder.
// Usage:
//   node pack_skill.js "<out folder>" [--words="Word1,Word2"] [--words-file="<one word per line>"] [--force]
//   node pack_skill.js --out="<file.zip>" [--words="Word1,Word2"] [--words-file="<one word per line>"] [--force]
//   --force  write the zip even if the check finds something (it still prints every hit)
// Output: "<out folder>/QRG Builder Skill - <stamp>.zip" (or --out path) plus a .json list of the files and their SHA-256.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { stamp, arg, flag } = require("../lib/config");
const JSZip = require("jszip");

const SKILL = path.resolve(__dirname, "..", "..");
const outFileArg = arg("out");
const outDir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!outDir && !outFileArg) { console.error('usage: node pack_skill.js "<out folder>" [--out="<file.zip>"] [--words="A,B"] [--words-file=<file>] [--force]'); process.exit(2); }
if (!fs.existsSync(path.join(SKILL, "SKILL.md"))) { console.error("STOP: run this from the Skill's own kit (<skill>/kit/scripts/pack_skill.js), not a project's qrg_kit copy."); process.exit(2); }
const SKIP = new Set(["node_modules", "_work", "_archive", "_archive_backups", ".git"]);
const TEXT = /[.](js|json|md|ps1|txt|vbs|sh|html|css)$/i;

const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (SKIP.has(e.name) || e.name.startsWith("~$")) continue;
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else files.push(p);
} };
walk(SKILL);

const words = [...(arg("words") || "").split(","), ...(arg("words-file") && fs.existsSync(arg("words-file"))
  ? fs.readFileSync(arg("words-file"), "utf8").split(/\r?\n/) : [])].map((w) => w.trim()).filter((w) => w && !w.startsWith("#"));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDS_RE = words.length ? new RegExp("\\b(" + words.map(esc).join("|") + ")\\b", "gi") : null;
const DASH_RE = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]", "g");
const hits = [];
for (const f of files.filter((x) => TEXT.test(x))) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => {
    const rel = path.relative(SKILL, f).split(path.sep).join("/") + ":" + (i + 1);
    if (l.match(DASH_RE)) hits.push(rel + "  dash: " + l.trim().slice(0, 120));
    const w = WORDS_RE ? l.match(WORDS_RE) : null;
    if (w) hits.push(rel + "  word " + [...new Set(w)].join(", ") + ": " + l.trim().slice(0, 120));
  });
}
if (hits.length) {
  console.log("CHECK found " + hits.length + " line(s):\n  " + hits.join("\n  "));
  if (!flag("force")) { console.log("STOP: fix these in the skill folder, or rerun with --force."); process.exit(1); }
} else console.log("check clean: no dashes" + (WORDS_RE ? " and none of the " + words.length + " words" : " (no word list given)"));

const zip = new JSZip();
const list = [];
for (const f of files) {
  const buf = fs.readFileSync(f), rel = path.relative(SKILL, f).split(path.sep).join("/");
  zip.file("qrg-builder/" + rel, buf);
  list.push({ file: rel, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") });
}
const kitVersion = JSON.parse(fs.readFileSync(path.join(SKILL, "kit", "package.json"), "utf8")).version;
let out;
if (outFileArg) {
  out = path.resolve(outFileArg);
  if (!/[.]zip$/i.test(out)) out += ".zip";
  fs.mkdirSync(path.dirname(out), { recursive: true });
} else {
  fs.mkdirSync(outDir, { recursive: true });
  const name = "QRG Builder Skill - " + stamp() + ".zip";
  out = path.join(path.resolve(outDir), name);
}
if (fs.existsSync(out)) { console.error("STOP: " + path.basename(out) + " already exists. Wait a minute or pass --out=<file.zip>."); process.exit(2); }
zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then((buf) => {
  fs.writeFileSync(out, buf);
  fs.writeFileSync(out.replace(/[.]zip$/, ".json"), JSON.stringify({ kitVersion, made: new Date().toISOString(), files: list }, null, 2) + "\n");
  console.log("wrote " + out + " (" + list.length + " files, " + Math.round(buf.length / 1024) + " KB, kit " + kitVersion + ")");
  console.log("Teammate: unzip into your AI tool's skills folder (or any local folder for standalone CLI) so you have qrg-builder/, then in qrg-builder/kit/: npm install && npm run check");
});
