"use strict";

// lib/render.js: cross-platform DOCX-to-PDF discovery and conversion (LibreOffice headless,
// PortableApps / ~/Applications / AppImage, optional Windows Word COM fallback) plus pure-Node
// PDF-to-PNG page rasterization via pdfjs-dist + @napi-rs/canvas.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawnSync } = require("child_process");

const KIT = path.resolve(__dirname, "..");
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function isAppImagePath(p) {
  return /\.appimage$/i.test(String(p || ""));
}

function defaultWhich(cmd, platform, env, existsSync) {
  const pathMod = platform === "win32" ? path.win32 : path.posix;
  const rawPath = env.PATH || env.Path || "";
  const sep = platform === "win32" ? ";" : ":";
  const dirs = rawPath.split(sep).filter(Boolean);
  const exts =
    platform === "win32"
      ? (/\.[a-z0-9]+$/i.test(cmd) ? [""] : [".com", ".exe", ".cmd", ".bat", ""])
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = pathMod.join(dir, cmd + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function defaultHasWordCom(platform) {
  if (platform !== "win32") return false;
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "if (Test-Path 'Registry::HKEY_CLASSES_ROOT\\Word.Application') { 'word' } else { 'none' }"],
    { encoding: "utf8", timeout: 30000, windowsHide: true }
  );
  return !r.error && r.status === 0 && /\bword\b/i.test(r.stdout || "");
}

function preferWindowsSofficeCom(candidate, platform, existsSync) {
  if (platform === "win32" && /soffice\.exe$/i.test(candidate)) {
    const comCandidate = candidate.replace(/soffice\.exe$/i, "soffice.com");
    if (existsSync(comCandidate)) return comCandidate;
  }
  return candidate;
}

function formatSetupGuide(platform = process.platform) {
  const lines = [
    "No DOCX-to-PDF renderer was found on this machine.",
    "Build, QA, and proofing still work without LibreOffice.",
    "To generate visual Renders (PDF and page PNGs), install LibreOffice (free, no admin rights needed):",
    "",
  ];
  if (platform === "win32") {
    lines.push(
      "  Windows (no admin rights): Download LibreOffice Portable from https://www.libreoffice.org/download-other/#portable",
      "    and unpack it into %USERPROFILE%\\LibreOfficePortable (the kit uses App\\libreoffice\\program\\soffice.com).",
      "  Windows (standard install): Install LibreOffice into C:\\Program Files\\LibreOffice.",
      ""
    );
  } else if (platform === "darwin") {
    lines.push(
      "  macOS (no admin rights): Download the LibreOffice .dmg from https://www.libreoffice.org/download/download-libreoffice/",
      "    and drag LibreOffice.app into ~/Applications (or /Applications if you have admin rights).",
      ""
    );
  } else {
    lines.push(
      "  Linux (no admin rights): Download the LibreOffice AppImage from https://www.libreoffice.org/download-other/#appimage,",
      "    save it in ~/Applications/ (or ~/.local/bin/), and run chmod +x on it. If FUSE is unavailable, the kit",
      "    automatically retries with --appimage-extract-and-run.",
      "  Linux (distro package): Install libreoffice with your package manager so soffice is on PATH.",
      ""
    );
  }
  lines.push(
    "  Other platforms: Windows LibreOffice Portable, macOS ~/Applications/LibreOffice.app, or Linux AppImage / soffice.",
    "  Custom location: Set QRG_SOFFICE=\"<path to soffice>\" or add \"render\": { \"soffice\": \"<path>\" } in qrg.config.json."
  );
  return lines.join("\n");
}

