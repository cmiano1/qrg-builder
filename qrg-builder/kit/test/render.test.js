"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { PNG } = require("pngjs");

const KIT = path.resolve(__dirname, "..");

function makeTempDir(prefix = "qrg-render-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runNode(scriptRel, args = [], opts = {}) {
  const scriptPath = path.isAbsolute(scriptRel) ? scriptRel : path.join(KIT, scriptRel);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: opts.cwd || KIT,
    env: opts.env || process.env,
    encoding: "utf8",
  });
}

function seedAndBuildExample() {
  const dir = makeTempDir("qrg-render-e2e-");
  const init = runNode("scripts/init_project.js", [
    "--dir=" + dir,
    "--project=Render Pilot",
    "--set=UNIT1-INV",
    "--label=Unit 1 Investigator",
    "--unit-line=Unit 1 | Investigator",
    "--kit=skill",
  ]);
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const ex = runNode("scripts/new_guide.js", ["--set=UNIT1-INV", "--example"], { cwd: dir });
  assert.equal(ex.status, 0, ex.stdout + ex.stderr);

  const build = runNode("build_qrgs.js", ["--set=UNIT1-INV"], { cwd: dir });
  assert.equal(build.status, 0, build.stdout + build.stderr);

  const liveDir = path.join(dir, "QRGs", "Unit 1 Investigator");
  const liveFile = fs.readdirSync(liveDir).find((f) => f.endsWith(".docx"));
  assert.ok(liveFile, "expected built live .docx");
  return { dir, liveDir, liveFile, livePath: path.join(liveDir, liveFile) };
}

