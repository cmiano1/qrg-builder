// review_ui.js: zero-dependency local Browser Review UI server for reviewing locked US Letter QRGs
// side by side, auto-saving picks and comments into the project's review folder, exporting .xlsx OK Lists,
// and staging clean Send Copies into _send/ (ADR-0002, ADR-0004).
// Usage (from anywhere under the project):
//   node qrg_kit/scripts/review_ui.js [--port=<N>] [--no-open] [--set=<id>] [--config=<path>]
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { loadConfig } = require("../lib/config");
const {
  computeSendPlan,
  listOkLists,
  loadProjectReviewState,
  recordGuideDecision,
  resolveIncludePdf,
  reviewStatePath,
} = require("../lib/review_state");
const { buildOkList } = require("./build_ok_list");
const { makeSendCopies } = require("./make_send_copies");
const { renderReviewUiHtml, normalizeAccent } = require("../lib/review_ui_html");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4318;
const MAX_BODY_BYTES = 1024 * 1024;

function parseCliArgs(argv = process.argv.slice(2)) {
  let port = null;
  let noOpen = false;
  let set = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-open") {
      noOpen = true;
    } else if (a.startsWith("--port=")) {
      port = parsePortValue(a.slice(7));
    } else if (a === "--port") {
      if (i + 1 >= argv.length) throw new Error("STOP: --port requires a port number (or 0 for a free port).");
      port = parsePortValue(argv[++i]);
    } else if (a.startsWith("--set=")) {
      set = a.slice(6) || null;
    } else if (a === "--set") {
      if (i + 1 >= argv.length) throw new Error("STOP: --set requires a set id.");
      set = argv[++i] || null;
    }
  }

  return { port, noOpen, set };
}

function parsePortValue(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!/^[0-9]+$/.test(s)) {
    throw new Error("STOP: invalid --port value: " + JSON.stringify(raw));
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error("STOP: --port must be between 0 and 65535.");
  }
  return n;
}

function openBrowserCommand(url, platform = process.platform) {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url], options: { detached: true, stdio: "ignore", windowsHide: true } };
  }
  if (platform === "darwin") {
    return { command: "open", args: [url], options: { detached: true, stdio: "ignore" } };
  }
  return { command: "xdg-open", args: [url], options: { detached: true, stdio: "ignore" } };
}

function openBrowser(url, opts = {}) {
  const spec = openBrowserCommand(url, opts.platform || process.platform);
  try {
    const child = spawn(spec.command, spec.args, spec.options);
    child.on("error", () => {});
    child.unref();
    return true;
  } catch (e) {
    return false;
  }
}

function sanitizePlainText(text) {
  if (!text) return "";
  return String(text).replace(/\bsee send_hold\.json\b/gi, "On send hold");
}

function sanitizeOnHold(onHold) {
  if (!onHold) return "";
  if (/^see send_hold\.json$/i.test(String(onHold).trim())) return "On send hold";
  return sanitizePlainText(onHold);
}

function extractCheckNotes(g) {
  const raw = String(g && g.check ? g.check : "");
  if (!raw) return "";
  const lines = raw.split(/\r?\n/).filter((line) => {
    if (g.onHold && line.startsWith("On hold for sending:")) return false;
    return Boolean(line.trim());
  });
  return sanitizePlainText(lines.join("\n"));
}

