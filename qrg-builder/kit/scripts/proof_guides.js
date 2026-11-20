// proof_guides.js: Word's own spelling and grammar check on live builds (tools/word_proof.ps1, read-only, invisible),
// under the render lock. This is the floor, not a full edit: Word's built-in checker over COM misses things the cloud
// Editor catches, and it flags real UI labels and product names. Read each flag in context.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/proof_guides.js --set=<id> [NN ...]
//   node qrg_kit/scripts/proof_guides.js "<file.docx>" ...
// Output: <review dir>/_work/proof_<stamp>.json, plus a short list here.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, arg, stamp } = require("../lib/config");
const { liveInventory } = require("../lib/inventory");
const { withLock } = require("../lib/lock");

const P = loadConfig();
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const docx = pos.filter((a) => /\.docx$/i.test(a)).map((f) => path.resolve(f));
const SET = arg("set");
const files = docx.length ? docx : Object.values(liveInventory(P, { set: SET || undefined }).guides)
  .filter((g) => !pos.length || pos.includes(g.nn)).map((g) => g.path);
if (!files.length) { console.error("usage: proof_guides.js --set=<id> [NN ...]  |  proof_guides.js <file.docx> ..."); process.exit(2); }
const work = path.join(P.reviewDir, "_work");
fs.mkdirSync(work, { recursive: true });
const s = stamp(), list = path.join(work, "proof_list_" + s + ".txt"), out = path.join(work, "proof_" + s + ".json");
fs.writeFileSync(list, files.join("\r\n"));
const r = withLock("render", P, () => spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  path.join(P.KIT, "tools", "word_proof.ps1"), "-List", list, "-Out", out], { encoding: "utf8", timeout: 10 * 60 * 1000, windowsHide: true }));
if (r.status !== 0 || !fs.existsSync(out)) { console.log("FAIL word_proof: " + (r.error ? r.error.code : "exit " + r.status) + "\n" + (r.stdout || "") + (r.stderr || "")); process.exit(1); }
const raw = fs.readFileSync(out, "utf8").replace(/^﻿/, "");
const rows = JSON.parse(raw || "[]");
for (const x of [].concat(rows)) console.log("  " + x.kind + " | " + x.file + " | " + String(x.text).trim().slice(0, 60) + (x.kind === "spelling" && x.sentence ? " | in: " + String(x.sentence).trim().slice(0, 100) : ""));
console.log("files " + files.length + "; flags " + [].concat(rows).length + " (" + out + ")");
