// lib/config.js: finds and checks qrg.config.json, the one file that makes this kit project-specific.
// Every kit script loads the project through here, so paths, sets, names, and house style live in one place.
//
// Where the config is found (first match wins):
//   1. --config=<path> on the command line, or the QRG_CONFIG environment variable
//   2. qrg.config.json in the current folder or any parent folder
//   3. qrg.config.json one level above the kit folder (the usual layout: <project>/qrg_kit/ next to <project>/qrg.config.json)
// All paths inside the config are relative to the folder that holds the config (the project root).
const fs = require("fs");
const path = require("path");

const KIT = path.resolve(__dirname, "..");

// A kit with no packages installed: say so plainly instead of Node's "Cannot find module". Scripts that run before an
// install (setup and the health check) are let through. Every other kit script loads this file before any package.
const MAIN = require.main && require.main.filename ? path.basename(require.main.filename) : "";
if (!fs.existsSync(path.join(KIT, "node_modules", "docx")) && !["init_project.js", "check_kit.js"].includes(MAIN)) {
  console.error("STOP: the kit's packages are not installed. Run:  cd \"" + KIT.split(path.sep).join("/") + "\" && npm install");
  process.exit(2);
}
const UNSAFE = /[\\/:*?"<>|#%&]/; // Windows, Office, URL, and Drive-unsafe file name characters

function findConfig(argv) {
  const flag = (argv || process.argv).find((a) => a.startsWith("--config="));
  if (flag) return path.resolve(flag.slice(9));
  if (process.env.QRG_CONFIG) return path.resolve(process.env.QRG_CONFIG);
  let d = process.cwd();
  for (;;) {
    const p = path.join(d, "qrg.config.json");
    if (fs.existsSync(p)) return p;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  const beside = path.join(KIT, "..", "qrg.config.json");
  if (fs.existsSync(beside)) return path.resolve(beside);
  return null;
}

const DEFAULTS = {
  project: "Project",
  author: "Change Management",
  status: "DRAFT",
  page: "letter",
  font: "Calibri",
  palette: { accent: "C00000", heading: "8B0000", grey: "595959", light: "F2F2F2", tip: "1F5C99", warn: "9C6500" },
  sections: ["Purpose", "Who does this", "Before you start", "Steps", "What happens next", "Troubleshooting"],
  figureMaxHeightIn: 5.25,
  sets: [],
  qa: { names: [], namesFile: "qa_names.txt", styleAllow: [], sessionWords: null, idPatterns: [], extraBanned: [] },
  render: { soffice: null },
  review: { dir: "review" },
};

function loadConfig(argv) {
  const file = findConfig(argv);
  if (!file) {
    console.error("STOP: no qrg.config.json found. Run scripts/init_project.js first, or pass --config=<path>.");
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const cfg = { ...DEFAULTS, ...raw, palette: { ...DEFAULTS.palette, ...(raw.palette || {}) },
    qa: { ...DEFAULTS.qa, ...(raw.qa || {}) }, render: { ...DEFAULTS.render, ...(raw.render || {}) },
    review: { ...DEFAULTS.review, ...(raw.review || {}) } };
  const root = path.dirname(file);
  const abs = (p) => path.resolve(root, p);
  const problems = [];
  if (!/^[A-Z]+$/.test(cfg.status)) problems.push('status must be capital letters (for example "DRAFT")');
  if (cfg.page !== "letter") {
    problems.push(
      cfg.page === "a4"
        ? 'page "a4" is not supported; QRGs must use Standard US Letter ("letter", 8.5 x 11 in)'
        : 'page must be "letter" (Standard US Letter, 8.5 x 11 in); got ' + JSON.stringify(cfg.page)
    );
  }
  const ids = new Set(), prefixes = new Set();
  for (const s of cfg.sets) {
    for (const k of ["id", "prefix", "unitLine", "footerTag", "dir", "out"]) if (!s[k]) problems.push("set " + (s.id || "?") + ": missing " + k);
    if (s.id && !/^[A-Za-z0-9-]+$/.test(s.id)) problems.push("set " + s.id + ": id may use letters, digits, and hyphens only");
    if (ids.has(s.id)) problems.push("set " + s.id + ": duplicate id");
    if (prefixes.has(s.prefix)) problems.push("set " + s.id + ": duplicate prefix " + s.prefix);
    if (s.prefix && UNSAFE.test(s.prefix)) problems.push("set " + s.id + ": prefix has a file-name-unsafe character");
    ids.add(s.id); prefixes.add(s.prefix);
  }
  if (problems.length) { console.error("STOP: qrg.config.json problems:\n  " + problems.join("\n  ")); process.exit(2); }
  const sets = cfg.sets.map((s) => ({
    ...s,
    guidesDir: abs(path.join(s.dir, "guides")),
    assetsDir: abs(path.join(s.dir, "assets")),
    workDir: abs(path.join(s.dir, "_work")),
    scratchDir: abs(path.join(s.dir, "_work", "scratch")),
    logFile: abs(path.join(s.dir, "_work", "last_qrgs_build.json")),
    outDir: abs(s.out),
    archiveDir: abs(path.join(s.out, "_archive")),
  }));
  const getSet = (id) => {
    const s = sets.find((x) => x.id === id);
    if (!s) { console.error("STOP: no set " + JSON.stringify(id) + " in qrg.config.json. Sets: " + sets.map((x) => x.id).join(", ")); process.exit(2); }
    return s;
  };
  // Names the QA and the clean scan look for: config list plus the optional names file (one per line).
  const names = [...(cfg.qa.names || [])];
  const nf = cfg.qa.namesFile ? abs(cfg.qa.namesFile) : null;
  if (nf && fs.existsSync(nf)) for (const n of fs.readFileSync(nf, "utf8").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#"))) names.push(n);
  return { cfg, file, root, abs, sets, getSet, names: [...new Set(names)], reviewDir: abs(cfg.review.dir), KIT };
}

// Live build name: "<prefix> NN - <Title> - <STATUS> YYYYMMDD-HHMM.docx"
function buildRe(set, status) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + esc(set.prefix) + " ([0-9]{2}) - (.+) - " + status + " ([0-9]{8}-[0-9]{4})[.]docx$");
}
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}
function arg(name, argv) {
  const a = (argv || process.argv).find((x) => x.startsWith("--" + name + "="));
  return a ? a.slice(name.length + 3) : null;
}
function flag(name, argv) { return (argv || process.argv).includes("--" + name); }
// A guide code is "<set id> NN", for example "UNIT1-INV 05".
const codeOf = (set, nn) => set.id + " " + nn;

module.exports = { loadConfig, buildRe, stamp, arg, flag, codeOf, UNSAFE, KIT };