function resolveExplicitOverride({ raw, source, platform, pathMod, projectRoot, existsSync, which }) {
  const trimmed = String(raw).trim();
  const hasSep = /[\\/]/.test(trimmed) || trimmed.startsWith(".");
  let candidate = null;
  if (hasSep) {
    const baseDir = source === "config" && projectRoot ? projectRoot : process.cwd();
    const resolved = pathMod.isAbsolute(trimmed) ? trimmed : pathMod.resolve(baseDir, trimmed);
    const adjusted = preferWindowsSofficeCom(resolved, platform, existsSync);
    if (existsSync(adjusted)) candidate = adjusted;
  } else {
    const found = which(trimmed);
    if (found) candidate = preferWindowsSofficeCom(found, platform, existsSync);
  }
  if (candidate) {
    return {
      kind: "libreoffice",
      source,
      command: candidate,
      isAppImage: isAppImagePath(candidate),
      label: source === "env" ? "LibreOffice (QRG_SOFFICE)" : "LibreOffice (qrg.config.json)",
    };
  }
  const where = source === "env" ? "QRG_SOFFICE" : "qrg.config.json render.soffice";
  return {
    kind: "missing",
    source,
    requested: trimmed,
    reason: "Configured LibreOffice path (" + where + ") was not found: " + trimmed,
    setupGuide: formatSetupGuide(platform),
  };
}

function findLinuxAppImage({ homeDir, projectRoot, pathMod, existsSync, readdirSync }) {
  const searchDirs = [];
  if (projectRoot) searchDirs.push(projectRoot);
  if (homeDir) {
    searchDirs.push(
      pathMod.join(homeDir, "Applications"),
      pathMod.join(homeDir, ".local", "bin"),
      pathMod.join(homeDir, "bin"),
      homeDir
    );
  }
  for (const dir of searchDirs) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch (e) {
      continue;
    }
    const matches = entries
      .filter((name) => /^libreoffice.*\.appimage$/i.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
    for (const name of matches) {
      const full = pathMod.join(dir, name);
      if (existsSync(full)) {
        return {
          kind: "libreoffice",
          source: "appimage",
          command: full,
          isAppImage: true,
          label: "LibreOffice AppImage",
        };
      }
    }
  }
  return null;
}

function findWindowsPortable({ homeDir, projectRoot, kitDir, env, pathMod, existsSync }) {
  const relPortable = pathMod.join("LibreOfficePortable", "App", "libreoffice", "program", "soffice.com");
  const candidates = [];
  if (projectRoot) candidates.push(pathMod.join(projectRoot, relPortable));
  if (kitDir) candidates.push(pathMod.join(kitDir, "..", relPortable));
  if (homeDir) {
    candidates.push(
      pathMod.join(homeDir, relPortable),
      pathMod.join(homeDir, "PortableApps", relPortable),
      pathMod.join(homeDir, "Apps", relPortable),
      pathMod.join(homeDir, "Tools", relPortable),
      pathMod.join(homeDir, "Desktop", relPortable),
      pathMod.join(homeDir, "Documents", relPortable)
    );
  }
  if (env.LOCALAPPDATA) {
    candidates.push(
      pathMod.join(env.LOCALAPPDATA, relPortable),
      pathMod.join(env.LOCALAPPDATA, "Programs", relPortable),
      pathMod.join(env.LOCALAPPDATA, "Programs", "LibreOffice", "program", "soffice.com")
    );
  }
  if (env.USERPROFILE && env.USERPROFILE !== homeDir) {
    candidates.push(pathMod.join(env.USERPROFILE, relPortable));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        kind: "libreoffice",
        source: "portable",
        command: candidate,
        isAppImage: false,
        label: "LibreOffice Portable",
      };
    }
  }
  return null;
}