function isPathInside(rootDir, targetPath) {
  const rel = path.relative(rootDir, targetPath);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolveSafeRenderFile(P, rawRelUrlPath) {
  const renderRoot = path.resolve(P.reviewDir, "render");
  if (!rawRelUrlPath || typeof rawRelUrlPath !== "string") {
    return { ok: false, statusCode: 400, error: "Invalid render path." };
  }

  const rawParts = rawRelUrlPath.split("/");
  const decodedParts = [];
  for (const part of rawParts) {
    if (!part) return { ok: false, statusCode: 403, error: "Forbidden render path." };
    let decoded;
    try {
      decoded = decodeURIComponent(part);
    } catch (e) {
      return { ok: false, statusCode: 400, error: "Malformed render path." };
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("\0") ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      return { ok: false, statusCode: 403, error: "Forbidden render path." };
    }
    decodedParts.push(decoded);
  }

  const fileName = decodedParts[decodedParts.length - 1];
  if (!/[.]png$/i.test(fileName)) {
    return { ok: false, statusCode: 403, error: "Only rendered PNG images can be served." };
  }

  const candidate = path.resolve(renderRoot, ...decodedParts);
  if (!isPathInside(renderRoot, candidate)) {
    return { ok: false, statusCode: 403, error: "Forbidden render path." };
  }

  if (!fs.existsSync(renderRoot) || !fs.existsSync(candidate)) {
    return { ok: false, statusCode: 404, error: "Rendered page image not found." };
  }

  let realRoot;
  let realCandidate;
  try {
    realRoot = fs.realpathSync(renderRoot);
    realCandidate = fs.realpathSync(candidate);
  } catch (e) {
    return { ok: false, statusCode: 404, error: "Rendered page image not found." };
  }

  if (!isPathInside(realRoot, realCandidate)) {
    return { ok: false, statusCode: 403, error: "Forbidden render path." };
  }

  let st;
  try {
    st = fs.statSync(realCandidate);
  } catch (e) {
    return { ok: false, statusCode: 404, error: "Rendered page image not found." };
  }
  if (!st.isFile()) {
    return { ok: false, statusCode: 403, error: "Forbidden render path." };
  }

  return { ok: true, filePath: realCandidate, size: st.size };
}

function buildGuidePageUrls(P, g) {
  if (!g || !g.renderDir || !Array.isArray(g.pageFiles) || !g.pageFiles.length) return [];
  const renderRoot = path.resolve(P.reviewDir, "render");
  const rDir = path.resolve(g.renderDir);
  if (!isPathInside(renderRoot, rDir)) return [];

  const relDirParts = path.relative(renderRoot, rDir).split(path.sep).filter(Boolean);
  const urls = [];
  for (const fileName of g.pageFiles) {
    const encodedRel = [...relDirParts, fileName].map(encodeURIComponent).join("/");
    const check = resolveSafeRenderFile(P, encodedRel);
    if (check.ok) {
      urls.push("/api/render/" + encodedRel);
    }
  }
  return urls;
}

function serializeGuide(P, g) {
  const pageUrls = buildGuidePageUrls(P, g);
  return {
    code: g.code,
    setId: g.setId,
    set: g.set,
    title: g.title,
    status: g.status,
    lockStatus: g.lockStatus,
    lockReason: g.lockReason || "",
    locked: Boolean(g.locked),
    hash: g.hash || "",
    lockedAt: g.lockedAt || "",
    lockedFile: g.lockedFile || "",
    liveFile: g.word ? path.basename(g.word) : "",
    pages: pageUrls.length || (typeof g.pages === "number" ? g.pages : 0),
    pageUrls,
    pdfExists: Boolean(g.pdfExists),
    pdfStale: Boolean(g.pdfStale),
    how: sanitizePlainText(g.how || ""),
    checkNotes: extractCheckNotes(g),
    onHold: sanitizeOnHold(g.onHold),
    changed: Boolean(g.changed),
    earlierCall: sanitizePlainText(g.earlierCall || ""),
    call: g.call || "",
    comment: g.comment || "",
  };
}

function serializeState(P, state, setFilter) {
  return {
    project: state.project,
    accent: normalizeAccent(state.accent),
    setFilter: setFilter || null,
    includePdfDefault: Boolean(state.includePdfDefault),
    priorSheetName: state.priorSheetName || null,
    summary: state.summary,
    lastEvent: state.lastEvent || "",
    guides: (state.guides || []).map((g) => serializeGuide(P, g)),
  };
}

function formatStageMessage(sendDirName, res) {
  const count = res.copy.length;
  if (res.dry) {
    if (!count) return "No locked guides are marked OK to send yet.";
    return (
      count +
      " guide" +
      (count === 1 ? "" : "s") +
      " ready to stage into " +
      sendDirName +
      "/" +
      (res.includePdf ? " (Word + matching PDF)." : " (Word only).")
    );
  }
  if (!count) {
    return "No guides were staged because none are locked and marked OK to send.";
  }
  const wordPart =
    "Word: " +
    res.made +
    " staged" +
    (res.same ? ", " + res.same + " already up to date" : "");
  const pdfPart = res.includePdf
    ? "; PDF: " +
      res.pdfMade +
      " staged" +
      (res.pdfSame ? ", " + res.pdfSame + " already up to date" : "")
    : "";
  return (
    "Staged " +
    count +
    " approved guide" +
    (count === 1 ? "" : "s") +
    " in " +
    sendDirName +
    "/ (" +
    wordPart +
    pdfPart +
    "). These are local copies ready to share by hand."
  );
}

function serializeStageResponse(P, dry, includePdf, plan, stageRes) {
  const sendDirName = (P.cfg && P.cfg.review && P.cfg.review.sendDir) || "_send";
  const copy = (plan.copy || []).map((c) => ({
    code: c.code,
    folder: c.folder,
    name: c.name,
    pdfName: c.pdfName || null,
    files: Array.isArray(c.files) ? c.files : [c.folder + "/" + c.name],
    noteForLater: c.noteForLater || "",
  }));
  const skipped = (plan.skipped || []).map((s) => ({
    code: s.code,
    category: s.category || "skipped",
    reason: sanitizePlainText(s.reason || ""),
  }));
  const res = {
    ok: true,
    dry: Boolean(dry),
    includePdf: Boolean(includePdf),
    sendDirName,
    copy,
    skipped,
    refused: (plan.refused || []).map(sanitizePlainText),
    fix: (plan.fix || []).map(sanitizePlainText),
    held: (plan.held || []).map(sanitizePlainText),
    notPicked: plan.notPicked || 0,
    made: stageRes ? stageRes.made : 0,
    same: stageRes ? stageRes.same : 0,
    pdfMade: stageRes ? stageRes.pdfMade : 0,
    pdfSame: stageRes ? stageRes.pdfSame : 0,
    replaced: stageRes && stageRes.out && Array.isArray(stageRes.out.replaced)
      ? stageRes.out.replaced.map(sanitizePlainText)
      : [],
  };
  res.message = formatStageMessage(sendDirName, res);
  return res;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        failed = true;
        const err = new Error("Request body too large.");
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (failed) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          const err = new Error("Request body must be an object.");
          err.statusCode = 400;
          reject(err);
          return;
        }
        resolve(parsed);
      } catch (e) {
        const err = new Error("Request body could not be read.");
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on("error", (err) => {
      if (!failed) reject(err);
    });
  });
}

