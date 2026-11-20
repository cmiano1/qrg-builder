// Throwaway prototype generator: builds a single self-contained HTML demo of the
// Local Browser OK List Review UI, embedding the two real example QRG page PNGs.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const p1 = fs.readFileSync(path.join(root, "qrg-builder/kit/playbook/assets/example_page_01.png")).toString("base64");
const p2 = fs.readFileSync(path.join(root, "qrg-builder/kit/playbook/assets/example_page_02.png")).toString("base64");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PROTOTYPE — QRG Local Browser OK List</title>
<style>
  :root {
    --bg: #f4f5f7;
    --surface: #ffffff;
    --surface-2: #f9fafb;
    --border: #d9dde5;
    --border-strong: #bfc6d4;
    --navy: #1f3864;
    --red: #c8122c;
    --red-soft: #fdf2f4;
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
    --hold-bg: #f1f3f6;
    --hold-fg: #4b5563;
    --shadow: 0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04);
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif; color: var(--text); background: var(--bg); }
  body { display: flex; flex-direction: column; min-height: 100dvh; }

  .proto-banner {
    background: var(--navy); color: #fff; padding: 10px 20px;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
    border-bottom: 3px solid var(--red);
  }
  .proto-banner-left { display: flex; flex-direction: column; gap: 2px; max-width: 780px; }
  .proto-tag { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #ffd966; }
  .proto-banner h1 { margin: 0; font-size: 17px; font-weight: 700; }
  .proto-banner p { margin: 2px 0 0; font-size: 13px; color: #dbe4f5; line-height: 1.35; }
  .proto-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .btn {
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
    padding: 7px 12px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: #eef1f6; }
  .btn-primary { background: var(--red); color: #fff; border-color: var(--red); }
  .btn-primary:hover { background: #a80e24; }
  .btn-navy { background: #2c4a82; color: #fff; border-color: #4666a3; }
  .btn-navy:hover { background: #365999; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }

  .scenarios-bar {
    background: #fff9e6; border-bottom: 1px solid #ead89b; padding: 8px 20px;
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px;
  }
  .scenarios-bar strong { color: #664d03; margin-right: 4px; }
  .scenario-btn {
    border: 1px solid #d9be63; background: #fff; color: #4d3900;
    padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .scenario-btn.active { background: #664d03; color: #fff; border-color: #664d03; }
  .scenario-hint { color: #664d03; font-size: 12.5px; margin-left: auto; }

  .summary-strip {
    background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px 20px;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; }
  .kpi {
    border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; background: var(--surface-2);
    display: flex; align-items: baseline; gap: 8px;
  }
  .kpi .num { font-size: 18px; font-weight: 800; color: var(--navy); }
  .kpi .lbl { font-size: 12px; color: var(--muted); font-weight: 600; }
  .kpi.ok { background: var(--ok-bg); border-color: var(--ok-bd); }
  .kpi.ok .num { color: var(--ok-fg); }
  .kpi.fix { background: var(--fix-bg); border-color: var(--fix-bd); }
  .kpi.fix .num { color: var(--fix-fg); }

  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    border: 1px solid var(--border); background: var(--surface); color: var(--muted);
    padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .chip.active { background: var(--navy); color: #fff; border-color: var(--navy); }

  .workspace {
    flex: 1; display: grid; grid-template-columns: 370px minmax(0, 1fr); min-height: 0;
  }
  @media (max-width: 960px) {
    .workspace { grid-template-columns: 1fr; }
  }

  .guide-list {
    background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .guide-card {
    border: 1px solid var(--border); border-radius: var(--radius); padding: 11px 12px;
    background: var(--surface); cursor: pointer; text-align: left; width: 100%;
    display: flex; flex-direction: column; gap: 6px;
  }
  .guide-card:hover { border-color: var(--navy); background: #fafbfe; }
  .guide-card.selected { border: 2px solid var(--navy); background: #f2f5fb; padding: 10px 11px; }
  .guide-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .guide-code { font-size: 12px; font-weight: 800; color: var(--navy); letter-spacing: .02em; }
  .guide-title { font-size: 14px; font-weight: 700; color: var(--text); }
  .guide-meta { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .pill {
    display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
    font-size: 11.5px; font-weight: 700; border: 1px solid transparent; white-space: nowrap;
  }
  .pill-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-bd); }
  .pill-note { background: var(--note-bg); color: var(--note-fg); border-color: var(--note-bd); }
  .pill-fix { background: var(--fix-bg); color: var(--fix-fg); border-color: var(--fix-bd); }
  .pill-wait { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; }
  .pill-bad { background: var(--bad-bg); color: var(--bad-fg); border-color: var(--bad-bd); }
  .pill-hold { background: var(--hold-bg); color: var(--hold-fg); border-color: var(--border); }
  .pill-changed { background: #fff3cd; color: #7c5200; border-color: #f0d06b; }

  .detail-pane {
    overflow-y: auto; padding: 18px 22px 28px; display: flex; flex-direction: column; gap: 16px;
  }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 16px 18px; box-shadow: var(--shadow);
  }
  .detail-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .detail-header h2 { margin: 2px 0 4px; font-size: 20px; color: var(--text); }
  .sub-meta { font-size: 12.5px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 12px; }
  .hash { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #f1f3f6; padding: 1px 6px; border-radius: 4px; }

  .alert-box {
    border-radius: 8px; padding: 10px 13px; font-size: 13px; line-height: 1.45; margin-top: 12px;
    border: 1px solid var(--border); background: var(--surface-2);
  }
  .alert-check { background: #eef5ff; border-color: #b7d2f7; color: #163d6e; }
  .alert-warn { background: var(--bad-bg); border-color: var(--bad-bd); color: var(--bad-fg); }
  .alert-changed { background: #fff9e6; border-color: #ead180; color: #5c4300; }

  .decision-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .pick-btn {
    border: 1.5px solid var(--border-strong); background: var(--surface); color: var(--text);
    padding: 9px 14px; border-radius: 8px; font-size: 13.5px; font-weight: 700; cursor: pointer;
  }
  .pick-btn:hover:not(:disabled) { background: #f4f6fa; }
  .pick-btn.selected-ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-fg); }
  .pick-btn.selected-note { background: var(--note-bg); color: var(--note-fg); border-color: var(--note-fg); }
  .pick-btn.selected-fix { background: var(--fix-bg); color: var(--fix-fg); border-color: var(--fix-fg); }
  .pick-btn:disabled { opacity: .45; cursor: not-allowed; }

  .comment-wrap { margin-top: 12px; }
  .comment-wrap label { display: block; font-size: 12.5px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
  textarea {
    width: 100%; min-height: 68px; border: 1px solid var(--border-strong); border-radius: 8px;
    padding: 9px 11px; font-family: inherit; font-size: 13.5px; color: var(--text); resize: vertical;
  }
  textarea:focus { outline: 2px solid #2c4a82; outline-offset: 1px; }

  .saved-toast {
    display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700;
    color: var(--ok-fg); background: var(--ok-bg); border: 1px solid var(--ok-bd);
    padding: 4px 10px; border-radius: 999px;
  }

  .preview-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
  }
  .preview-pages {
    display: flex; flex-direction: column; align-items: center; gap: 18px;
    background: #e9ecf2; padding: 18px; border-radius: 8px;
  }
  .page-sheet {
    background: #fff; border: 1px solid #cfd5e0; box-shadow: 0 3px 10px rgba(16,24,40,.12);
    width: 100%; max-width: 760px; overflow: hidden;
  }
  .page-sheet.compact { max-width: 540px; }
  .page-label {
    background: #f5f7fa; border-bottom: 1px solid #e2e6ef; padding: 6px 12px;
    font-size: 12px; font-weight: 700; color: var(--muted); display: flex; justify-content: space-between;
  }
  .page-sheet img { display: block; width: 100%; height: auto; }
  .mock-page {
    padding: 36px 42px; color: #2d3748; font-size: 14px; line-height: 1.55; min-height: 360px;
  }
  .mock-page h3 { margin: 0 0 4px; text-align: center; font-size: 20px; color: #000; }
  .mock-page .mock-sub { text-align: center; font-style: italic; color: var(--red); margin-bottom: 4px; }
  .mock-page .mock-unit { text-align: center; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 20px; }
  .mock-page .mock-h2 { color: #8c0d1f; font-weight: 700; border-bottom: 2px solid var(--red); padding-bottom: 3px; margin: 16px 0 8px; }

  dialog {
    border: 1px solid var(--border-strong); border-radius: 12px; padding: 0; max-width: 680px; width: calc(100% - 32px);
    box-shadow: 0 20px 48px rgba(16,24,40,.28);
  }
  dialog::backdrop { background: rgba(15, 23, 42, .48); }
  .modal-head {
    background: var(--navy); color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;
  }
  .modal-head h3 { margin: 0; font-size: 16px; }
  .modal-body { padding: 18px; font-size: 13.5px; line-height: 1.5; max-height: 70vh; overflow-y: auto; }
  .modal-foot { padding: 12px 18px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; background: var(--surface-2); }
  .send-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; margin-bottom: 7px; background: #fff; gap: 10px; }
  .send-row.refused { background: var(--bad-bg); border-color: var(--bad-bd); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
  .checkbox-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #f2f5fb; border: 1px solid #c9d6ef; border-radius: 8px; margin-bottom: 14px; font-weight: 600; }
</style>
</head>
<body>

<header class="proto-banner">
  <div class="proto-banner-left">
    <span class="proto-tag">Throwaway Prototype · Question Under Test</span>
    <h1>QRG OK List — Local Browser Review UI</h1>
    <p>Does reviewing locked QRGs side-by-side in your web browser (with optional <code>.xlsx</code> export always available) feel better than reviewing inside a spreadsheet?</p>
  </div>
  <div class="proto-actions">
    <button class="btn btn-navy" id="btnExportXlsx" type="button">Export .xlsx OK List</button>
    <button class="btn btn-primary" id="btnPreviewSend" type="button">Preview Send Copies (_send/)</button>
  </div>
</header>

<section class="scenarios-bar" aria-label="Guided walkthrough scenarios">
  <strong>Try a scenario:</strong>
  <button class="scenario-btn active" data-scenario="initial" type="button">1. First review round</button>
  <button class="scenario-btn" data-scenario="fix_round" type="button">2. After a fix round (carry-forward)</button>
  <button class="scenario-btn" data-scenario="broken_lock" type="button">3. Tampered file caught by lock</button>
  <span class="scenario-hint" id="scenarioHint"></span>
</section>

<section class="summary-strip" aria-label="Review progress summary">
  <div class="kpis" id="kpiStrip"></div>
  <div class="filters" id="filterStrip"></div>
</section>

<main class="workspace">
  <aside class="guide-list" id="guideList" aria-label="QRG guide list"></aside>
  <section class="detail-pane" id="detailPane" aria-label="Selected QRG review panel"></section>
</main>

<dialog id="sendDialog">
  <div class="modal-head">
    <h3>Preview Release — Clean Send Copies (_send/)</h3>
    <button class="btn btn-sm" id="closeDialog" type="button">Close</button>
  </div>
  <div class="modal-body" id="sendDialogBody"></div>
  <div class="modal-foot">
    <button class="btn btn-sm" id="btnDownloadJson" type="button">Download picks.json</button>
    <button class="btn btn-primary btn-sm" id="closeDialog2" type="button">Done</button>
  </div>
</dialog>

<script>
/* ============================================================================
 * PURE REVIEW-STATE LOGIC MODULE (Zero DOM references — liftable into v2 kit)
 * ============================================================================ */
const ReviewModel = (() => {
  const CALLS = ["OK to send", "OK to send, note for later", "Fix before sending"];

  function canPick(guide) {
    return guide.lockStatus === "locked";
  }

  function setPick(state, code, call) {
    const g = state.guides.find((x) => x.code === code);
    if (!g || !canPick(g)) return state;
    const nextCall = g.call === call ? "" : call;
    return {
      ...state,
      lastEvent: nextCall ? \`Marked \${code} as "\${nextCall}" (saved locally to review/picks.json)\` : \`Cleared pick on \${code}\`,
      guides: state.guides.map((x) => x.code === code ? { ...x, call: nextCall } : x),
    };
  }

  function setComment(state, code, comment) {
    return {
      ...state,
      lastEvent: \`Saved reviewer comment on \${code}\`,
      guides: state.guides.map((x) => x.code === code ? { ...x, comment } : x),
    };
  }

  function summarize(guides) {
    const locked = guides.filter((g) => g.lockStatus === "locked");
    const ok = locked.filter((g) => g.call.startsWith("OK to send")).length;
    const fix = locked.filter((g) => g.call === "Fix before sending").length;
    const remaining = locked.length - ok - fix;
    return { total: guides.length, locked: locked.length, ok, fix, remaining };
  }

  function computeSendPlan(guides, includePdf) {
    const copy = [];
    const skipped = [];
    for (const g of guides) {
      if (g.lockStatus === "broken") {
        skipped.push({ code: g.code, reason: "Lock broken — file changed after it was locked. Must re-render and relock." });
        continue;
      }
      if (g.lockStatus !== "locked") {
        skipped.push({ code: g.code, reason: "Not locked yet." });
        continue;
      }
      if (!g.call) {
        skipped.push({ code: g.code, reason: "No decision picked yet." });
        continue;
      }
      if (g.call === "Fix before sending") {
        skipped.push({ code: g.code, reason: "Marked Fix before sending" + (g.comment ? ": " + g.comment : ".") });
        continue;
      }
      if (g.onHold) {
        skipped.push({ code: g.code, reason: "On send hold: " + g.onHold });
        continue;
      }
      const cleanBase = \`\${g.prefix} - \${g.title}\`;
      const files = [\`\${g.sendFolder}/\${cleanBase}.docx\`];
      if (includePdf) files.push(\`\${g.sendFolder}/\${cleanBase}.pdf\`);
      copy.push({ code: g.code, files, noteForLater: g.call.includes("note for later") ? g.comment : "" });
    }
    return { copy, skipped };
  }

  return { CALLS, canPick, setPick, setComment, summarize, computeSendPlan };
})();

/* ============================================================================
 * SAMPLE SCENARIO DATA (uses real example_page_01.png & example_page_02.png)
 * ============================================================================ */
const REAL_PAGES = [
  "data:image/png;base64,${p1}",
  "data:image/png;base64,${p2}",
];

const SCENARIOS = {
  initial: {
    hint: "Click a guide on the left, read the pages on the right, and pick OK to send or Fix before sending.",
    guides: [
      {
        code: "UNIT1-CW 01", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Log a Call on a Case", subtitle: "Record a Phone Call in the Case Activity",
        lockStatus: "locked", hash: "a4f91e02", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 01 - Log a Call on a Case - DRAFT 20261119-1938.docx",
        how: "First build, QA clean, proof clean, pages visually inspected",
        check: "Confirm step 4 wording matches the Comments box label on the live screen.",
        changed: false, earlierCall: "", call: "", comment: "", realImages: REAL_PAGES,
      },
      {
        code: "UNIT1-CW 02", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Upload a Signed Document", subtitle: "Attach Client Forms to a Case",
        lockStatus: "locked", hash: "7c31b94e", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 02 - Upload a Signed Document - DRAFT 20261119-1935.docx",
        how: "First build, QA clean, proof clean, pages visually inspected",
        check: "Verify whether PDF-only upload limit should be mentioned in Troubleshooting.",
        changed: false, earlierCall: "", call: "OK to send", comment: "", realImages: null,
      },
      {
        code: "UNIT1-SUP 01", set: "Unit 1 Supervisor", prefix: "Unit 1 Supervisor", sendFolder: "UNIT1-SUP",
        title: "Approve a Case Closure", subtitle: "Final Supervisor Sign-Off",
        lockStatus: "locked", hash: "19de40c8", lockedAt: "20261119-1940", pages: 1,
        lockedFile: "Unit 1 Supervisor 01 - Approve a Case Closure - DRAFT 20261119-1930.docx",
        how: "First build, QA clean, pages visually inspected",
        check: "",
        changed: false, earlierCall: "", call: "Fix before sending", comment: "Step 3 says Submit, but the live button was renamed to Confirm Closure.", realImages: null,
      },
      {
        code: "UNIT1-SUP 02", set: "Unit 1 Supervisor", prefix: "Unit 1 Supervisor", sendFolder: "UNIT1-SUP",
        title: "Reassign an Open Case", subtitle: "Transfer Ownership Between Workers",
        lockStatus: "unlocked", hash: "", lockedAt: "", pages: 0,
        lockedFile: "", how: "Drafting in progress — awaiting screenshot from process owner",
        check: "", changed: false, earlierCall: "", call: "", comment: "", realImages: null,
      },
    ],
  },
  fix_round: {
    hint: "Guide 02's approval carried forward automatically. Supervisor 01 was rebuilt and comes back blank with your earlier comment shown!",
    guides: [
      {
        code: "UNIT1-CW 01", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Log a Call on a Case", subtitle: "Record a Phone Call in the Case Activity",
        lockStatus: "locked", hash: "a4f91e02", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 01 - Log a Call on a Case - DRAFT 20261119-1938.docx",
        how: "Unchanged since previous review sheet (pick carried forward)",
        check: "", changed: false, earlierCall: "", call: "OK to send", comment: "", realImages: REAL_PAGES,
      },
      {
        code: "UNIT1-CW 02", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Upload a Signed Document", subtitle: "Attach Client Forms to a Case",
        lockStatus: "locked", hash: "7c31b94e", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 02 - Upload a Signed Document - DRAFT 20261119-1935.docx",
        how: "Unchanged since previous review sheet (pick carried forward)",
        check: "", changed: false, earlierCall: "", call: "OK to send, note for later", comment: "Add max file size note in next release.", realImages: null,
      },
      {
        code: "UNIT1-SUP 01", set: "Unit 1 Supervisor", prefix: "Unit 1 Supervisor", sendFolder: "UNIT1-SUP",
        title: "Approve a Case Closure", subtitle: "Final Supervisor Sign-Off",
        lockStatus: "locked", hash: "88a12f77", lockedAt: "20261119-2015", pages: 1,
        lockedFile: "Unit 1 Supervisor 01 - Approve a Case Closure - DRAFT 20261119-2012.docx",
        how: "Fix round 1: renamed Submit to Confirm Closure in step 3 and refreshed Figure 1",
        check: "Confirm step 3 now matches the live button label.",
        changed: true,
        earlierCall: "Your earlier call (DRAFT 20261119-1940): Fix before sending — Step 3 says Submit, but the live button was renamed to Confirm Closure. Not carried because the guide was rebuilt.",
        call: "", comment: "", realImages: null,
      },
    ],
  },
  broken_lock: {
    hint: "Someone hand-edited Log a Call on a Case in Word after it was locked. Notice how picking is blocked and Preview Send Copies refuses it!",
    guides: [
      {
        code: "UNIT1-CW 01", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Log a Call on a Case", subtitle: "Record a Phone Call in the Case Activity",
        lockStatus: "broken", hash: "a4f91e02", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 01 - Log a Call on a Case - DRAFT 20261119-1938.docx",
        how: "First build, QA clean, pages visually inspected",
        check: "File hash on disk (f209c11d) no longer matches lock (a4f91e02). Fold hand edits into Guide Source, rebuild, re-render, and relock.",
        changed: false, earlierCall: "", call: "", comment: "", realImages: REAL_PAGES,
      },
      {
        code: "UNIT1-CW 02", set: "Unit 1 Case Worker", prefix: "Unit 1 Case Worker", sendFolder: "UNIT1-CW",
        title: "Upload a Signed Document", subtitle: "Attach Client Forms to a Case",
        lockStatus: "locked", hash: "7c31b94e", lockedAt: "20261119-1940", pages: 2,
        lockedFile: "Unit 1 Case Worker 02 - Upload a Signed Document - DRAFT 20261119-1935.docx",
        how: "First build, QA clean, pages visually inspected",
        check: "", changed: false, earlierCall: "", call: "OK to send", comment: "", realImages: null,
      },
    ],
  },
};

/* ============================================================================
 * THROWAWAY UI SHELL
 * ============================================================================ */
let appState = {
  scenario: "initial",
  filter: "all",
  selectedCode: "UNIT1-CW 01",
  compactZoom: false,
  includePdfInSend: false,
  lastEvent: "Ready — pick any guide to inspect and record your decision.",
  guides: structuredClone(SCENARIOS.initial.guides),
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function statusBadge(g) {
  if (g.lockStatus === "broken") return '<span class="pill pill-bad">Lock broken</span>';
  if (g.lockStatus !== "locked") return '<span class="pill pill-hold">Not locked</span>';
  if (g.call === "OK to send") return '<span class="pill pill-ok">OK to send</span>';
  if (g.call === "OK to send, note for later") return '<span class="pill pill-note">OK · note for later</span>';
  if (g.call === "Fix before sending") return '<span class="pill pill-fix">Fix before sending</span>';
  return '<span class="pill pill-wait">Waiting for OK</span>';
}

function filteredGuides() {
  return appState.guides.filter((g) => {
    if (appState.filter === "pending") return g.lockStatus === "locked" && !g.call;
    if (appState.filter === "ok") return g.call.startsWith("OK to send");
    if (appState.filter === "fix") return g.call === "Fix before sending";
    if (appState.filter === "attention") return g.lockStatus !== "locked" || g.changed;
    return true;
  });
}

function render() {
  const sum = ReviewModel.summarize(appState.guides);
  document.getElementById("scenarioHint").textContent = SCENARIOS[appState.scenario].hint;
  document.querySelectorAll(".scenario-btn").forEach((b) => b.classList.toggle("active", b.dataset.scenario === appState.scenario));

  document.getElementById("kpiStrip").innerHTML = \`
    <div class="kpi"><span class="num">\${sum.total}</span><span class="lbl">Total QRGs</span></div>
    <div class="kpi"><span class="num">\${sum.locked}</span><span class="lbl">Locked</span></div>
    <div class="kpi ok"><span class="num">\${sum.ok}</span><span class="lbl">OK to send</span></div>
    <div class="kpi fix"><span class="num">\${sum.fix}</span><span class="lbl">Fix before sending</span></div>
    <div class="kpi"><span class="num">\${sum.remaining}</span><span class="lbl">Left to pick</span></div>
  \`;

  const filters = [
    ["all", "All (" + appState.guides.length + ")"],
    ["pending", "Waiting for OK (" + sum.remaining + ")"],
    ["ok", "OK to send (" + sum.ok + ")"],
    ["fix", "Needs fix (" + sum.fix + ")"],
    ["attention", "Changed / Unlocked"],
  ];
  document.getElementById("filterStrip").innerHTML = filters.map(([k, lbl]) =>
    \`<button class="chip \${appState.filter === k ? "active" : ""}" data-filter="\${k}" type="button">\${esc(lbl)}</button>\`
  ).join("");

  const list = filteredGuides();
  if (!list.some((g) => g.code === appState.selectedCode) && list.length) {
    appState.selectedCode = list[0].code;
  }

  const listEl = document.getElementById("guideList");
  listEl.innerHTML = list.length ? list.map((g) => \`
    <button class="guide-card \${g.code === appState.selectedCode ? "selected" : ""}" data-code="\${esc(g.code)}" type="button">
      <div class="guide-top">
        <span class="guide-code">\${esc(g.code)}</span>
        \${statusBadge(g)}
      </div>
      <div class="guide-title">\${esc(g.title)}</div>
      <div class="guide-meta">
        <span>\${esc(g.set)}</span>
        \${g.pages ? \`<span>· \${g.pages} pg (US Letter)</span>\` : ""}
        \${g.changed ? '<span class="pill pill-changed">Changed since last sheet</span>' : ""}
      </div>
    </button>
  \`).join("") : '<div class="alert-box">No guides match this filter.</div>';

  const g = appState.guides.find((x) => x.code === appState.selectedCode) || appState.guides[0];
  const pane = document.getElementById("detailPane");
  if (!g) { pane.innerHTML = ""; return; }

  const locked = ReviewModel.canPick(g);
  pane.innerHTML = \`
    <div class="card">
      <div class="detail-header">
        <div>
          <div class="sub-meta">
            <strong>\${esc(g.code)}</strong>
            <span>\${esc(g.set)}</span>
            \${g.hash ? \`<span>SHA-256 <span class="hash">\${esc(g.hash)}</span></span>\` : ""}
            \${g.lockedAt ? \`<span>Locked \${esc(g.lockedAt)}</span>\` : ""}
          </div>
          <h2>\${esc(g.title)}</h2>
          <div class="sub-meta"><span>\${esc(g.how)}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          \${statusBadge(g)}
          <span class="saved-toast">\${esc(appState.lastEvent)}</span>
        </div>
      </div>

      \${g.lockStatus === "broken" ? \`<div class="alert-box alert-warn"><strong>Lock broken — decision disabled:</strong> \${esc(g.check)}</div>\` : ""}
      \${g.lockStatus === "unlocked" ? \`<div class="alert-box"><strong>Not locked yet:</strong> Decisions unlock automatically once QA, proofing, and visual page inspection pass and the guide is locked.</div>\` : ""}
      \${g.earlierCall ? \`<div class="alert-box alert-changed"><strong>Rebuilt since last sheet:</strong> \${esc(g.earlierCall)}</div>\` : ""}
      \${g.lockStatus === "locked" && g.check ? \`<div class="alert-box alert-check"><strong>Check these spots:</strong> \${esc(g.check)}</div>\` : ""}

      <div style="margin-top:14px;">
        <div style="font-size:12.5px;font-weight:700;color:var(--muted);">Your call (click once to select, click again to clear):</div>
        <div class="decision-row">
          <button class="pick-btn \${g.call === "OK to send" ? "selected-ok" : ""}" data-pick="OK to send" \${locked ? "" : "disabled"} type="button">✓ OK to send</button>
          <button class="pick-btn \${g.call === "OK to send, note for later" ? "selected-note" : ""}" data-pick="OK to send, note for later" \${locked ? "" : "disabled"} type="button">✓ OK to send, note for later</button>
          <button class="pick-btn \${g.call === "Fix before sending" ? "selected-fix" : ""}" data-pick="Fix before sending" \${locked ? "" : "disabled"} type="button">✕ Fix before sending</button>
        </div>
      </div>

      <div class="comment-wrap">
        <label for="commentBox">Your comment (saved verbatim for fix rounds or follow-up notes)</label>
        <textarea id="commentBox" \${locked ? "" : "disabled"} placeholder="Example: In step 4, update 'Comments' to match the new field label...">\${esc(g.comment)}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="preview-toolbar">
        <div>
          <strong>Visual Page Preview</strong>
          <span style="font-size:12.5px;color:var(--muted);margin-left:8px;">\${g.pages ? g.pages + " page(s) · Standard US Letter (8.5 × 11 in)" : "No render yet"}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" id="btnZoom" type="button">\${appState.compactZoom ? "Fit Wide" : "Compact View"}</button>
          <span class="pill pill-hold" title="In the real kit, clicking opens the local file">Word: \${esc(g.lockedFile || "not built")}</span>
        </div>
      </div>

      <div class="preview-pages">
        \${g.realImages ? g.realImages.map((src, i) => \`
          <div class="page-sheet \${appState.compactZoom ? "compact" : ""}">
            <div class="page-label"><span>Page \${i + 1} of \${g.realImages.length}</span><span>Real QRG Builder render (example guide)</span></div>
            <img src="\${src}" alt="Page \${i + 1} of \${esc(g.title)}" />
          </div>
        \`).join("") : g.pages ? \`
          <div class="page-sheet \${appState.compactZoom ? "compact" : ""}">
            <div class="page-label"><span>Page 1 of \${g.pages} (Sample mockup — click UNIT1-CW 01 for real QRG page PNGs)</span><span>US Letter</span></div>
            <div class="mock-page">
              <h3>\${esc(g.title)}</h3>
              <div class="mock-sub">\${esc(g.subtitle)}</div>
              <div class="mock-unit">\${esc(g.set)}</div>
              <div class="mock-h2">Purpose</div>
              <p>Sample placeholder preview for this prototype row. Select <strong>UNIT1-CW 01 — Log a Call on a Case</strong> in the left sidebar to inspect the actual rendered QRG pages side by side.</p>
              <div class="mock-h2">Steps</div>
              <ol><li>Open the record in the live system.</li><li>Verify the required fields and click <strong>Confirm</strong>.</li></ol>
            </div>
          </div>
        \` : '<div class="alert-box">No rendered pages exist yet for this draft guide.</div>'}
      </div>
    </div>
  \`;

  document.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { appState.filter = b.dataset.filter; render(); });
  document.querySelectorAll("[data-code]").forEach((b) => b.onclick = () => { appState.selectedCode = b.dataset.code; render(); });
  document.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => {
    appState = ReviewModel.setPick(appState, g.code, b.dataset.pick);
    render();
  });
  const ta = document.getElementById("commentBox");
  if (ta) ta.oninput = () => {
    const next = ReviewModel.setComment(appState, g.code, ta.value);
    appState.guides = next.guides;
    appState.lastEvent = next.lastEvent;
  };
  const zoom = document.getElementById("btnZoom");
  if (zoom) zoom.onclick = () => { appState.compactZoom = !appState.compactZoom; render(); };
}

function renderSendModal() {
  const plan = ReviewModel.computeSendPlan(appState.guides, appState.includePdfInSend);
  const body = document.getElementById("sendDialogBody");
  body.innerHTML = \`
    <label class="checkbox-row">
      <input type="checkbox" id="chkPdf" \${appState.includePdfInSend ? "checked" : ""} />
      Also include matching PDF copies alongside the Word (.docx) Send Copies?
    </label>
    <p style="margin-top:0;color:var(--muted);">Only guides marked <strong>OK to send</strong> whose file still matches its SHA-256 Review Lock are staged into <code>_send/</code>:</p>
    <h4 style="margin:10px 0 6px;">Will stage into _send/ (\${plan.copy.length} guide\${plan.copy.length === 1 ? "" : "s"})</h4>
    \${plan.copy.length ? plan.copy.map((c) => \`
      <div class="send-row">
        <div>
          <strong>\${esc(c.code)}</strong>
          \${c.files.map((f) => \`<div class="mono">\${esc(f)}</div>\`).join("")}
          \${c.noteForLater ? \`<div style="font-size:12px;color:var(--note-fg);margin-top:3px;">Note for later: \${esc(c.noteForLater)}</div>\` : ""}
        </div>
        <span class="pill pill-ok">Verified lock</span>
      </div>
    \`).join("") : '<div class="alert-box">No guides are marked OK to send yet.</div>'}
    <h4 style="margin:14px 0 6px;">Skipped / Refused (\${plan.skipped.length})</h4>
    \${plan.skipped.map((s) => \`
      <div class="send-row \${s.reason.startsWith("Lock broken") ? "refused" : ""}">
        <div><strong>\${esc(s.code)}</strong> — \${esc(s.reason)}</div>
      </div>
    \`).join("")}
  \`;
  document.getElementById("chkPdf").onchange = (e) => { appState.includePdfInSend = e.target.checked; renderSendModal(); };
}

document.querySelectorAll(".scenario-btn").forEach((b) => b.onclick = () => {
  const k = b.dataset.scenario;
  appState.scenario = k;
  appState.filter = "all";
  appState.guides = structuredClone(SCENARIOS[k].guides);
  appState.selectedCode = appState.guides[0].code;
  appState.lastEvent = "Loaded scenario: " + b.textContent;
  render();
});

const dlg = document.getElementById("sendDialog");
document.getElementById("btnPreviewSend").onclick = () => { renderSendModal(); dlg.showModal(); };
document.getElementById("closeDialog").onclick = () => dlg.close();
document.getElementById("closeDialog2").onclick = () => dlg.close();
document.getElementById("btnExportXlsx").onclick = () => {
  appState.lastEvent = "In v2, this writes review/QRG OK List - DRAFT <stamp>.xlsx with all current picks!";
  render();
};
document.getElementById("btnDownloadJson").onclick = () => {
  const payload = { exportedAt: new Date().toISOString(), picks: appState.guides.map(({ code, call, comment, lockedFile, hash }) => ({ code, call, comment, lockedFile, hash })) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "picks-prototype.json";
  a.click();
};

render();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, "ok-list-prototype.html"), html, "utf8");
console.log("Wrote ok-list-prototype.html (" + Math.round(html.length / 1024) + " KB)");