function discoverRenderer(opts = {}) {
  const platform = opts.platform || process.platform;
  const pathMod = platform === "win32" ? path.win32 : path.posix;
  const env = opts.env || process.env;
  const cfg = opts.cfg || null;
  const projectRoot = opts.projectRoot || null;
  const kitDir = opts.kitDir || KIT;
  const homeDir = opts.homeDir !== undefined ? opts.homeDir : os.homedir();
  const existsSync = opts.existsSync || fs.existsSync;
  const readdirSync = opts.readdirSync || fs.readdirSync;
  const which = opts.which || ((cmd) => defaultWhich(cmd, platform, env, existsSync));
  const hasWordCom =
    typeof opts.hasWordCom === "function"
      ? opts.hasWordCom
      : typeof opts.hasWordCom === "boolean"
        ? () => opts.hasWordCom
        : () => defaultHasWordCom(platform);

  // 1. Explicit override: QRG_SOFFICE env var, then qrg.config.json render.soffice (or soffice).
  if (env.QRG_SOFFICE && String(env.QRG_SOFFICE).trim()) {
    return resolveExplicitOverride({
      raw: env.QRG_SOFFICE,
      source: "env",
      platform,
      pathMod,
      projectRoot,
      existsSync,
      which,
    });
  }
  const cfgSoffice = cfg && ((cfg.render && cfg.render.soffice) || cfg.soffice);
  if (cfgSoffice && String(cfgSoffice).trim()) {
    return resolveExplicitOverride({
      raw: cfgSoffice,
      source: "config",
      platform,
      pathMod,
      projectRoot,
      existsSync,
      which,
    });
  }

  // 2. Portable user-folder LibreOffice (Windows PortableApps soffice.com, Linux AppImage).
  if (platform === "win32") {
    const portable = findWindowsPortable({ homeDir, projectRoot, kitDir, env, pathMod, existsSync });
    if (portable) return portable;
  } else if (platform === "linux") {
    const appImage = findLinuxAppImage({ homeDir, projectRoot, pathMod, existsSync, readdirSync });
    if (appImage) return appImage;
  }

  // 3. Standard OS LibreOffice paths.
  if (platform === "win32") {
    const pf = env.ProgramFiles || "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    for (const candidate of [
      pathMod.join(pf, "LibreOffice", "program", "soffice.com"),
      pathMod.join(pf86, "LibreOffice", "program", "soffice.com"),
    ]) {
      if (existsSync(candidate)) {
        return {
          kind: "libreoffice",
          source: "standard",
          command: candidate,
          isAppImage: false,
          label: "LibreOffice",
        };
      }
    }
    for (const cmd of ["soffice.com", "soffice"]) {
      const found = which(cmd);
      if (found) {
        const command = preferWindowsSofficeCom(found, platform, existsSync);
        return {
          kind: "libreoffice",
          source: "path",
          command,
          isAppImage: false,
          label: "LibreOffice (PATH)",
        };
      }
    }
  } else if (platform === "darwin") {
    const macSystem = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
    if (existsSync(macSystem)) {
      return {
        kind: "libreoffice",
        source: "standard",
        command: macSystem,
        isAppImage: false,
        label: "LibreOffice (/Applications)",
      };
    }
    if (homeDir) {
      const macUser = pathMod.join(homeDir, "Applications", "LibreOffice.app", "Contents", "MacOS", "soffice");
      if (existsSync(macUser)) {
        return {
          kind: "libreoffice",
          source: "user-applications",
          command: macUser,
          isAppImage: false,
          label: "LibreOffice (~/Applications)",
        };
      }
    }
    for (const cmd of ["soffice", "libreoffice"]) {
      const found = which(cmd);
      if (found) {
        return {
          kind: "libreoffice",
          source: "path",
          command: found,
          isAppImage: false,
          label: "LibreOffice (PATH)",
        };
      }
    }
  } else {
    for (const cmd of ["soffice", "libreoffice"]) {
      const found = which(cmd);
      if (found) {
        return {
          kind: "libreoffice",
          source: "path",
          command: found,
          isAppImage: isAppImagePath(found),
          label: "LibreOffice (PATH)",
        };
      }
    }
    for (const candidate of [
      "/usr/bin/soffice",
      "/usr/local/bin/soffice",
      "/usr/bin/libreoffice",
      "/snap/bin/libreoffice",
    ]) {
      if (existsSync(candidate)) {
        return {
          kind: "libreoffice",
          source: "standard",
          command: candidate,
          isAppImage: false,
          label: "LibreOffice",
        };
      }
    }
  }

  // 4. Optional Windows Word COM fallback when LibreOffice is absent.
  if (platform === "win32") {
    const wordScript = pathMod.join(kitDir, "tools", "word_render.ps1");
    if (existsSync(wordScript) && hasWordCom()) {
      return {
        kind: "word-com",
        source: "word-fallback",
        command: "powershell.exe",
        script: wordScript,
        isAppImage: false,
        label: "Microsoft Word (Windows COM fallback)",
      };
    }
  }

  // 5. Missing renderer.
  return {
    kind: "missing",
    source: "none",
    reason: "No DOCX-to-PDF renderer found (LibreOffice or Windows Microsoft Word).",
    setupGuide: formatSetupGuide(platform),
  };
}

