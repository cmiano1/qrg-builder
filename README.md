# QRG Builder

An OS- and app-agnostic AI skill and Node.js toolkit for building, reviewing, and releasing **Quick Reference Guides (QRGs)** as Standard US Letter Word (`.docx`) documents from recordings, screenshots, and notes.

Works on **Windows, macOS, and Linux** in **Antigravity, Claude Code, Codex, Cursor**, or as a standalone Node.js CLI—with **no paid Microsoft Office or admin-install requirements**.

---

## What It Does

- **Single source of truth:** Authors guides in structured JavaScript (`guides/NN.js`) and builds clean, Google Docs–compatible `.docx` files.
- **Screenshot annotation:** Adds numbered callouts, highlights, and crops from source captures (`annotate_screenshot.js`).
- **Automated QA & offline proofing:** Checks formatting, banned words, names, and spelling/grammar offline (`qa_qrgs.js` + `proof_guides.js` via `harper.js`).
- **Visual page renders:** Converts every build to PDF and page PNGs using headless LibreOffice so every page can be visually inspected.
- **Built-in review & release locks:** Review guides in a local **Browser Review UI** (`127.0.0.1`) or an `.xlsx` **OK List**, protected by SHA-256 Review Locks so only exact approved builds become final Send Copies.

---

## Quick Setup

### Requirements
- **Node.js 22+ (LTS)**
- **LibreOffice** (free; portable/no-admin options work on Windows, macOS, and Linux)

### 1. Get the Skill
Clone this repository (or download it as a ZIP from GitHub) and place the `qrg-builder/` folder where your AI tool loads skills:

| Scope | Where to put `qrg-builder/` |
|---|---|
| **Single project only** *(Antigravity / Codex / Cursor)* | `<your-project>/.agents/skills/qrg-builder/` |
| **All projects (Global — Antigravity)** | `~/.gemini/config/skills/qrg-builder/` |
| **All projects (Global — Claude Code)** | `~/.claude/skills/qrg-builder/` |

### 2. Install Kit Dependencies & Run Health Check
From inside `qrg-builder/kit/`:

```sh
npm install
npm run check
```

You should see `RESULT: kit ready`.

For complete step-by-step instructions (including no-admin LibreOffice setup and optional video frame extraction), see **[Setup for Teammates](qrg-builder/references/setup_for_teammates.md)**.

---

## Repository Contents

- [`qrg-builder/SKILL.md`](qrg-builder/SKILL.md) — Main skill instructions and end-to-end workflow
- [`qrg-builder/kit/`](qrg-builder/kit/) — Build, QA, proofing, annotation, rendering, and Browser Review UI scripts
- [`qrg-builder/references/`](qrg-builder/references/) — Content rules, screenshot rules, Definition of Done, and teammate setup guide
