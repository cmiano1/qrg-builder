# Auto-Detected LibreOffice Headless for `.docx → PDF` and Pure-Node `pdfjs-dist` + `@napi-rs/canvas` for `PDF → PNG`

Status: accepted

QRGs are authored in Node.js as Google-Docs-compatible `.docx` Working Deliverables and released as clean-named `.docx` Final Deliverables with optional matching PDFs, often by consultants on locked-down corporate laptops without admin rights. We render `.docx → PDF` via auto-detected headless LibreOffice (standard install, Windows LibreOffice Portable `soffice.com`, macOS `~/Applications`, or Linux AppImage, using an isolated `-env:UserInstallation` temp profile and optional Windows Word COM fallback) and rasterize `PDF → PNG` purely in Node.js 22+ LTS with `pdfjs-dist` (`Apache-2.0`) and `@napi-rs/canvas` (`MIT`).

## Considered Options

- **Dual HTML → Chrome/Edge PDF (`playwright-core`)**: Zero LibreOffice install, but browser HTML pagination diverges from `.docx` in Word and Google Docs, breaking 1:1 visual QA fidelity for the `.docx` deliverable.
- **Pandoc**: Disqualified by Pandoc's own manual—structural AST conversion strips exact margins, fixed DXA table widths, callout styling, `keepNext`/`cantSplit`, and footers.
- **Pure-Node / WASM `.docx → PDF` (`@matbee/libreoffice-converter`, `docx-preview`)**: Not production-ready (`docx-preview` lacks real pagination; LibreOffice WASM is ~242 MB, ~1 GB RAM, and experimental).
- **`mupdf` WASM for `PDF → PNG`**: Rejected because dual AGPL-3.0 / commercial licensing creates copyleft restrictions for a proprietary consulting kit.

## Consequences

- `.docx` remains the single layout source of truth across Google Docs comment rounds, visual QA PNGs, and optional final PDF exports.
- Keeping `Calibri` as the default font gives metric parity across Word, Google Docs, and LibreOffice (which bundles and auto-maps `Calibri → Carlito`).
- Minimum runtime moves to Node.js 22+ LTS (Node 20 reached EOL in April 2026).
- If neither LibreOffice nor Microsoft Word is available on a restricted machine, build, QA, and proofing still succeed and the renderer prints a plain-English setup notice instead of crashing.