function buildLibreOfficeArgs({ docxPath, outDir, profileDir, extractAndRun = false }) {
  const args = [];
  if (extractAndRun) args.push("--appimage-extract-and-run");
  args.push(
    "--headless",
    "--norestore",
    "-env:UserInstallation=" + pathToFileURL(profileDir).href,
    "--convert-to",
    "pdf:writer_pdf_Export",
    "--outdir",
    outDir,
    docxPath
  );
  return args;
}

function findProducedPdf(outDir, docxPath) {
  const expected = path.join(outDir, path.parse(docxPath).name + ".pdf");
  if (fs.existsSync(expected)) return expected;
  const pdfs = fs.readdirSync(outDir).filter((name) => /\.pdf$/i.test(name));
  return pdfs.length === 1 ? path.join(outDir, pdfs[0]) : null;
}

function isFuseError(runResult) {
  const text = ((runResult && runResult.stderr) || "") + "\n" + ((runResult && runResult.stdout) || "");
  return /fuse|libfuse|cannot mount|extract-and-run/i.test(text);
}

function docxToPdf({ docxPath, pdfPath, renderer, timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawnSync }) {
  const resolved = renderer || discoverRenderer();
  if (!resolved || resolved.kind === "missing") {
    return {
      ok: false,
      missing: true,
      error: (resolved && resolved.reason) || "No DOCX-to-PDF renderer found.",
      setupGuide: (resolved && resolved.setupGuide) || formatSetupGuide(),
      renderer: resolved,
    };
  }

  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

  if (resolved.kind === "word-com") {
    const r = spawnFn(
      resolved.command || "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved.script, "-In", docxPath, "-Out", pdfPath],
      { encoding: "utf8", timeout: timeoutMs, windowsHide: true }
    );
    const created = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0;
    if (r.error || r.status !== 0 || !created) {
      return {
        ok: false,
        timedOut: !!(r.error && r.error.code === "ETIMEDOUT"),
        error: r.error ? r.error.code || r.error.message : "exit " + r.status,
        stdout: r.stdout || "",
        stderr: r.stderr || "",
        renderer: resolved,
      };
    }
    return { ok: true, pdfPath, renderer: resolved };
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "qrg-lo-profile-"));
  const tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "qrg-lo-out-"));
  try {
    const runOnce = (extractAndRun) => {
      const args = buildLibreOfficeArgs({ docxPath, outDir: tmpOutDir, profileDir, extractAndRun });
      const env = extractAndRun ? { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } : process.env;
      return spawnFn(resolved.command, args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true, env });
    };

    let r = runOnce(false);
    let produced = !r.error && r.status === 0 ? findProducedPdf(tmpOutDir, docxPath) : null;

    if (!produced && resolved.isAppImage && isFuseError(r)) {
      r = runOnce(true);
      produced = !r.error && r.status === 0 ? findProducedPdf(tmpOutDir, docxPath) : null;
    }

    if (r.error || r.status !== 0 || !produced) {
      return {
        ok: false,
        timedOut: !!(r.error && r.error.code === "ETIMEDOUT"),
        error: r.error ? r.error.code || r.error.message : r.status !== 0 ? "exit " + r.status : "LibreOffice did not produce a PDF",
        stdout: r.stdout || "",
        stderr: r.stderr || "",
        renderer: resolved,
      };
    }

    fs.copyFileSync(produced, pdfPath);
    if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size <= 0) {
      return { ok: false, error: "Converted PDF is empty", stdout: r.stdout || "", stderr: r.stderr || "", renderer: resolved };
    }
    return { ok: true, pdfPath, renderer: resolved };
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(tmpOutDir, { recursive: true, force: true });
  }
}

