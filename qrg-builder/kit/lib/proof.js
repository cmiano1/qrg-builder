// lib/proof.js: offline English spelling and grammar proofing for built .docx QRGs using Automattic's harper.js
// (Rust/WASM, Apache-2.0) loaded from CommonJS via dynamic import(). Keeps the advisory { file, kind, text, sentence }
// report contract without Microsoft Word or internet access.
"use strict";

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SENTENCE_END = /[.!?]/;
const CLOSERS = new RegExp('["\'\\)\\]' + String.fromCharCode(0x201d, 0x2019) + "]");
const BOM_RE = new RegExp("^" + String.fromCharCode(0xfeff));
const CALLOUT_PREFIX = /^(?:TIP|NOTE|IMPORTANT)  /;

function unxml(s) {
  return String(s || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function extractParagraphs(docxInput) {
  const buf = Buffer.isBuffer(docxInput) || docxInput instanceof Uint8Array
    ? docxInput
    : fs.readFileSync(docxInput);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml not found");
  const xml = await docFile.async("string");

  const paras = [];
  for (const m of xml.matchAll(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g)) {
    const cleaned = m[0]
      .replace(/<w:del\b[\s\S]*?<\/w:del>/g, "")
      .replace(/<w:(?:tab|br|cr)\b[^>]*\/?>/g, "<w:t> </w:t>");
    const raw = unxml([...cleaned.matchAll(/<w:t(?:\s[^>]*)?(?<!\/)>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""));
    const text = raw.replace(CALLOUT_PREFIX, "").trim();
    if (text) paras.push(text);
  }
  return paras;
}

function expandDictionaryWords(entries) {
  const words = new Set();
  for (const raw of entries || []) {
    const entry = String(raw || "").replace(BOM_RE, "").trim();
    if (!entry || entry.startsWith("#")) continue;
    words.add(entry);
    for (const part of entry.split(/[\s/,:;()[\]{}-]+/)) {
      const clean = part.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
      if (clean && /\p{L}/u.test(clean)) words.add(clean);
    }
  }
  return [...words];
}

function extractSentence(text, start, end) {
  const str = String(text || "");
  const chars = Array.from(str);
  const len = chars.length;
  if (!len) return "";

  const safeStart = Math.max(0, Math.min(start || 0, len));
  const safeEnd = Math.max(safeStart, Math.min(end || safeStart, len));

  let s = 0;
  for (let i = safeStart - 1; i >= 0; i--) {
    if (chars[i] === "\n") {
      s = i + 1;
      break;
    }
    if (SENTENCE_END.test(chars[i])) {
      let after = i + 1;
      while (after < safeStart && CLOSERS.test(chars[after])) after++;
      if (after < safeStart && /\s/.test(chars[after])) {
        s = after + 1;
        break;
      }
    }
  }

  let e = len;
  const scanFrom = safeEnd > safeStart ? safeEnd - 1 : safeEnd;
  for (let i = scanFrom; i < len; i++) {
    if (chars[i] === "\n") {
      e = i;
      break;
    }
    if (SENTENCE_END.test(chars[i])) {
      let after = i + 1;
      while (after < len && CLOSERS.test(chars[after])) after++;
      if (after === len || /\s/.test(chars[after])) {
        e = after;
        break;
      }
    }
  }

  const out = chars.slice(s, e).join("").trim();
  return out || str.trim();
}

function mapLintKind(lintKind) {
  return lintKind === "Spelling" || lintKind === "Typo" ? "spelling" : "grammar";
}

async function loadHarper() {
  const harper = await import("harper.js");
  // Load binaryInlined (data: URL) instead of harper.js/binary: upstream harper.js@3.2.0
  // calls fs.readFile(new URL(binary).pathname) without fileURLToPath(), which fails with
  // ENOENT on paths containing spaces (%20) and on Windows drive-letter paths (/C:/...).
  const { binaryInlined: binary } = await import("harper.js/binaryInlined");
  if (!harper || !harper.LocalLinter || !harper.Dialect || !binary) {
    throw new Error("harper.js did not expose LocalLinter, Dialect, and binaryInlined");
  }
  return { harper, binary };
}

async function proofDocxFiles(filePaths, opts = {}) {
  const { harper, binary } = await loadHarper();
  const dialect = opts.dialect != null ? opts.dialect : harper.Dialect.American;
  const linter = new harper.LocalLinter({ binary, dialect });
  const rows = [];

  try {
    await linter.setup();
    const words = expandDictionaryWords(opts.dictionary || []);
    if (words.length) await linter.importWords(words);

    for (const rawPath of filePaths) {
      const p = path.resolve(rawPath);
      const file = path.basename(p);
      let paras;
      try {
        paras = await extractParagraphs(p);
      } catch (err) {
        rows.push({ file, kind: "error", text: String(err && err.message ? err.message : err), sentence: "" });
        continue;
      }

      for (const para of paras) {
        const lints = await linter.lint(para, { language: "plaintext" });
        for (const lint of lints) {
          let span = null;
          try {
            span = lint.span();
            const kind = mapLintKind(lint.lint_kind());
            const text = lint.get_problem_text();
            const sentence = extractSentence(para, span.start, span.end);
            rows.push({ file, kind, text, sentence });
          } finally {
            if (span && typeof span.free === "function") span.free();
            if (lint && typeof lint.free === "function") lint.free();
          }
        }
      }
    }
  } finally {
    await linter.dispose();
  }

  return rows;
}

module.exports = {
  extractParagraphs,
  expandDictionaryWords,
  extractSentence,
  mapLintKind,
  loadHarper,
  proofDocxFiles,
};
