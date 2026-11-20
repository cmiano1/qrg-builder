// lib/inventory.js: the live builds of every set, read fresh from disk each time (never from a saved list, so a lock,
// an OK List, or a send copy is always checked against the file that is really there now).
// A live build is "<prefix> NN - <Title> - <STATUS> YYYYMMDD-HHMM.docx" in the set's output folder (not _archive/).
// The guide code is "<set id> NN", for example "UNIT1-INV 05".
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function liveRe(set) {
  return new RegExp("^" + esc(set.prefix) + " ([0-9]{2}) - (.+) - ([A-Z]+) ([0-9]{8}-[0-9]{4})[.]docx$");
}

// Returns { guides: { code: {...} }, dup: [text], orphans: [text] }.
function liveInventory(P, opts = {}) {
  const guides = {}, dup = [], orphans = [];
  for (const set of P.sets) {
    if (opts.set && set.id !== opts.set) continue;
    if (!fs.existsSync(set.outDir)) continue;
    const re = liveRe(set);
    let log = {};
    try { log = JSON.parse(fs.readFileSync(set.logFile, "utf8")).files || {}; } catch (e) { log = null; }
    for (const f of fs.readdirSync(set.outDir).sort()) {
      const m = f.match(re);
      if (!m) continue;
      const nn = m[1], code = set.id + " " + nn, p = path.join(set.outDir, f);
      if (!fs.existsSync(path.join(set.guidesDir, nn + ".js"))) orphans.push(code + ": " + f + " has no guides/" + nn + ".js");
      if (guides[code]) dup.push(code + ": " + guides[code].file + " AND " + f);
      const st = fs.statSync(p);
      const ent = log ? Object.values(log).find((e) => e.file === f) : null;
      guides[code] = {
        code, set: set.id, setLabel: set.label || set.prefix, nn, title: m[2], status: m[3], stamp: m[4], file: f, path: p,
        sha256: sha256(p), mtimeMs: st.mtimeMs,
        inBuildLog: !!ent, handEdit: ent ? Math.abs(st.mtimeMs - ent.mtimeMs) > 2000 : null,
      };
    }
  }
  return { guides, dup, orphans };
}

// The render made from this exact file: <review>/render/<set id>_<NN>_<stamp>/render.json with the same SHA-256.
function renderDir(P, g) { return path.join(P.reviewDir, "render", g.set + "_" + g.nn + "_" + g.stamp); }
function findRender(P, g) {
  const d = renderDir(P, g), j = path.join(d, "render.json");
  if (!fs.existsSync(j)) return null;
  const r = JSON.parse(fs.readFileSync(j, "utf8"));
  if (r.sha256 !== g.sha256) return { stale: true, dir: d };
  const pages = fs.readdirSync(d).filter((x) => /_p[0-9]+[.]png$/i.test(x)).length;
  return { dir: d, pdf: path.join(d, r.pdfName), pages, renderedAt: r.renderedAt };
}

function readJson(p, dflt) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : dflt; }
// Write through a temp file, read it back, then rename over the target (a failed write never leaves a cut-off file).
function writeJsonSafe(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  JSON.parse(fs.readFileSync(tmp, "utf8"));
  fs.renameSync(tmp, p);
}
const fileUrl = (p) => "file:///" + encodeURI(String(p).replace(/\\/g, "/")).replace(/#/g, "%23");

module.exports = { liveInventory, liveRe, renderDir, findRender, sha256, readJson, writeJsonSafe, fileUrl, esc };