let cachedPdfjsPromise = null;

async function loadPdfjs() {
  if (!cachedPdfjsPromise) {
    const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
    const pdfjsUrl = pathToFileURL(path.join(pdfjsRoot, "legacy", "build", "pdf.mjs")).href;
    cachedPdfjsPromise = import(pdfjsUrl).then((pdfjs) => ({ pdfjs, pdfjsRoot }));
  }
  return cachedPdfjsPromise;
}

function toFactoryDirUrl(dir) {
  return String(dir).replace(/\\/g, "/").replace(/\/?$/, "/");
}

async function pdfToPngs({ pdfPath, outDir, baseName, scale = 110 }) {
  const scaleNum = Number(scale);
  if (!Number.isFinite(scaleNum) || scaleNum <= 0) {
    throw new Error("Invalid render scale: " + scale);
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error("PDF not found: " + pdfPath);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const base = baseName || path.parse(pdfPath).name;
  const { pdfjs, pdfjsRoot } = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: toFactoryDirUrl(path.join(pdfjsRoot, "cmaps")),
    cMapPacked: true,
    standardFontDataUrl: toFactoryDirUrl(path.join(pdfjsRoot, "standard_fonts")),
    wasmUrl: toFactoryDirUrl(path.join(pdfjsRoot, "wasm")),
    verbosity: pdfjs.VerbosityLevel ? pdfjs.VerbosityLevel.ERRORS : 0,
  });
  const files = [];
  try {
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: scaleNum / 72 });
      const width = Math.max(1, Math.round(viewport.width));
      const height = Math.max(1, Math.round(viewport.height));
      const canvasAndContext = pdfDocument.canvasFactory.create(width, height);
      try {
        await page.render({
          canvas: canvasAndContext.canvas,
          canvasContext: canvasAndContext.context,
          viewport,
          background: "rgb(255,255,255)",
        }).promise;
        const outFile = path.join(outDir, base + "_p" + String(pageNum).padStart(2, "0") + ".png");
        fs.writeFileSync(outFile, canvasAndContext.canvas.toBuffer("image/png"));
        files.push({ page: pageNum, path: outFile, width, height });
      } finally {
        pdfDocument.canvasFactory.destroy(canvasAndContext);
        page.cleanup();
      }
    }
    return { pages: numPages, files };
  } finally {
    await loadingTask.destroy();
  }
}

async function renderDocxToImages({ docxPath, outDir, baseName, scale = 110, renderer, timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawnSync }) {
  const base = baseName || path.parse(docxPath).name;
  const pdfPath = path.join(outDir, base + ".pdf");
  const pdfResult = docxToPdf({ docxPath, pdfPath, renderer, timeoutMs, spawnFn });
  if (!pdfResult.ok) return { ok: false, stage: "docx-to-pdf", ...pdfResult };
  try {
    const pngResult = await pdfToPngs({ pdfPath, outDir, baseName: base, scale });
    return { ok: true, pdfPath, pages: pngResult.pages, files: pngResult.files, renderer: pdfResult.renderer };
  } catch (e) {
    return {
      ok: false,
      stage: "pdf-to-png",
      error: e && e.message ? e.message : String(e),
      renderer: pdfResult.renderer,
    };
  }
}

module.exports = {
  discoverRenderer,
  formatSetupGuide,
  buildLibreOfficeArgs,
  docxToPdf,
  pdfToPngs,
  renderDocxToImages,
  loadPdfjs,
};
