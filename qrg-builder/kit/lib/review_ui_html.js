// lib/review_ui_html.js: renders the Local Browser Review UI HTML document (ADR-0002).
// Pure template module with zero external dependencies, zero developer/JSON jargon, and zero em/en dashes.
"use strict";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function normalizeAccent(raw) {
  const cleaned = String(raw || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(cleaned) ? "#" + cleaned.toUpperCase() : "#C00000";
}

function darkenHex(hex, factor = 0.82) {
  const clean = normalizeAccent(hex).slice(1);
  const r = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(0, 2), 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(2, 4), 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(clean.slice(4, 6), 16) * factor)));
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function accentTextColor(hex) {
  const clean = normalizeAccent(hex).slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? "#1B2230" : "#FFFFFF";
}

function renderReviewUiHtml(opts = {}) {
  const project = String(opts.project || "Project");
  const accent = normalizeAccent(opts.accent);
  const accentDark = darkenHex(accent, 0.82);
  const accentFg = accentTextColor(accent);
  const setFilter = opts.set ? String(opts.set) : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(project)} - QRG OK List Review</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231f3864'/%3E%3Cpath d='M9 17l5 5 9-11' fill='none' stroke='%23ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
<style>
  :root {
    --bg: #f4f5f7;
    --surface: #ffffff;
    --surface-2: #f9fafb;
    --border: #d9dde5;
    --border-strong: #bfc6d4;
    --navy: #1f3864;
    --navy-hover: #2c4a82;
    --accent: ${accent};
    --accent-dark: ${accentDark};
    --accent-fg: ${accentFg};
    --text: #1b2230;
    --muted: #5b6475;
    --ok-bg: #e6f4ea;
    --ok-fg: #136535;
    --ok-bd: #9fd3b0;
    --note-bg: #e8f1fb;
    --note-fg: #164d8c;
    --note-bd: #9ec0ea;
    --fix-bg: #fff1e0;
    --fix-fg: #9a4706;
    --fix-bd: #f0b87a;
    --bad-bg: #fde8e8;
    --bad-fg: #9b1c1c;
    --bad-bd: #f3a6a6;
    --wait-bg: #eef2ff;
    --wait-fg: #3730a3;
    --wait-bd: #c7d2fe;
    --changed-bg: #fff3cd;
    --changed-fg: #7c5200;
    --changed-bd: #f0d06b;
    --hold-bg: #f1f3f6;
    --hold-fg: #4b5563;
    --shadow: 0 1px 3px rgba(16, 24, 40, .08), 0 1px 2px rgba(16, 24, 40, .04);
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    color: var(--text);
    background: var(--bg);
  }
  body {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    height: 100dvh;
    overflow: hidden;
  }
  @media (max-width: 960px) {
    body { height: auto; overflow: visible; }
  }

  .app-header {
    background: var(--navy);
    color: #fff;
    padding: 12px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 3px solid var(--accent);
    flex-shrink: 0;
  }
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 240px;
  }
  .eyebrow-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: #dbe4f5;
  }
  .set-badge {
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, .16);
    color: #ffffff;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .app-header h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
  }
  .app-header p {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: #dbe4f5;
    line-height: 1.35;
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .save-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, .14);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, .24);
  }
  .save-pill.saved {
    background: #14532d;
    border-color: #4ade80;
    color: #ecfdf5;
  }
  .save-pill.saving {
    background: #1e3a8a;
    border-color: #93c5fd;
    color: #eff6ff;
  }
  .save-pill.error {
    background: #7f1d1d;
    border-color: #fca5a5;
    color: #fef2f2;
  }

  .btn {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    padding: 7px 12px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1.2;
  }
  .btn:hover:not(:disabled) { background: #eef1f6; }
  .btn:focus-visible, .chip:focus-visible, .guide-card:focus-visible, .pick-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-dark);
    border-color: var(--accent-dark);
  }
  .btn-navy {
    background: #2c4a82;
    color: #ffffff;
    border-color: #4c6ca8;
  }
  .btn-navy:hover:not(:disabled) { background: #365999; }
  .btn-ghost {
    background: rgba(255, 255, 255, .12);
    color: #ffffff;
    border-color: rgba(255, 255, 255, .28);
  }
  .btn-ghost:hover:not(:disabled) { background: rgba(255, 255, 255, .22); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: .48; cursor: not-allowed; }

  .notice-bar {
    display: none;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 600;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .notice-bar.visible { display: flex; }
  .notice-bar.ok { background: var(--ok-bg); color: var(--ok-fg); border-bottom-color: var(--ok-bd); }
  .notice-bar.error { background: var(--bad-bg); color: var(--bad-fg); border-bottom-color: var(--bad-bd); }
  .notice-dismiss {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .summary-strip {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 10px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; }
  .kpi {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 12px;
    background: var(--surface-2);
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .kpi .num { font-size: 18px; font-weight: 800; color: var(--navy); }
  .kpi .lbl { font-size: 12px; color: var(--muted); font-weight: 600; }
  .kpi.ok { background: var(--ok-bg); border-color: var(--ok-bd); }
  .kpi.ok .num { color: var(--ok-fg); }
  .kpi.fix { background: var(--fix-bg); border-color: var(--fix-bd); }
  .kpi.fix .num { color: var(--fix-fg); }

  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .chip:hover { border-color: var(--navy); color: var(--navy); }
  .chip.active { background: var(--navy); color: #ffffff; border-color: var(--navy); }

  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: 370px minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }
  @media (max-width: 960px) {
    .workspace {
      grid-template-columns: 1fr;
      overflow: visible;
    }
  }

  .guide-list {
    background: var(--surface);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (max-width: 960px) {
    .guide-list {
      border-right: none;
      border-bottom: 1px solid var(--border);
      max-height: 300px;
    }
  }
  .guide-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 11px 12px;
    background: var(--surface);
    cursor: pointer;
    text-align: left;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .guide-card:hover { border-color: var(--navy); background: #fafbfe; }
  .guide-card.selected {
    border: 2px solid var(--navy);
    background: #f2f5fb;
    padding: 10px 11px;
  }
  .guide-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .guide-code {
    font-size: 12px;
    font-weight: 800;
    color: var(--navy);
    letter-spacing: .02em;
  }
  .guide-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
  }
  .guide-meta {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .pill-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-bd); }
  .pill-note { background: var(--note-bg); color: var(--note-fg); border-color: var(--note-bd); }
  .pill-fix { background: var(--fix-bg); color: var(--fix-fg); border-color: var(--fix-bd); }
  .pill-wait { background: var(--wait-bg); color: var(--wait-fg); border-color: var(--wait-bd); }
  .pill-bad { background: var(--bad-bg); color: var(--bad-fg); border-color: var(--bad-bd); }
  .pill-hold { background: var(--hold-bg); color: var(--hold-fg); border-color: var(--border); }
  .pill-changed { background: var(--changed-bg); color: var(--changed-fg); border-color: var(--changed-bd); }

  .detail-pane {
    overflow-y: auto;
    padding: 18px 22px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    box-shadow: var(--shadow);
  }
  .detail-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .detail-header h2 {
    margin: 3px 0 4px;
    font-size: 20px;
    color: var(--text);
    line-height: 1.25;
  }
  .sub-meta {
    font-size: 12.5px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .hash {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    background: #f1f3f6;
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text);
  }
  .detail-status-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .inline-save-note {
    font-size: 12px;
    font-weight: 700;
    color: var(--ok-fg);
    min-height: 16px;
  }
  .inline-save-note.saving { color: var(--note-fg); }
  .inline-save-note.error { color: var(--bad-fg); }

  .alert-box {
    border-radius: 8px;
    padding: 10px 13px;
    font-size: 13px;
    line-height: 1.45;
    margin-top: 12px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
  }
  .alert-check { background: #eef5ff; border-color: #b7d2f7; color: #163d6e; }
  .alert-warn { background: var(--bad-bg); border-color: var(--bad-bd); color: var(--bad-fg); }
  .alert-changed { background: #fff9e6; border-color: #ead180; color: #5c4300; }
  .alert-ok { background: var(--ok-bg); border-color: var(--ok-bd); color: var(--ok-fg); }

  .decision-section { margin-top: 14px; }
  .field-label {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--muted);
    display: block;
    margin-bottom: 6px;
  }
  .decision-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pick-btn {
    border: 1.5px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    padding: 9px 14px;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .pick-btn:hover:not(:disabled) { background: #f4f6fa; }
  .pick-btn.selected-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-fg); }
  .pick-btn.selected-note { background: var(--note-bg); color: var(--note-fg); border-color: var(--note-fg); }
  .pick-btn.selected-fix { background: var(--fix-bg); color: var(--fix-fg); border-color: var(--fix-fg); }
  .pick-btn:disabled { opacity: .45; cursor: not-allowed; }

  .comment-wrap { margin-top: 12px; }
  textarea {
    width: 100%;
    min-height: 70px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 9px 11px;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--text);
    background: var(--surface);
    resize: vertical;
  }
  textarea:disabled { background: var(--surface-2); color: var(--muted); cursor: not-allowed; }
  textarea:focus { outline: 2px solid var(--navy-hover); outline-offset: 1px; }

  .preview-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .preview-title-group {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }
  .preview-sub { font-size: 12.5px; color: var(--muted); }
  .preview-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .word-pill {
    display: inline-block;
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }
  .preview-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    background: #e9ecf2;
    padding: 18px;
    border-radius: 8px;
  }
  .page-sheet {
    background: #ffffff;
    border: 1px solid #cfd5e0;
    box-shadow: 0 3px 10px rgba(16, 24, 40, .12);
    width: 100%;
    max-width: 760px;
    overflow: hidden;
  }
  .page-sheet.compact { max-width: 540px; }
  .page-label {
    background: #f5f7fa;
    border-bottom: 1px solid #e2e6ef;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .page-sheet img {
    display: block;
    width: 100%;
    height: auto;
    background: #ffffff;
  }

  dialog {
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 0;
    max-width: 680px;
    width: calc(100% - 32px);
    box-shadow: 0 20px 48px rgba(16, 24, 40, .28);
    color: var(--text);
  }
  dialog::backdrop { background: rgba(15, 23, 42, .5); }
  .modal-head {
    background: var(--navy);
    color: #ffffff;
    padding: 14px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    border-bottom: 3px solid var(--accent);
  }
  .modal-head h3 { margin: 0; font-size: 16px; }
  .modal-body {
    padding: 18px;
    font-size: 13.5px;
    line-height: 1.5;
    max-height: 70dvh;
    overflow-y: auto;
  }
  .modal-foot {
    padding: 12px 18px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: var(--surface-2);
  }
  .modal-section-title {
    margin: 12px 0 6px;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--navy);
  }
  .send-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    margin-bottom: 7px;
    background: #ffffff;
    gap: 10px;
  }
  .send-row.refused { background: var(--bad-bg); border-color: var(--bad-bd); }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    word-break: break-word;
  }
  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    background: #f2f5fb;
    border: 1px solid #c9d6ef;
    border-radius: 8px;
    margin-bottom: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .checkbox-row input { width: 16px; height: 16px; accent-color: var(--navy); cursor: pointer; }
  .muted-copy { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
  .note-later { font-size: 12px; color: var(--note-fg); margin-top: 3px; }
  .empty-state {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 22px;
    text-align: center;
    color: var(--muted);
  }
</style>
</head>
<body>

<header class="app-header">
  <div class="header-left">
    <div class="eyebrow-row">
      <span class="eyebrow">QRG OK List</span>
      ${setFilter ? `<span class="set-badge">Set: ${escHtml(setFilter)}</span>` : ""}
    </div>
    <h1 id="projectHeading">${escHtml(project)}</h1>
    <p>Inspect locked US Letter QRGs side by side. Picks and comments save automatically.</p>
  </div>
  <div class="header-actions">
    <span class="save-pill" id="savePill" role="status" aria-live="polite">Saved</span>
    <button class="btn btn-ghost" id="btnRefresh" type="button" title="Reload guides and locks from disk">Refresh</button>
    <button class="btn btn-navy" id="btnExportXlsx" type="button">Export .xlsx OK List</button>
    <button class="btn btn-primary" id="btnOpenSend" type="button">Stage Send Copies (_send/)</button>
  </div>
</header>

<div class="notice-bar" id="noticeBar" role="status" aria-live="polite">
  <span id="noticeText"></span>
  <button class="notice-dismiss" id="btnDismissNotice" type="button" aria-label="Dismiss notice">Dismiss</button>
</div>

<section class="summary-strip" aria-label="Review progress summary">
  <div class="kpis" id="kpiStrip"></div>
  <div class="filters" id="filterStrip" role="group" aria-label="Filter guides"></div>
</section>

<main class="workspace">
  <aside class="guide-list" id="guideList" aria-label="QRG guide list"></aside>
  <section class="detail-pane" id="detailPane" aria-label="Selected QRG review panel"></section>
</main>

<dialog id="sendDialog" aria-labelledby="sendDialogTitle">
  <div class="modal-head">
    <h3 id="sendDialogTitle">Stage Send Copies (_send/)</h3>
    <button class="btn btn-ghost btn-sm" id="btnCloseDialogTop" type="button">Close</button>
  </div>
  <div class="modal-body" id="sendDialogBody">
    <p class="muted-copy">Checking approved guides...</p>
  </div>
  <div class="modal-foot">
    <button class="btn btn-sm" id="btnCloseDialogBottom" type="button">Close</button>
    <button class="btn btn-primary btn-sm" id="btnConfirmStage" type="button">Stage Send Copies</button>
  </div>
</dialog>

<script>
"use strict";

const app = {
  state: null,
  filter: "all",
  selectedCode: null,
  compactZoom: false,
  includePdf: false,
  sendPlan: null,
  stageResult: null,
  stagingBusy: false,
  commentTimer: null,
  pendingComment: null,
  saveState: "saved",
  saveText: "Saved",
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function escLines(s) {
  return esc(s).replace(/\\r?\\n/g, "<br />");
}

async function apiRequest(url, opts) {
  const res = await fetch(url, opts);
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (e) {
    data = { ok: false, error: "Unexpected response from local review server." };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || "Request failed.");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function setSaveStatus(kind, text) {
  app.saveState = kind;
  app.saveText = text;
  const pill = document.getElementById("savePill");
  if (pill) {
    pill.className = "save-pill " + kind;
    pill.textContent = text;
  }
  const inline = document.getElementById("inlineSaveNote");
  if (inline) {
    inline.className = "inline-save-note " + (kind === "saved" ? "" : kind);
    inline.textContent = kind === "saved" ? text : text;
  }
}

function showNotice(kind, text) {
  const bar = document.getElementById("noticeBar");
  const span = document.getElementById("noticeText");
  if (!bar || !span) return;
  bar.className = "notice-bar visible " + kind;
  span.textContent = text;
}

function hideNotice() {
  const bar = document.getElementById("noticeBar");
  if (bar) bar.className = "notice-bar";
}

function statusBadge(g) {
  if (g.lockStatus === "broken") return '<span class="pill pill-bad">Lock broken</span>';
  if (g.lockStatus !== "locked") return '<span class="pill pill-hold">Not locked</span>';
  if (g.call === "OK to send") return '<span class="pill pill-ok">OK to send</span>';
  if (g.call === "OK to send, note for later") return '<span class="pill pill-note">OK, note for later</span>';
  if (g.call === "Fix before sending") return '<span class="pill pill-fix">Fix before sending</span>';
  return '<span class="pill pill-wait">Waiting for OK</span>';
}

function filteredGuides() {
  const guides = (app.state && app.state.guides) || [];
  return guides.filter((g) => {
    if (app.filter === "pending") return g.lockStatus === "locked" && !g.call;
    if (app.filter === "ok") return typeof g.call === "string" && g.call.startsWith("OK to send");
    if (app.filter === "fix") return g.call === "Fix before sending";
    if (app.filter === "attention") return g.lockStatus !== "locked" || g.changed;
    return true;
  });
}

async function flushPendingComment() {
  if (app.commentTimer) {
    clearTimeout(app.commentTimer);
    app.commentTimer = null;
  }
  if (!app.pendingComment) return;
  const { code, comment } = app.pendingComment;
  app.pendingComment = null;
  setSaveStatus("saving", "Saving...");
  try {
    const data = await apiRequest("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, comment }),
    });
    if (data && data.state) {
      // Update state cleanly without clobbering newer typing in the active textarea
      const activeEl = document.activeElement;
      const editingSame = activeEl && activeEl.id === "commentBox" && app.selectedCode === code;
      const liveText = editingSame ? activeEl.value : null;
      app.state = data.state;
      if (editingSame) {
        const curGuide = app.state.guides.find((x) => x.code === code);
        if (curGuide) curGuide.comment = liveText;
        renderSummaryAndList();
      } else {
        renderAll();
      }
    }
    setSaveStatus("saved", "Saved");
  } catch (err) {
    setSaveStatus("error", "Save failed");
    showNotice("error", err.message || "Could not save comment.");
  }
}

function scheduleCommentSave(code, comment) {
  app.pendingComment = { code, comment };
  setSaveStatus("saving", "Saving...");
  if (app.commentTimer) clearTimeout(app.commentTimer);
  app.commentTimer = setTimeout(() => {
    flushPendingComment();
  }, 350);
}

async function selectPick(code, call) {
  await flushPendingComment();
  setSaveStatus("saving", "Saving...");
  try {
    const data = await apiRequest("/api/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, call }),
    });
    app.state = data.state;
    renderAll();
    setSaveStatus("saved", "Saved");
  } catch (err) {
    setSaveStatus("error", "Save failed");
    showNotice("error", err.message || "Could not save your decision.");
    await loadState(false);
  }
}

function renderSummaryAndList() {
  if (!app.state) return;
  const guides = app.state.guides || [];
  const sum = app.state.summary || { total: 0, locked: 0, ok: 0, fix: 0, remaining: 0 };
  const attentionCount = guides.filter((g) => g.lockStatus !== "locked" || g.changed).length;

  document.getElementById("kpiStrip").innerHTML = \`
    <div class="kpi"><span class="num">\${sum.total}</span><span class="lbl">Total QRGs</span></div>
    <div class="kpi"><span class="num">\${sum.locked}</span><span class="lbl">Locked</span></div>
    <div class="kpi ok"><span class="num">\${sum.ok}</span><span class="lbl">OK to send</span></div>
    <div class="kpi fix"><span class="num">\${sum.fix}</span><span class="lbl">Fix before sending</span></div>
    <div class="kpi"><span class="num">\${sum.remaining}</span><span class="lbl">Left to pick</span></div>
  \`;

  const filters = [
    ["all", "All (" + guides.length + ")"],
    ["pending", "Waiting for OK (" + sum.remaining + ")"],
    ["ok", "OK to send (" + sum.ok + ")"],
    ["fix", "Needs fix (" + sum.fix + ")"],
    ["attention", "Changed / Unlocked (" + attentionCount + ")"],
  ];
  document.getElementById("filterStrip").innerHTML = filters.map(([k, lbl]) =>
    \`<button class="chip \${app.filter === k ? "active" : ""}" data-filter="\${k}" type="button" aria-pressed="\${app.filter === k ? "true" : "false"}">\${esc(lbl)}</button>\`
  ).join("");

  const list = filteredGuides();
  if (list.length && !list.some((g) => g.code === app.selectedCode)) {
    app.selectedCode = list[0].code;
  }

  const listEl = document.getElementById("guideList");
  listEl.innerHTML = list.length ? list.map((g) => \`
    <button class="guide-card \${g.code === app.selectedCode ? "selected" : ""}" data-code="\${esc(g.code)}" type="button" aria-pressed="\${g.code === app.selectedCode ? "true" : "false"}">
      <div class="guide-top">
        <span class="guide-code">\${esc(g.code)}</span>
        \${statusBadge(g)}
      </div>
      <div class="guide-title">\${esc(g.title || g.code)}</div>
      <div class="guide-meta">
        <span>\${esc(g.set)}</span>
        \${g.pages ? \`<span>\${g.pages} pg (US Letter)</span>\` : ""}
        \${g.onHold ? '<span class="pill pill-hold">On send hold</span>' : ""}
        \${g.changed ? '<span class="pill pill-changed">Changed since last sheet</span>' : ""}
      </div>
    </button>
  \`).join("") : '<div class="alert-box">No guides match this filter.</div>';

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.onclick = async () => {
      await flushPendingComment();
      app.filter = btn.dataset.filter;
      renderAll();
    };
  });
  document.querySelectorAll("[data-code]").forEach((btn) => {
    btn.onclick = async () => {
      if (btn.dataset.code === app.selectedCode) return;
      await flushPendingComment();
      app.selectedCode = btn.dataset.code;
      renderAll();
    };
  });
}

function renderDetailPane() {
  const pane = document.getElementById("detailPane");
  if (!app.state || !app.state.guides.length) {
    pane.innerHTML = '<div class="empty-state"><strong>No live QRGs found yet.</strong><p>Build, render, and lock a guide in this project, then click Refresh.</p></div>';
    return;
  }

  const list = filteredGuides();
  const g = list.find((x) => x.code === app.selectedCode) || app.state.guides.find((x) => x.code === app.selectedCode) || list[0];
  if (!g) {
    pane.innerHTML = '<div class="empty-state"><strong>No guides match the selected filter.</strong><p>Pick another filter chip above to view your QRGs.</p></div>';
    return;
  }

  const locked = g.lockStatus === "locked";
  const pageUrls = Array.isArray(g.pageUrls) ? g.pageUrls : [];
  const pageCount = pageUrls.length || g.pages || 0;
  const wordLabel = g.lockedFile || g.liveFile || "not built";
  const brokenDetail = String(g.status || "").replace(/^Lock broken:\s*/i, "").trim();
  const previewSubText = pageUrls.length
    ? pageCount + " page" + (pageCount === 1 ? "" : "s") + " - Standard US Letter (8.5 x 11 in)"
    : (g.lockStatus === "broken" && g.pdfStale)
      ? "Preview hidden (file changed after render)"
      : "No rendered pages yet";

  let previewHtml = "";
  if (pageUrls.length) {
    previewHtml = pageUrls.map((src, i) => \`
      <div class="page-sheet \${app.compactZoom ? "compact" : ""}">
        <div class="page-label">
          <span>Page \${i + 1} of \${pageUrls.length}</span>
          <span>Standard US Letter (8.5 x 11 in)</span>
        </div>
        <img src="\${esc(src)}" alt="Page \${i + 1} of \${esc(g.title || g.code)}" />
      </div>
    \`).join("");
  } else if (g.lockStatus === "broken" && g.pdfStale) {
    previewHtml = '<div class="alert-box alert-warn" style="margin-top:0;">Page preview is hidden because the Word file changed after it was rendered and locked. Re-render and relock this guide to inspect the updated pages.</div>';
  } else {
    previewHtml = '<div class="alert-box" style="margin-top:0;">No rendered US Letter pages exist yet for this guide. Run the render step to preview pages here.</div>';
  }

  pane.innerHTML = \`
    <div class="card">
      <div class="detail-header">
        <div>
          <div class="sub-meta">
            <strong>\${esc(g.code)}</strong>
            <span>\${esc(g.set)}</span>
            \${g.hash ? \`<span>Review Lock <span class="hash">\${esc(g.hash)}</span></span>\` : ""}
            \${g.lockedAt ? \`<span>Locked \${esc(g.lockedAt)}</span>\` : ""}
          </div>
          <h2>\${esc(g.title || g.code)}</h2>
          \${g.how ? \`<div class="sub-meta"><span>\${esc(g.how)}</span></div>\` : ""}
        </div>
        <div class="detail-status-col">
          \${statusBadge(g)}
          <span class="inline-save-note" id="inlineSaveNote">\${esc(app.saveText)}</span>
        </div>
      </div>

      \${g.lockStatus === "broken" ? \`
        <div class="alert-box alert-warn" role="alert">
          <strong>Lock broken: approval disabled.</strong> \${esc(brokenDetail ? brokenDetail.charAt(0).toUpperCase() + brokenDetail.slice(1) + "." : "The Word file no longer matches its lock.")} Fold any edits back into the Guide Source, rebuild, re-render, and relock this guide before approving it.
        </div>
      \` : ""}

      \${g.lockStatus === "unlocked" ? \`
        <div class="alert-box">
          <strong>Not locked yet: approval disabled.</strong> This guide is still being built or checked. Approval unlocks automatically after QA, proofing, visual inspection, and locking.
        </div>
      \` : ""}

      \${g.onHold ? \`
        <div class="alert-box">
          <strong>On send hold:</strong> \${esc(g.onHold)}. You can still record your review call; this guide will stay out of Send Copies until the hold is removed.
        </div>
      \` : ""}

      \${(g.changed || g.earlierCall) ? \`
        <div class="alert-box alert-changed">
          <strong>Changed since last sheet:</strong> \${g.earlierCall ? escLines(g.earlierCall) : "This guide was rebuilt and relocked since the earlier review. Please inspect the updated pages and record a fresh call."}
        </div>
      \` : ""}

      \${g.checkNotes ? \`
        <div class="alert-box alert-check">
          <strong>Check these spots:</strong> \${escLines(g.checkNotes)}
        </div>
      \` : ""}

      <div class="decision-section">
        <span class="field-label">Your call (click once to select, click again to clear):</span>
        <div class="decision-row">
          <button class="pick-btn \${g.call === "OK to send" ? "selected-ok" : ""}" data-pick="OK to send" \${locked ? "" : "disabled"} type="button" aria-pressed="\${g.call === "OK to send" ? "true" : "false"}">OK to send</button>
          <button class="pick-btn \${g.call === "OK to send, note for later" ? "selected-note" : ""}" data-pick="OK to send, note for later" \${locked ? "" : "disabled"} type="button" aria-pressed="\${g.call === "OK to send, note for later" ? "true" : "false"}">OK to send, note for later</button>
          <button class="pick-btn \${g.call === "Fix before sending" ? "selected-fix" : ""}" data-pick="Fix before sending" \${locked ? "" : "disabled"} type="button" aria-pressed="\${g.call === "Fix before sending" ? "true" : "false"}">Fix before sending</button>
        </div>
      </div>

      <div class="comment-wrap">
        <label class="field-label" for="commentBox">Your comment (saved automatically for fix rounds or follow-up notes)</label>
        <textarea id="commentBox" \${locked ? "" : "disabled"} placeholder="Example: In step 4, update the button name to match the live screen.">\${esc(g.comment || "")}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="preview-toolbar">
        <div class="preview-title-group">
          <strong>Visual Page Preview</strong>
          <span class="preview-sub">\${esc(previewSubText)}</span>
        </div>
        <div class="preview-controls">
          \${pageUrls.length ? \`<button class="btn btn-sm" id="btnZoom" type="button">\${app.compactZoom ? "Fit Wide" : "Compact View"}</button>\` : ""}
          <span class="pill pill-hold word-pill" title="\${esc(wordLabel)}">Word: \${esc(wordLabel)}</span>
        </div>
      </div>

      <div class="preview-pages">
        \${previewHtml}
      </div>
    </div>
  \`;

  document.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.onclick = () => selectPick(g.code, btn.dataset.pick);
  });

  const ta = document.getElementById("commentBox");
  if (ta) {
    ta.oninput = () => {
      g.comment = ta.value;
      scheduleCommentSave(g.code, ta.value);
    };
    ta.onblur = () => {
      flushPendingComment();
    };
  }

  const zoom = document.getElementById("btnZoom");
  if (zoom) {
    zoom.onclick = () => {
      app.compactZoom = !app.compactZoom;
      renderDetailPane();
    };
  }
}

function renderAll() {
  renderSummaryAndList();
  renderDetailPane();
}

async function loadState(preserveNotice = true) {
  if (!preserveNotice) hideNotice();
  try {
    const data = await apiRequest("/api/state");
    app.state = data;
    if (app.selectedCode == null && data.guides.length) {
      app.selectedCode = data.guides[0].code;
    }
    if (typeof data.includePdfDefault === "boolean" && app.sendPlan === null) {
      app.includePdf = data.includePdfDefault;
    }
    const h1 = document.getElementById("projectHeading");
    if (h1 && data.project) h1.textContent = data.project;
    renderAll();
    setSaveStatus("saved", "Saved");
  } catch (err) {
    setSaveStatus("error", "Could not load");
    showNotice("error", err.message || "Could not load project review state.");
  }
}

async function exportXlsx() {
  await flushPendingComment();
  const btn = document.getElementById("btnExportXlsx");
  btn.disabled = true;
  btn.textContent = "Exporting...";
  try {
    const res = await apiRequest("/api/export-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    showNotice("ok", res.message || ("Saved " + res.file + " in the review folder."));
  } catch (err) {
    showNotice("error", err.message || "Could not export .xlsx OK List.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Export .xlsx OK List";
  }
}

function renderSendModal() {
  const body = document.getElementById("sendDialogBody");
  const confirmBtn = document.getElementById("btnConfirmStage");
  const plan = app.sendPlan;

  if (!plan) {
    body.innerHTML = '<p class="muted-copy">Checking approved guides...</p>';
    confirmBtn.disabled = true;
    return;
  }

  const copyList = plan.copy || [];
  const skippedList = plan.skipped || [];
  confirmBtn.disabled = app.stagingBusy || copyList.length === 0;
  confirmBtn.textContent = app.stagingBusy ? "Staging..." : "Stage Send Copies";

  body.innerHTML = \`
    <label class="checkbox-row">
      <input type="checkbox" id="chkIncludePdf" \${app.includePdf ? "checked" : ""} \${app.stagingBusy ? "disabled" : ""} />
      <span>Also include matching PDF copies alongside the Word (.docx) Send Copies?</span>
    </label>

    \${app.stageResult ? \`
      <div class="alert-box \${app.stageResult.ok ? "alert-ok" : "alert-warn"}" style="margin-top:0;margin-bottom:12px;">
        <strong>\${app.stageResult.ok ? "Send Copies staged locally:" : "Could not stage Send Copies:"}</strong>
        \${esc(app.stageResult.message)}
        \${(app.stageResult.replaced && app.stageResult.replaced.length) ? \`
          <div style="margin-top:6px;">Moved earlier versions to _replaced/:<br />\${app.stageResult.replaced.map((r) => esc(r)).join("<br />")}</div>
        \` : ""}
      </div>
    \` : ""}

    <p class="muted-copy">Only guides marked <strong>OK to send</strong> whose Word file still matches its Review Lock are staged into <code>\${esc(plan.sendDirName || "_send")}/</code>. These are local copies for you to share by hand.</p>

    <h4 class="modal-section-title">Ready to stage (\${copyList.length} guide\${copyList.length === 1 ? "" : "s"})</h4>
    \${copyList.length ? copyList.map((c) => \`
      <div class="send-row">
        <div>
          <strong>\${esc(c.code)}</strong>
          \${(c.files || []).map((f) => \`<div class="mono">\${esc(f)}</div>\`).join("")}
          \${c.noteForLater ? \`<div class="note-later">Note for later: \${esc(c.noteForLater)}</div>\` : ""}
        </div>
        <span class="pill pill-ok">Verified lock</span>
      </div>
    \`).join("") : '<div class="alert-box" style="margin-top:0;">No locked guides are marked OK to send yet.</div>'}

    <h4 class="modal-section-title">Not staged (\${skippedList.length})</h4>
    \${skippedList.length ? skippedList.map((s) => \`
      <div class="send-row \${(s.category === "broken" || s.category === "refused") ? "refused" : ""}">
        <div><strong>\${esc(s.code)}</strong>: \${esc(s.reason)}</div>
      </div>
    \`).join("") : '<p class="muted-copy">All guides are ready to stage.</p>'}
  \`;

  const chk = document.getElementById("chkIncludePdf");
  if (chk) {
    chk.onchange = async () => {
      app.includePdf = chk.checked;
      app.stageResult = null;
      await refreshSendPlan();
    };
  }
}

async function refreshSendPlan() {
  const body = document.getElementById("sendDialogBody");
  if (body && !app.sendPlan) {
    body.innerHTML = '<p class="muted-copy">Checking approved guides...</p>';
  }
  try {
    app.sendPlan = await apiRequest("/api/stage-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includePdf: app.includePdf, dry: true }),
    });
    renderSendModal();
  } catch (err) {
    app.sendPlan = { copy: [], skipped: [] };
    app.stageResult = { ok: false, message: err.message || "Could not preview Send Copies." };
    renderSendModal();
  }
}

async function confirmStageSend() {
  await flushPendingComment();
  app.stagingBusy = true;
  app.stageResult = null;
  renderSendModal();
  try {
    const res = await apiRequest("/api/stage-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includePdf: app.includePdf, dry: false }),
    });
    app.sendPlan = res;
    app.stageResult = {
      ok: true,
      message: res.message,
      replaced: res.replaced || [],
    };
    showNotice("ok", res.message);
  } catch (err) {
    app.stageResult = {
      ok: false,
      message: err.message || "Could not stage Send Copies.",
    };
  } finally {
    app.stagingBusy = false;
    renderSendModal();
  }
}

const sendDialog = document.getElementById("sendDialog");
document.getElementById("btnOpenSend").onclick = async () => {
  await flushPendingComment();
  app.stageResult = null;
  app.sendPlan = null;
  if (app.state && typeof app.state.includePdfDefault === "boolean" && !sendDialog.open) {
    app.includePdf = app.state.includePdfDefault;
  }
  sendDialog.showModal();
  await refreshSendPlan();
};
document.getElementById("btnCloseDialogTop").onclick = () => sendDialog.close();
document.getElementById("btnCloseDialogBottom").onclick = () => sendDialog.close();
document.getElementById("btnConfirmStage").onclick = () => confirmStageSend();
document.getElementById("btnExportXlsx").onclick = () => exportXlsx();
document.getElementById("btnRefresh").onclick = async () => {
  await flushPendingComment();
  await loadState(false);
};
document.getElementById("btnDismissNotice").onclick = () => hideNotice();

window.addEventListener("beforeunload", () => {
  if (app.pendingComment) {
    const payload = JSON.stringify(app.pendingComment);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/comment", new Blob([payload], { type: "application/json" }));
    }
  }
});

loadState(true);
</script>
</body>
</html>
`;
}

module.exports = {
  escHtml,
  normalizeAccent,
  darkenHex,
  accentTextColor,
  renderReviewUiHtml,
};