test("withLockAsync holds the render lock across awaits and releases on resolve and reject", async () => {
  const lockMod = require(path.join(KIT, "lib", "lock.js"));
  assert.equal(typeof lockMod.withLockAsync, "function", "lib/lock.js should export withLockAsync");

  const dir = makeTempDir();
  const lockDir = path.join(dir, "render.lock");
  const prevLockEnv = process.env.QRG_RENDER_LOCK;
  const prevHeldEnv = process.env.QRG_HOLDS_RENDER_LOCK;
  process.env.QRG_RENDER_LOCK = lockDir;
  delete process.env.QRG_HOLDS_RENDER_LOCK;

  try {
    let existedAfterAwait = false;
    const result = await lockMod.withLockAsync("render", { root: dir }, async () => {
      await new Promise((r) => setTimeout(r, 25));
      existedAfterAwait = fs.existsSync(lockDir);
      return "done";
    });
    assert.equal(result, "done");
    assert.equal(existedAfterAwait, true, "lock must remain held across async await");
    assert.equal(fs.existsSync(lockDir), false, "lock must be released after resolve");

    let existedBeforeReject = false;
    await assert.rejects(
      () =>
        lockMod.withLockAsync("render", { root: dir }, async () => {
          await new Promise((r) => setTimeout(r, 15));
          existedBeforeReject = fs.existsSync(lockDir);
          throw new Error("boom");
        }),
      /boom/
    );
    assert.equal(existedBeforeReject, true, "lock must be held before rejection");
    assert.equal(fs.existsSync(lockDir), false, "lock must be released after rejection");
  } finally {
    if (prevLockEnv === undefined) delete process.env.QRG_RENDER_LOCK;
    else process.env.QRG_RENDER_LOCK = prevLockEnv;
    if (prevHeldEnv === undefined) delete process.env.QRG_HOLDS_RENDER_LOCK;
    else process.env.QRG_HOLDS_RENDER_LOCK = prevHeldEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function stubFs({ files = [], dirs = {}, whichMap = {} } = {}) {
  const fileSet = new Set(files);
  return {
    existsSync: (p) => fileSet.has(p),
    readdirSync: (d) => {
      if (Object.prototype.hasOwnProperty.call(dirs, d)) return dirs[d];
      const err = new Error("ENOENT: " + d);
      err.code = "ENOENT";
      throw err;
    },
    which: (cmd) => (Object.prototype.hasOwnProperty.call(whichMap, cmd) ? whichMap[cmd] : null),
  };
}

test("discoverRenderer resolves explicit overrides before portable, standard, and fallback renderers", () => {
  const { discoverRenderer } = require(path.join(KIT, "lib", "render.js"));

  const envPath = "/custom/bin/soffice";
  const cfgRel = "./tools/lo/soffice";
  const cfgAbs = "/project/tools/lo/soffice";
  const stdPath = "/usr/bin/soffice";

  // 1. QRG_SOFFICE wins over config, AppImage, and standard PATH.
  const fsAll = stubFs({
    files: [envPath, cfgAbs, stdPath, "/home/alice/Applications/LibreOffice-26.2.AppImage"],
    dirs: { "/home/alice/Applications": ["LibreOffice-26.2.AppImage"] },
    whichMap: { soffice: stdPath },
  });
  const fromEnv = discoverRenderer({
    platform: "linux",
    env: { QRG_SOFFICE: envPath },
    cfg: { render: { soffice: cfgRel } },
    projectRoot: "/project",
    homeDir: "/home/alice",
    ...fsAll,
  });
  assert.equal(fromEnv.kind, "libreoffice");
  assert.equal(fromEnv.source, "env");
  assert.equal(fromEnv.command, envPath);
  assert.equal(fromEnv.isAppImage, false);

  // 2. Config render.soffice (relative to projectRoot) wins over portable/standard.
  const fromCfg = discoverRenderer({
    platform: "linux",
    env: {},
    cfg: { render: { soffice: cfgRel } },
    projectRoot: "/project",
    homeDir: "/home/alice",
    ...fsAll,
  });
  assert.equal(fromCfg.kind, "libreoffice");
  assert.equal(fromCfg.source, "config");
  assert.equal(fromCfg.command, cfgAbs);

  // 3. Explicit override pointing to an AppImage sets isAppImage: true.
  const envAppImage = "/opt/portable/LibreOffice-26.2-x86_64.AppImage";
  const fromEnvAppImage = discoverRenderer({
    platform: "linux",
    env: { QRG_SOFFICE: envAppImage },
    homeDir: "/home/alice",
    ...stubFs({ files: [envAppImage] }),
  });
  assert.equal(fromEnvAppImage.kind, "libreoffice");
  assert.equal(fromEnvAppImage.source, "env");
  assert.equal(fromEnvAppImage.isAppImage, true);

  // 4. Non-existent explicit QRG_SOFFICE reports missing with clear reason instead of silently ignoring it.
  const badEnv = discoverRenderer({
    platform: "linux",
    env: { QRG_SOFFICE: "/missing/soffice" },
    homeDir: "/home/alice",
    ...stubFs({ files: [stdPath], whichMap: { soffice: stdPath } }),
  });
  assert.equal(badEnv.kind, "missing");
  assert.equal(badEnv.source, "env");
  assert.match(badEnv.reason, /QRG_SOFFICE/);
  assert.match(badEnv.reason, /\/missing\/soffice/);
  assert.match(badEnv.setupGuide, /LibreOffice/i);
});

test("discoverRenderer follows deterministic Windows priority: PortableApps soffice.com -> standard soffice.com -> Word COM fallback -> missing", () => {
  const { discoverRenderer } = require(path.join(KIT, "lib", "render.js"));

  const home = "C:\\Users\\consultant";
  const kitDir = "C:\\work\\project\\qrg_kit";
  const wordScript = "C:\\work\\project\\qrg_kit\\tools\\word_render.ps1";
  const portableCom = "C:\\Users\\consultant\\LibreOfficePortable\\App\\libreoffice\\program\\soffice.com";
  const stdCom = "C:\\Program Files\\LibreOffice\\program\\soffice.com";
  const stdCom86 = "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com";
  const pathExe = "D:\\Tools\\LibreOffice\\program\\soffice.exe";
  const pathCom = "D:\\Tools\\LibreOffice\\program\\soffice.com";

  // 1. PortableApps soffice.com wins over standard Program Files and Word COM.
  const rPortable = discoverRenderer({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" },
    homeDir: home,
    kitDir,
    hasWordCom: () => true,
    ...stubFs({ files: [portableCom, stdCom, wordScript] }),
  });
  assert.equal(rPortable.kind, "libreoffice");
  assert.equal(rPortable.source, "portable");
  assert.equal(rPortable.command, portableCom);

  // 2. Standard Program Files soffice.com wins over x86 and Word COM.
  const rStd = discoverRenderer({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" },
    homeDir: home,
    kitDir,
    hasWordCom: () => true,
    ...stubFs({ files: [stdCom, stdCom86, wordScript] }),
  });
  assert.equal(rStd.kind, "libreoffice");
  assert.equal(rStd.source, "standard");
  assert.equal(rStd.command, stdCom);

  // 3. PATH soffice.exe automatically upgrades to sibling soffice.com for synchronous console execution.
  const rPathUpgrade = discoverRenderer({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files" },
    homeDir: home,
    kitDir,
    hasWordCom: () => true,
    ...stubFs({ files: [pathExe, pathCom, wordScript], whichMap: { soffice: pathExe } }),
  });
  assert.equal(rPathUpgrade.kind, "libreoffice");
  assert.equal(rPathUpgrade.source, "path");
  assert.equal(rPathUpgrade.command, pathCom);

  // 4. Optional Windows Word COM fallback is used when LibreOffice is absent.
  const rWord = discoverRenderer({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files" },
    homeDir: home,
    kitDir,
    hasWordCom: () => true,
    ...stubFs({ files: [wordScript] }),
  });
  assert.equal(rWord.kind, "word-com");
  assert.equal(rWord.source, "word-fallback");
  assert.equal(rWord.script, wordScript);

  // 5. Missing renderer on Windows prints plain-English PortableApps no-admin guidance.
  const rMissing = discoverRenderer({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files" },
    homeDir: home,
    kitDir,
    hasWordCom: () => false,
    ...stubFs({ files: [wordScript] }),
  });
  assert.equal(rMissing.kind, "missing");
  assert.match(rMissing.setupGuide, /LibreOffice Portable/i);
  assert.match(rMissing.setupGuide, /no admin/i);
  assert.match(rMissing.setupGuide, /QRG_SOFFICE/);
  assert.match(rMissing.setupGuide, /build, QA, and proofing still work/i);
});

test("discoverRenderer follows deterministic macOS and Linux priority and never uses Word COM off Windows", () => {
  const { discoverRenderer } = require(path.join(KIT, "lib", "render.js"));

  const macSys = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
  const macUser = "/Users/alex/Applications/LibreOffice.app/Contents/MacOS/soffice";

  // macOS: /Applications first, then ~/Applications, then PATH.
  const rMacSys = discoverRenderer({
    platform: "darwin",
    env: {},
    homeDir: "/Users/alex",
    kitDir: "/work/kit",
    hasWordCom: () => true,
    ...stubFs({ files: [macSys, macUser, "/work/kit/tools/word_render.ps1"] }),
  });
  assert.equal(rMacSys.kind, "libreoffice");
  assert.equal(rMacSys.source, "standard");
  assert.equal(rMacSys.command, macSys);

  const rMacUser = discoverRenderer({
    platform: "darwin",
    env: {},
    homeDir: "/Users/alex",
    kitDir: "/work/kit",
    hasWordCom: () => true,
    ...stubFs({ files: [macUser, "/work/kit/tools/word_render.ps1"] }),
  });
  assert.equal(rMacUser.kind, "libreoffice");
  assert.equal(rMacUser.source, "user-applications");
  assert.equal(rMacUser.command, macUser);

  const rMacMissing = discoverRenderer({
    platform: "darwin",
    env: {},
    homeDir: "/Users/alex",
    kitDir: "/work/kit",
    hasWordCom: () => true,
    ...stubFs({ files: ["/work/kit/tools/word_render.ps1"] }),
  });
  assert.equal(rMacMissing.kind, "missing");
  assert.match(rMacMissing.setupGuide, /~\/Applications/);

  // Linux: user-folder AppImage beats standard PATH soffice; newest AppImage wins deterministically.
  const appOld = "/home/alex/Applications/LibreOffice-25.8.0-x86_64.AppImage";
  const appNew = "/home/alex/Applications/LibreOffice-26.2.4-x86_64.AppImage";
  const rLinuxApp = discoverRenderer({
    platform: "linux",
    env: {},
    homeDir: "/home/alex",
    kitDir: "/work/kit",
    hasWordCom: () => true,
    ...stubFs({
      files: [appOld, appNew, "/usr/bin/soffice", "/work/kit/tools/word_render.ps1"],
      dirs: { "/home/alex/Applications": ["LibreOffice-25.8.0-x86_64.AppImage", "LibreOffice-26.2.4-x86_64.AppImage"] },
      whichMap: { soffice: "/usr/bin/soffice" },
    }),
  });
  assert.equal(rLinuxApp.kind, "libreoffice");
  assert.equal(rLinuxApp.source, "appimage");
  assert.equal(rLinuxApp.command, appNew);
  assert.equal(rLinuxApp.isAppImage, true);

  // Linux: standard PATH soffice when no AppImage exists.
  const rLinuxStd = discoverRenderer({
    platform: "linux",
    env: {},
    homeDir: "/home/alex",
    kitDir: "/work/kit",
    ...stubFs({
      files: ["/usr/bin/soffice"],
      whichMap: { soffice: "/usr/bin/soffice" },
    }),
  });
  assert.equal(rLinuxStd.kind, "libreoffice");
  assert.equal(rLinuxStd.source, "path");
  assert.equal(rLinuxStd.command, "/usr/bin/soffice");
  assert.equal(rLinuxStd.isAppImage, false);

  // Linux: missing renderer never triggers Word COM and prints AppImage no-admin instructions.
  const rLinuxMissing = discoverRenderer({
    platform: "linux",
    env: {},
    homeDir: "/home/alex",
    kitDir: "/work/kit",
    hasWordCom: () => true,
    ...stubFs({ files: ["/work/kit/tools/word_render.ps1"] }),
  });
  assert.equal(rLinuxMissing.kind, "missing");
  assert.match(rLinuxMissing.setupGuide, /AppImage/i);
});

test("docxToPdf isolates temp profile/outdir, relocates LibreOffice PDF, cleans up on success/error, retries AppImage without FUSE, and supports Word COM fallback", () => {
  const { docxToPdf } = require(path.join(KIT, "lib", "render.js"));
  const { fileURLToPath } = require("node:url");

  const dir = makeTempDir("qrg-docx2pdf-");
  try {
    const docxPath = path.join(dir, "Unit 1 Investigator 01 - Log a Call - DRAFT 20261119-1200.docx");
    fs.writeFileSync(docxPath, "fake-docx");
    const pdfPath = path.join(dir, "out", "UNIT1-INV_01.pdf");

    // 1. Standard LibreOffice headless run: checks flags, PDF relocation, and temp dir cleanup.
    let seenCmd = null;
    let seenArgs = null;
    let profileDirSeen = null;
    let outDirSeen = null;
    const res1 = docxToPdf({
      docxPath,
      pdfPath,
      renderer: { kind: "libreoffice", source: "standard", command: "/usr/bin/soffice", isAppImage: false, label: "LibreOffice" },
      spawnFn: (cmd, args) => {
        seenCmd = cmd;
        seenArgs = args;
        const profArg = args.find((a) => a.startsWith("-env:UserInstallation="));
        assert.ok(profArg, "expected -env:UserInstallation= arg");
        profileDirSeen = fileURLToPath(profArg.slice("-env:UserInstallation=".length));
        assert.equal(fs.existsSync(profileDirSeen), true, "temp profile dir must exist during LibreOffice run");
        const outIdx = args.indexOf("--outdir");
        assert.ok(outIdx >= 0, "expected --outdir arg");
        outDirSeen = args[outIdx + 1];
        assert.equal(fs.existsSync(outDirSeen), true, "temp outdir must exist during LibreOffice run");
        // LibreOffice writes <docx basename>.pdf inside --outdir.
        const loPdf = path.join(outDirSeen, path.parse(docxPath).name + ".pdf");
        fs.writeFileSync(loPdf, "%PDF-1.4\nfake\n");
        return { status: 0, stdout: "converted", stderr: "" };
      },
    });
    assert.equal(res1.ok, true, JSON.stringify(res1));
    assert.equal(seenCmd, "/usr/bin/soffice");
    assert.ok(seenArgs.includes("--headless"));
    assert.ok(seenArgs.includes("--norestore"));
    assert.equal(seenArgs[seenArgs.indexOf("--convert-to") + 1], "pdf:writer_pdf_Export");
    assert.equal(seenArgs[seenArgs.length - 1], docxPath);
    assert.equal(fs.existsSync(pdfPath), true, "PDF must be copied to target short pdfPath");
    assert.equal(fs.readFileSync(pdfPath, "utf8"), "%PDF-1.4\nfake\n");
    assert.equal(fs.existsSync(profileDirSeen), false, "temp profile dir must be cleaned up after success");
    assert.equal(fs.existsSync(outDirSeen), false, "temp outdir must be cleaned up after success");

    // 2. Temp dirs are also cleaned up when LibreOffice fails.
    let failProfileDir = null;
    let failOutDir = null;
    const pdfFail = path.join(dir, "out", "FAIL.pdf");
    const resFail = docxToPdf({
      docxPath,
      pdfPath: pdfFail,
      renderer: { kind: "libreoffice", source: "standard", command: "/usr/bin/soffice", isAppImage: false, label: "LibreOffice" },
      spawnFn: (_cmd, args) => {
        failProfileDir = fileURLToPath(args.find((a) => a.startsWith("-env:UserInstallation=")).slice("-env:UserInstallation=".length));
        failOutDir = args[args.indexOf("--outdir") + 1];
        return { status: 1, stdout: "", stderr: "conversion failed" };
      },
    });
    assert.equal(resFail.ok, false);
    assert.equal(fs.existsSync(failProfileDir), false, "temp profile dir must be cleaned up after failure");
    assert.equal(fs.existsSync(failOutDir), false, "temp outdir must be cleaned up after failure");

    // 3. Linux AppImage automatically retries with --appimage-extract-and-run when FUSE is absent.
    const appCalls = [];
    const pdfApp = path.join(dir, "out", "APPIMAGE_01.pdf");
    const resApp = docxToPdf({
      docxPath,
      pdfPath: pdfApp,
      renderer: {
        kind: "libreoffice",
        source: "appimage",
        command: "/home/alex/Applications/LibreOffice-26.2.AppImage",
        isAppImage: true,
        label: "LibreOffice AppImage",
      },
      spawnFn: (cmd, args, opts) => {
        appCalls.push({ cmd, args: [...args], env: opts && opts.env });
        if (appCalls.length === 1) {
          return { status: 127, stdout: "", stderr: "dlopen(): error loading libfuse.so.2\nAppImages require FUSE to run." };
        }
        const outDir = args[args.indexOf("--outdir") + 1];
        fs.writeFileSync(path.join(outDir, path.parse(docxPath).name + ".pdf"), "%PDF-1.4\nappimage\n");
        return { status: 0, stdout: "ok", stderr: "" };
      },
    });
    assert.equal(resApp.ok, true, JSON.stringify(resApp));
    assert.equal(appCalls.length, 2, "expected automatic retry with --appimage-extract-and-run");
    assert.equal(appCalls[0].args.includes("--appimage-extract-and-run"), false);
    assert.equal(appCalls[1].args[0], "--appimage-extract-and-run");
    assert.equal(appCalls[1].env && appCalls[1].env.APPIMAGE_EXTRACT_AND_RUN, "1");
    assert.equal(fs.readFileSync(pdfApp, "utf8"), "%PDF-1.4\nappimage\n");

    // 4. Windows Word COM fallback invokes powershell.exe with tools/word_render.ps1.
    const pdfWord = path.join(dir, "out", "WORD_01.pdf");
    let wordCall = null;
    const resWord = docxToPdf({
      docxPath,
      pdfPath: pdfWord,
      renderer: {
        kind: "word-com",
        source: "word-fallback",
        command: "powershell.exe",
        script: "C:\\kit\\tools\\word_render.ps1",
        isAppImage: false,
        label: "Microsoft Word (Windows COM fallback)",
      },
      spawnFn: (cmd, args) => {
        wordCall = { cmd, args };
        fs.mkdirSync(path.dirname(pdfWord), { recursive: true });
        fs.writeFileSync(pdfWord, "%PDF-1.4\nword\n");
        return { status: 0, stdout: "OK", stderr: "" };
      },
    });
    assert.equal(resWord.ok, true);
    assert.equal(wordCall.cmd, "powershell.exe");
    assert.deepEqual(wordCall.args, [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\kit\\tools\\word_render.ps1",
      "-In",
      docxPath,
      "-Out",
      pdfWord,
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("render_guides exits cleanly with plain-English setup guide when no renderer is found while build and QA still pass", () => {
  const { dir } = seedAndBuildExample();
  try {
    const qa = runNode("qa_qrgs.js", ["--set=UNIT1-INV", "01"], { cwd: dir });
    assert.equal(qa.status, 0, qa.stdout + qa.stderr);

    const renderMissing = runNode("scripts/render_guides.js", ["--set=UNIT1-INV"], {
      cwd: dir,
      env: {
        ...process.env,
        QRG_SOFFICE: path.join(dir, "no-such-soffice"),
        QRG_RENDER_LOCK: path.join(dir, "_work", "render.lock"),
      },
    });
    assert.notEqual(renderMissing.status, 0, "render_guides should exit non-zero when renderer is missing");
    const out = renderMissing.stdout + renderMissing.stderr;
    assert.match(out, /LibreOffice/i);
    assert.match(out, /no admin/i);
    assert.match(out, /build, QA, and proofing still work/i);
    assert.doesNotMatch(out, /at Object\.<anonymous>|TypeError:|ReferenceError:/, "should exit cleanly without stack trace");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("End-to-end LibreOffice DOCX -> PDF -> pure-Node PNG render produces exact multi-page PNGs, valid render.json SHA-256, and passes Review Lock", async (t) => {
  const { discoverRenderer } = require(path.join(KIT, "lib", "render.js"));
  const renderer = discoverRenderer();
  if (renderer.kind !== "libreoffice") {
    t.skip("LibreOffice is not installed on this host");
    return;
  }

  const { dir, liveFile, livePath } = seedAndBuildExample();
  const lockPath = path.join(dir, "_work", "render.lock");
  const env = { ...process.env, QRG_RENDER_LOCK: lockPath };

  try {
    const liveSha = crypto.createHash("sha256").update(fs.readFileSync(livePath)).digest("hex");

    // 1. Live set render at default scale 110.
    const r1 = runNode("scripts/render_guides.js", ["--set=UNIT1-INV"], { cwd: dir, env });
    assert.equal(r1.status, 0, r1.stdout + r1.stderr);
    assert.match(r1.stdout, /RENDERED UNIT1-INV 01: 2 page\(s\)/);
    assert.equal(fs.existsSync(lockPath), false, "render lock must be released after render");

    const renderRoot = path.join(dir, "review", "render");
    const renderDirs = fs.readdirSync(renderRoot);
    assert.equal(renderDirs.length, 1);
    const rDir = path.join(renderRoot, renderDirs[0]);

    const pdfPath = path.join(rDir, "UNIT1-INV_01.pdf");
    const p1Path = path.join(rDir, "UNIT1-INV_01_p01.png");
    const p2Path = path.join(rDir, "UNIT1-INV_01_p02.png");
    assert.equal(fs.existsSync(pdfPath), true);
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 5).toString("ascii"), "%PDF-");
    assert.equal(fs.existsSync(p1Path), true);
    assert.equal(fs.existsSync(p2Path), true);

    // US Letter (612 x 792 pt) at 110 DPI => exact 935 x 1210 px.
    const png1 = PNG.sync.read(fs.readFileSync(p1Path));
    const png2 = PNG.sync.read(fs.readFileSync(p2Path));
    assert.equal(png1.width, 935);
    assert.equal(png1.height, 1210);
    assert.equal(png2.width, 935);
    assert.equal(png2.height, 1210);

    // Verify exact render.json schema & SHA-256 matching.
    const meta = JSON.parse(fs.readFileSync(path.join(rDir, "render.json"), "utf8"));
    assert.equal(meta.code, "UNIT1-INV 01");
    assert.equal(meta.file, liveFile);
    assert.equal(meta.sha256, liveSha);
    assert.equal(meta.pdfName, "UNIT1-INV_01.pdf");
    assert.equal(meta.pages, 2);
    assert.equal(meta.scale, 110);
    assert.ok(!Number.isNaN(Date.parse(meta.renderedAt)), "renderedAt must be an ISO timestamp");

    // 2. Review Lock accepts the rendered live build.
    const lockRes = runNode("scripts/lock_guides.js", ["--how=Rendered via LibreOffice", "--set=UNIT1-INV", "01"], { cwd: dir, env });
    assert.equal(lockRes.status, 0, lockRes.stdout + lockRes.stderr);
    assert.match(lockRes.stdout, /LOCKED \(1\)/);
    assert.match(lockRes.stdout, /UNIT1-INV 01: .*2 page\(s\)/);

    // 3. Re-running without --force skips cleanly.
    const rSkip = runNode("scripts/render_guides.js", ["--set=UNIT1-INV"], { cwd: dir, env });
    assert.equal(rSkip.status, 0, rSkip.stdout + rSkip.stderr);
    assert.match(rSkip.stdout, /SKIP UNIT1-INV 01: already rendered/);

    // 4. Re-running with --force --scale=150 produces 1275 x 1650 px PNGs.
    const r150 = runNode("scripts/render_guides.js", ["--set=UNIT1-INV", "--force", "--scale=150"], { cwd: dir, env });
    assert.equal(r150.status, 0, r150.stdout + r150.stderr);
    const png150 = PNG.sync.read(fs.readFileSync(p1Path));
    assert.equal(png150.width, 1275);
    assert.equal(png150.height, 1650);
    const meta150 = JSON.parse(fs.readFileSync(path.join(rDir, "render.json"), "utf8"));
    assert.equal(meta150.scale, 150);
    assert.equal(meta150.sha256, liveSha);

    // 5. --file scratch render writes PDF and PNGs with NO render.json.
    const scratchOut = path.join(dir, "_work", "custom_scratch_render");
    const rFile = runNode("scripts/render_guides.js", ["--file=" + livePath, "--out=" + scratchOut], { cwd: dir, env });
    assert.equal(rFile.status, 0, rFile.stdout + rFile.stderr);
    assert.match(rFile.stdout, /RENDERED .*2 page\(s\)/);
    assert.equal(fs.existsSync(path.join(scratchOut, "render.json")), false, "--file must never write render.json");
    const scratchPngs = fs.readdirSync(scratchOut).filter((f) => /_p[0-9]+\.png$/i.test(f));
    assert.equal(scratchPngs.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Windows-only pdf_to_png.ps1 is removed, word_render.ps1 has stray test comments cleaned, and check_kit verifies pdfjs-dist, @napi-rs/canvas, and cross-platform renderer", () => {
  assert.equal(fs.existsSync(path.join(KIT, "tools", "pdf_to_png.ps1")), false, "tools/pdf_to_png.ps1 must be removed");

  const wordPs1Path = path.join(KIT, "tools", "word_render.ps1");
  assert.equal(fs.existsSync(wordPs1Path), true, "optional tools/word_render.ps1 fallback should remain");
  const wordPs1 = fs.readFileSync(wordPs1Path, "utf8");
  assert.doesNotMatch(wordPs1, /done_review_20261111|word_mode_test\.ps1/i, "stray internal test comment must be removed");
  assert.match(wordPs1, /ExportAsFixedFormat/);

  // Health check with local environment: verifies pdfjs-dist, @napi-rs/canvas, and cross-platform renderer section.
  const checkLocal = runNode("scripts/check_kit.js");
  assert.equal(checkLocal.status, 0, checkLocal.stdout + checkLocal.stderr);
  assert.match(checkLocal.stdout, /ok\s+@napi-rs\/canvas loads/i);
  assert.match(checkLocal.stdout, /ok\s+pdfjs-dist loads/i);
  assert.doesNotMatch(checkLocal.stdout, /Word render \(Windows only\)/);
  assert.match(checkLocal.stdout, /Renderer/i);
  assert.match(checkLocal.stdout, /RESULT: kit ready/);

  const { discoverRenderer } = require(path.join(KIT, "lib", "render.js"));
  if (discoverRenderer().kind === "libreoffice") {
    assert.match(checkLocal.stdout, /ok\s+LibreOffice/i);
  }

  // Health check when no renderer is found warns cleanly without failing the kit check.
  const checkMissing = runNode("scripts/check_kit.js", [], {
    env: { ...process.env, QRG_SOFFICE: path.join(KIT, "no-such-soffice") },
  });
  assert.equal(checkMissing.status, 0, checkMissing.stdout + checkMissing.stderr);
  assert.match(checkMissing.stdout, /warn\s+.*LibreOffice/i);
  assert.match(checkMissing.stdout, /RESULT: kit ready/);
});