function createReviewServer(P, opts = {}) {
  const accent = normalizeAccent(P && P.cfg && P.cfg.palette ? P.cfg.palette.accent : "");
  const setFilter = opts.set || null;
  let writeQueue = Promise.resolve();
  const enqueueWrite = (fn) => {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.catch(() => {});
    return next;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || "/", "http://" + HOST);
      const pathname = parsed.pathname;

      if (pathname === "/favicon.ico") {
        res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
        res.end();
        return;
      }

      if (pathname === "/" || pathname === "/index.html") {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const html = renderReviewUiHtml({
          project: P.cfg.project,
          accent,
          set: setFilter,
        });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": Buffer.byteLength(html),
        });
        res.end(html);
        return;
      }

      if (pathname === "/api/state") {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const state = await loadProjectReviewState(P, { set: setFilter || undefined });
        sendJson(res, 200, serializeState(P, state, setFilter));
        return;
      }

      if (pathname === "/api/pick") {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const body = await readJsonBody(req);
        if (!body.code || typeof body.code !== "string") {
          sendJson(res, 400, { ok: false, error: "Missing guide code." });
          return;
        }
        const result = await enqueueWrite(() =>
          recordGuideDecision(
            P,
            body.code,
            { call: body.call === undefined ? "" : body.call },
            { set: setFilter || undefined, toggle: body.toggle !== false }
          )
        );
        if (!result.ok) {
          sendJson(res, result.statusCode || 400, { ok: false, error: sanitizePlainText(result.error) });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          guide: serializeGuide(P, result.guide),
          state: serializeState(P, result.state, setFilter),
        });
        return;
      }

      if (pathname === "/api/comment") {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const body = await readJsonBody(req);
        if (!body.code || typeof body.code !== "string") {
          sendJson(res, 400, { ok: false, error: "Missing guide code." });
          return;
        }
        const result = await enqueueWrite(() =>
          recordGuideDecision(
            P,
            body.code,
            { comment: body.comment === undefined ? "" : body.comment },
            { set: setFilter || undefined }
          )
        );
        if (!result.ok) {
          sendJson(res, result.statusCode || 400, { ok: false, error: sanitizePlainText(result.error) });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          guide: serializeGuide(P, result.guide),
          state: serializeState(P, result.state, setFilter),
        });
        return;
      }

      if (pathname === "/api/export-xlsx") {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        await readJsonBody(req);
        const exported = await enqueueWrite(() =>
          buildOkList(P, { set: setFilter || undefined })
        );
        sendJson(res, 200, {
          ok: true,
          file: exported.file,
          rows: exported.rows.length,
          summary: exported.summary,
          message: "Saved " + exported.file + " in the review folder.",
        });
        return;
      }

      if (pathname === "/api/stage-send") {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const body = await readJsonBody(req);
        const dry = Boolean(body.dry);
        const includePdf =
          typeof body.includePdf === "boolean" ? body.includePdf : resolveIncludePdf(P);

        const hasPriorSource =
          fs.existsSync(reviewStatePath(P)) || listOkLists(P).length > 0;

        if (!hasPriorSource) {
          const state = await loadProjectReviewState(P, { set: setFilter || undefined });
          const plan = computeSendPlan(state.guides, includePdf, {
            sendKeepNumber: Boolean(P.cfg.review && P.cfg.review.sendKeepNumber),
            requirePdf: true,
          });
          sendJson(res, 200, serializeStageResponse(P, dry, includePdf, plan, null));
          return;
        }

        const staged = await enqueueWrite(() =>
          makeSendCopies(P, {
            includePdf,
            dry,
            set: setFilter || undefined,
          })
        );
        sendJson(res, 200, serializeStageResponse(P, dry, includePdf, staged.plan, staged));
        return;
      }

      if (pathname.startsWith("/api/render/")) {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        const rel = pathname.slice("/api/render/".length);
        const resolved = resolveSafeRenderFile(P, rel);
        if (!resolved.ok) {
          sendJson(res, resolved.statusCode, { ok: false, error: resolved.error });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": resolved.size,
        });
        fs.createReadStream(resolved.filePath).pipe(res);
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found." });
    } catch (err) {
      const msg = err && err.message ? String(err.message) : "Local review server error.";
      const status = err && err.statusCode ? err.statusCode : msg.startsWith("STOP:") ? 409 : 500;
      sendJson(res, status, { ok: false, error: sanitizePlainText(msg.replace(/^STOP:\s*/, "")) });
    }
  });

  return server;
}

