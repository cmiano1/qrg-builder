// new_guide.js: starts one guide in a set: guides/NN.js from templates/guide_template.js, and
// assets/<assetKey>NN/ with src/, out/, and an annotate.json that points back at the guide. Never overwrites.
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/new_guide.js --set=<id> NN "<Title>" ["<Subtitle>"]
//   node qrg_kit/scripts/new_guide.js --set=<id> --example     the worked example (guide 01 plus a made-up screenshot,
//                                                              annotated), to build, QA, and render once before real work
// Title rules: a task name in title case, for example "Log a Call on a Case". No file-name-unsafe characters
// (\ / : * ? " < > | # % &), and keep it short: it is in the file name and the footer.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, arg, flag, UNSAFE } = require("../lib/config");

const P = loadConfig();
const SET = P.getSet(arg("set") || process.env.QRG_SET || "");
const KEY = SET.assetKey || SET.id.replace(/[^A-Za-z0-9]/g, "");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const EX = flag("example");
const TPL = path.join(P.KIT, "templates");

const nn = EX ? "01" : pos[0];
if (!nn || !/^\d\d$/.test(nn)) { console.error('usage: new_guide.js --set=<id> NN "<Title>" ["<Subtitle>"]   or   --set=<id> --example'); process.exit(2); }
const gfile = path.join(SET.guidesDir, nn + ".js");
if (fs.existsSync(gfile)) { console.error("STOP: " + path.relative(P.root, gfile) + " already exists. Pick another number."); process.exit(2); }
const assetDir = path.join(SET.assetsDir, KEY + nn);
if (fs.existsSync(path.join(assetDir, "annotate.json"))) { console.error("STOP: " + path.relative(P.root, assetDir) + "/annotate.json already exists."); process.exit(2); }
fs.mkdirSync(SET.guidesDir, { recursive: true });
fs.mkdirSync(path.join(assetDir, "src"), { recursive: true });
fs.mkdirSync(path.join(assetDir, "out"), { recursive: true });
const rel = (p) => path.relative(P.root, p).replace(/\\/g, "/");

if (EX) {
  fs.copyFileSync(path.join(TPL, "example", "guides", "01.js"), gfile);
  const man = JSON.parse(fs.readFileSync(path.join(TPL, "example", "annotate.json"), "utf8"));
  man.guide = "../../guides/" + nn + ".js";
  fs.writeFileSync(path.join(assetDir, "annotate.json"), JSON.stringify(man, null, 2) + "\n");
  const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit", cwd: P.KIT });
  // If a step fails, take back what this run wrote, so a rerun starts clean.
  const undo = (why) => {
    fs.rmSync(gfile, { force: true });
    fs.rmSync(assetDir, { recursive: true, force: true });
    console.error("STOP: " + why + ". Nothing was left behind. Check the kit with  node " + path.join(P.KIT, "scripts", "check_kit.js") + "  and rerun.");
    process.exit(1);
  };
  if (run([path.join(TPL, "example", "make_example_png.js"), path.join(assetDir, "src", "example_case.png")]).status !== 0) undo("the example screenshot was not drawn");
  if (run([path.join(P.KIT, "tools", "annotate_screenshot.js"), path.join(assetDir, "annotate.json")]).status !== 0) undo("the annotator failed");
  console.log("WROTE " + rel(gfile) + " (the worked example) and " + rel(assetDir) + "/ (source, annotate.json, 2 annotated figures)");
} else {
  const title = pos[1], subtitle = pos[2] || "";
  if (!title) { console.error("STOP: give a title"); process.exit(2); }
  for (const [k, v] of [["title", title], ["subtitle", subtitle]]) if (UNSAFE.test(v) || /"/.test(v)) { console.error("STOP: the " + k + " has an unsafe character (\\ / : * ? \" < > | # % &)"); process.exit(2); }
  const g = fs.readFileSync(path.join(TPL, "guide_template.js"), "utf8")
    .split("__NN__").join(nn).split("__TITLE__").join(title).split("__SUBTITLE__").join(subtitle)
    .split("__KEY_LOWER__").join(KEY.toLowerCase()).split("__KEY__").join(KEY)
    .split("__SOURCES__").join("TODO").split("__LEFT_OUT__").join("none yet");
  fs.writeFileSync(gfile, g);
  fs.writeFileSync(path.join(assetDir, "annotate.json"), JSON.stringify({
    srcDir: "src", outDir: "out", displayWidth: 600, badgeIn: 0.24, guide: "../../guides/" + nn + ".js",
    figures: [],
  }, null, 2) + "\n");
  console.log("WROTE " + rel(gfile) + " and " + rel(assetDir) + "/annotate.json (put source screenshots in src/)");
}
const K = path.relative(P.root, P.KIT).replace(/\\/g, "/") || ".";
console.log("\nNext (from " + P.root + "):"
  + (EX ? "" : "\n  write the guide (references/content_rules.md), add figures to annotate.json, then  node " + K + "/tools/annotate_screenshot.js \"" + rel(assetDir) + "/annotate.json\"  (--grid helps pick box coordinates)")
  + "\n  node " + K + "/build_qrgs.js --set=" + SET.id + " --scratch --only=\"" + SET.prefix + " " + nn + " \"     a test build"
  + "\n  node " + K + "/qa_qrgs.js --set=" + SET.id + " " + nn + " --scratch"
  + "\n  then the live build, QA, render, and look at every page (SKILL.md, the per-guide loop).");