function listenOnHost(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

async function startReviewServer(P, opts = {}) {
  const requestedPort = opts.port !== null && opts.port !== undefined ? opts.port : DEFAULT_PORT;
  const server = createReviewServer(P, opts);

  let fellBack = false;
  let addr;
  try {
    addr = await listenOnHost(server, requestedPort);
  } catch (err) {
    if (err && err.code === "EADDRINUSE" && requestedPort !== 0 && opts.allowFallback !== false) {
      fellBack = true;
      addr = await listenOnHost(server, 0);
    } else {
      throw err;
    }
  }

  const port = addr.port;
  const url = "http://" + HOST + ":" + port;
  const close = () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { server, host: HOST, port, url, fellBack, close };
}

module.exports = {
  HOST,
  DEFAULT_PORT,
  parseCliArgs,
  openBrowserCommand,
  openBrowser,
  resolveSafeRenderFile,
  createReviewServer,
  startReviewServer,
};

if (require.main === module) {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message || String(e));
    process.exit(2);
  }
  const P = loadConfig();
  startReviewServer(P, { port: cli.port, set: cli.set })
    .then((srv) => {
      if (srv.fellBack) {
        console.log("Requested port was busy; switched to free local port " + srv.port + ".");
      }
      console.log("QRG Browser Review UI: " + srv.url);
      console.log("Project: " + P.cfg.project + (cli.set ? " (set: " + cli.set + ")" : ""));
      console.log("Press Ctrl+C to stop.");
      if (!cli.noOpen) {
        openBrowser(srv.url);
      }
      const shutdown = () => {
        srv.close().finally(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error("ERROR " + (err && err.stack ? err.stack : err));
      process.exit(1);
    });
}
