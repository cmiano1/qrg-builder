# Cross-Platform `.docx` Rendering, PDF-to-PNG Rasterization, and Offline Proofing Research

**Date:** 2026-11-19  
**Target repo:** `qrg-builder` (`qrg-kit`, currently Node.js CommonJS without `"type": "module"`, `"engines": { "node": ">=20" }`)  
**Goal:** Replace the three Windows + Microsoft Word–only helper steps (`word_render.ps1`, `pdf_to_png.ps1`, `word_proof.ps1`) with an offline-capable, cross-platform (Windows, macOS, Linux), zero-paid-license pipeline usable by non-developer consultants (including on locked-down corporate laptops with limited admin rights), while preserving a Google-Docs-compatible `.docx` working copy and a layout-faithful final PDF.

---

## Baseline Context & Important Node.js Runtime Note

1. **Current `qrg-kit` layout contract (`kit/lib/docx_helpers.js`):** Every guide is built with `docx@8.5.0` and relies on real Word styles (`Title`, `Heading 1`, `Heading 2`), single font (`Calibri` by default, configurable via `cfg.font`), fixed-layout tables (`w:tblLayout="fixed"`) with explicit DXA widths, repeating table headers (`w:tblHeader`), non-splitting table rows (`w:cantSplit`), 1-cell callout tables (thick left border + shading + `w:keepNext` on lead callouts), `w:keepLines` on numbered steps, `w:keepNext` chains keeping step runs attached to inline PNG figures, and a footer with top border, right tab stop, and `PageNumber.CURRENT` (`PAGE` field).
2. **Existing Word COM fragility:** As recorded in `kit/tools/word_render.ps1`, Microsoft Office update `16.0.20527.20194` even broke standard PowerShell `ExportAsFixedFormat` COM calls (requiring a late-bound reflection workaround).
3. **Node.js 20 End-of-Life impact on npm dependencies:** According to the official Node.js release schedule ([nodejs/Release `schedule.json`](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)), **Node 20 ("Iron") reached End-of-Life on 2026-04-30**; Node 22 ("Jod") is Maintenance LTS until 2027-04-30, Node 24 ("Krypton") until 2028-04-30, and Node 26 ("Lithium") entered Active LTS on 2026-10-28. Several actively maintained npm packages (`pdfjs-dist@5+/6+`, `pdf-to-img@7+`, `puppeteer-core@25+`, `cspell-lib@10+`) now declare `"engines": { "node": ">=22.12" }` or `">=22.13"`. Below, we document both **Node 20-compatible pins** and **Node 22+ LTS current releases**.

---

## 1. `.docx -> PDF` Rendering Without Microsoft Word

### 1A. LibreOffice Headless (`soffice --headless --convert-to pdf`) & Portable / No-Admin Options

#### How Headless Mode Works Across Windows, macOS, and Linux

LibreOffice's official command-line interface ([LibreOffice Help — Starting LibreOffice With Parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)) natively supports unattended document-to-PDF conversion via the Writer PDF export filter (`writer_pdf_Export`), with optional JSON filter parameters ([LibreOffice Help — PDF CLI Parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html)):

```bash
# macOS / Linux
soffice --headless --norestore \
  "-env:UserInstallation=file:///tmp/qrg-lo-profile-<unique>" \
  --convert-to pdf:writer_pdf_Export \
  --outdir "/path/to/out" \
  "/path/to/guide.docx"
```

```cmd
:: Windows (use soffice.com, NOT soffice.exe)
"C:\Program Files\LibreOffice\program\soffice.com" --headless --norestore ^
  "-env:UserInstallation=file:///C:/Users/<user>/AppData/Local/Temp/qrg-lo-profile-<unique>" ^
  --convert-to pdf:writer_pdf_Export ^
  --outdir "C:\path\to\out" ^
  "C:\path\to\guide.docx"
```

Key primary-source operational details:

* **Profile isolation (`-env:UserInstallation=<file-URI>`):** Documented directly in [Starting LibreOffice With Parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html) (`soffice.com -env:UserInstallation=file:///c:/my-test-profile` / `soffice -env:UserInstallation=file:///tmp/test`). LibreOffice uses a single-instance lock per user profile; without `-env:UserInstallation`, headless conversion collides with any already-open LibreOffice desktop window (silently failing or hanging) and cannot run concurrently. Giving each run a fresh temporary directory URI (and deleting it afterward) completely isolates it from any open GUI session and enables safe parallel builds.
* **Windows `soffice.com` vs `soffice.exe`:** Official LibreOffice Help explicitly instructs Windows CLI users to invoke `"{install}\program\soffice.com"` for command-line/headless operations and notes *"Use `soffice.exe` instead of `soffice.com`, when you do not need console (e.g., you do not use command-line interface for headless operations)"* ([Starting LibreOffice With Parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)). Using `soffice.com` keeps the process synchronous and attaches stdout/stderr to Node's `spawnSync` pipes instead of detaching immediately.
* **Standard installed executable paths:**
  * **Windows:** `C:\Program Files\LibreOffice\program\soffice.com`
  * **macOS:** `/Applications/LibreOffice.app/Contents/MacOS/soffice` (or `~/Applications/LibreOffice.app/Contents/MacOS/soffice`)
  * **Linux:** `soffice` or `libreoffice` on `PATH`

#### Portable / No-Admin-Rights Options per OS

| OS | No-Admin Distribution | Official Primary Source | Footprint | CLI Invocation & Gotchas |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | **LibreOffice Portable** (PortableApps.com, packaged with permission & assistance from The Document Foundation) | [libreoffice.org/download-other/#portable](https://www.libreoffice.org/download-other/#portable); [portableapps.com/apps/office/libreoffice_portable](https://portableapps.com/apps/office/libreoffice_portable) | v26.2.4 x64: **213 MB** download / **681–800 MB** extracted (Multilingual-Standard); 281 MB / 900–1,400 MB (Multilingual-All) | Extracts to any user-writable folder (local, USB, or cloud drive) without admin privileges. **Invoke the inner `App\libreoffice\program\soffice.com`** directly (not `LibreOfficePortable.exe`) with `--headless --norestore -env:UserInstallation=file:///...`. While `LibreOfficePortable.exe` forwards arguments, it is a GUI launcher wrapper for portable profile redirection; calling `soffice.com` directly guarantees synchronous exit codes and captured stdout/stderr in Node.js. *(Corporate caveat: Windows AppLocker / WDAC policies can still block executables outside `Program Files` even when UAC admin rights are not needed.)* |
| **macOS** | **Official `.dmg`** dragged to user's `~/Applications` | [libreoffice.org/installation-instructions/#macos](https://www.libreoffice.org/installation-instructions/#macos) | Separate Apple Silicon (`arm64`) & Intel (`x86_64`) builds (~250 MB `.dmg`, ~800 MB app bundle) | Dragging to `/Applications` may prompt for an admin password, whereas dragging `LibreOffice.app` into user-owned `~/Applications` requires **zero admin rights**. Invoke `~/Applications/LibreOffice.app/Contents/MacOS/soffice`. *(Corporate caveat: Gatekeeper/MDM policies may require first-launch approval if quarantined.)* |
| **Linux** | **Official LibreOffice AppImage** (Basic EN-US, Standard, or Full) | [libreoffice.org/download-other/#appimage](https://www.libreoffice.org/download-other/#appimage); [appimages.libreitalia.org](https://appimages.libreitalia.org/LibreOffice-latest.basic-x86_64.AppImage) | Single executable file (~250–350 MB, bundles libraries and fonts) | Zero root/apt/dnf install required. Invoke `./LibreOffice-*.AppImage --headless ...`. **FUSE caveat:** AppImages require FUSE 2 (`libfuse2`) by default, which is often missing on Ubuntu 22.04+ or locked-down containers ([AppImage Docs — FUSE Troubleshooting](https://docs.appimage.org/user-guide/troubleshooting/fuse.html)). Workaround without root: pass `--appimage-extract-and-run` (or run `--appimage-extract` once and call `squashfs-root/AppRun --headless ...`). |

#### Font Parity: `Calibri`, `Carlito`, and Cross-Tool Compatibility

* **LibreOffice built-in Calibri -> Carlito mapping:** In LibreOffice's authoritative font substitution table ([`LibreOffice/core` `officecfg/registry/data/org/openoffice/VCL.xcu`](https://github.com/LibreOffice/core/blob/master/officecfg/registry/data/org/openoffice/VCL.xcu)), `calibri` is mapped first to `carlito`:
  ```xml
  <node oor:name="calibri" oor:op="replace">
    <prop oor:name="SubstFonts">
      <value>carlito;hiraginomarugothicpronw3;hiraginomarugothicprow3</value>
    </prop>
  </node>
  ```
  And `carlito` carries `<prop oor:name="SubstFontsMS"><value>Calibri</value></prop>`.
* **LibreOffice bundles Carlito out of the box:** Verified in [`LibreOffice/core` `external/more_fonts/Module_more_fonts.mk`](https://github.com/LibreOffice/core/blob/master/external/more_fonts/Module_more_fonts.mk) and [`ExternalPackage_carlito.mk`](https://github.com/LibreOffice/core/blob/master/external/more_fonts/ExternalPackage_carlito.mk), upstream LibreOffice installers (Windows MSI, PortableApps, macOS `.dmg`, and AppImage) ship `Carlito-Regular.ttf`, `Carlito-Bold.ttf`, `Carlito-Italic.ttf`, and `Carlito-BoldItalic.ttf` inside LibreOffice's internal `share/fonts/truetype/` folder (alongside `Liberation Sans`, `Caladea`, `Noto Sans`, etc.). *(Note: Linux distro packages like Ubuntu's `libreoffice` often unbundle fonts into OS packages such as `fonts-crosextra-carlito`, so Linux distro installs should verify `fc-match Calibri` resolves to Carlito; the AppImage bundles fonts internally.)*
* **Carlito metric compatibility & Google Docs availability:** Per the official Google Fonts repository ([`googlefonts/carlito` README](https://github.com/googlefonts/carlito/blob/main/README.md) and [`google/fonts` `ofl/carlito/METADATA.pb`](https://github.com/google/fonts/blob/main/ofl/carlito/METADATA.pb)), Carlito (designed by Łukasz Dziedzic, SIL OFL) is explicitly **metric-compatible with Microsoft Calibri** (matching character advance widths and line heights so pagination stays aligned) and has been part of Google Fonts (and Google Docs) since March 2023.
* **Best font choices across Word + Google Docs + LibreOffice:**
  1. **Keep `Calibri` (current `qrg-kit` default — best overall for client `.docx`):** Word uses native Calibri; LibreOffice automatically renders bundled metric-compatible Carlito on macOS/Linux (or system Calibri on Windows); Google Docs supports Calibri natively/metrically in its web renderer without major reflow.
  2. **`Arial` (universal fallback, wider metrics):** Present natively on Windows, macOS, and Google Docs; LibreOffice maps `arial` -> `liberationsans` / `arimo` in [`VCL.xcu`](https://github.com/LibreOffice/core/blob/master/officecfg/registry/data/org/openoffice/VCL.xcu) (bundled via `ExternalPackage_liberation`). Because Arial has wider glyphs than Calibri, switching an existing guide from Calibri to Arial changes line wraps and page count.
  3. **`Carlito` explicitly:** Zero substitution in Google Docs and LibreOffice, **but** Windows/macOS Microsoft Word users who have not installed Carlito will see font fallback in Word unless Carlito is installed or embedded.

#### DOCX Layout Fidelity & Caveats for `qrg-kit`

LibreOffice Writer natively implements OOXML fixed DXA column widths (`w:tblLayout="fixed"`), repeating table headers (`w:tblHeader`), `w:cantSplit`, `w:keepNext`, `w:keepLines`, right-aligned footer tab stops, `PAGE` fields, and inline images. However, Writer's layout engine is not identical to Word's:

* LibreOffice Bugzilla tracks multi-page table pagination edge cases where `w:tblHeader`, `w:cantSplit`, and paragraph `w:keepNext` interact (e.g., [tdf#138020](https://bugs.documentfoundation.org/show_bug.cgi?id=138020)).
* Specifically relevant to `docx_helpers.js`: `keepLeadCallouts()` puts `w:keepNext` on the paragraph inside a 1-cell callout table (relying on Word's rule that `keepNext` on a table's last row keeps the table with the following paragraph), and `pack()` chains `keepNext` across step runs before figures. **Before cutting over, run a visual diff on 2–3 real QRGs** rendered by both Word and LibreOffice to verify that callout-keep chains, repeating table headers, and tight pages don't introduce extra whitespace or orphan headers.

---

### 1B. Pandoc & Other CLI Converters

* **Pandoc (`pandoc input.docx -o out.pdf --pdf-engine=typst|weasyprint|xelatex`):** **Not layout-faithful — disqualified for rendering an existing `.docx`.** The official [Pandoc User's Guide](https://pandoc.org/MANUAL.html) explicitly states:
  > *"Because pandoc's intermediate representation of a document is less expressive than many of the formats it converts between, one should not expect perfect conversions between every format and every other. Pandoc attempts to preserve the structural elements of a document, but not formatting details such as margin size. And some document elements, such as complex tables, may not fit into pandoc's simple document model."*
  Per [Pandoc — Creating a PDF](https://pandoc.org/MANUAL.html#creating-a-pdf), Pandoc parses `.docx` into a structural AST (discarding Word `keepNext`/`keepLines`/`cantSplit`, fixed DXA column widths, callout borders/shading, and footer tab stops) and then compiles a new PDF via an external engine (LaTeX/TeX Live, ConTeXt, Typst, or WeasyPrint) using a separate template. That only makes sense if you stop treating `.docx` as the layout source and author custom Typst/HTML templates directly.
* **ONLYOFFICE Desktop Editors (`ONLYOFFICE/DesktopEditors`) & `x2t`:** Licensed under **GNU AGPL-3.0** ([`ONLYOFFICE/DesktopEditors` README](https://github.com/ONLYOFFICE/DesktopEditors/blob/master/README.md), [`ONLYOFFICE/core`](https://github.com/ONLYOFFICE/core)). Unlike LibreOffice, ONLYOFFICE Desktop Editors does **not** expose a documented headless CLI flag (`--convert-to pdf`). Official automated conversion is provided only via ONLYOFFICE Docs (Document Server) HTTP [Conversion API](https://api.onlyoffice.com/docs/docs-api/additional-api/conversion-api) (a Docker/server deployment). Its internal native C++ converter (`x2t`) has no supported public standalone CLI contract and requires manually assembling shared libraries and font directories.
* **Collabora Online (`CollaboraOnline/online`):** Licensed under **MPL-2.0** ([`CollaboraOnline/online` `COPYING`](https://github.com/CollaboraOnline/online/blob/master/COPYING), [README](https://github.com/CollaboraOnline/online/blob/master/README.md)). It uses LibreOfficeKit under the hood (same layout engine as LibreOffice) and is packaged as a server/Docker/Kubernetes WOPI web service rather than a lightweight no-admin local CLI; on a consultant's laptop, invoking LibreOffice directly achieves identical rendering without a server daemon.

---

### 1C. Pure-Node / WebAssembly `.docx -> PDF` Options

| Project | Primary Source | License | Unpacked Size | Node.js Support | Production Maturity & Layout Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ZetaOffice / `zetajs`** | [zetaoffice.net](https://zetaoffice.net/); [allotropia/zetajs](https://github.com/allotropia/zetajs) ([`docs/start.md`](https://github.com/allotropia/zetajs/blob/main/docs/start.md)) | `zetajs`: MIT; LibreOffice WASM core: MPL-2.0 (open beta + commercial CDN/support) | ~100–240 MB WASM payload (browser CDN or self-hosted) | **Browser-first** (expects HTML5 browser / Web Worker / Emscripten `Module.uno_scripts`) | Official Allotropia (core LibreOffice devs) WASM port (231 stars). Currently open beta and aimed at in-browser office/conversion, not a turnkey offline Node.js CLI npm package. |
| **`@matbee/libreoffice-converter`** | [npm `@matbee/libreoffice-converter@2.7.2`](https://www.npmjs.com/package/@matbee/libreoffice-converter); [matbeedotcom/libreoffice-document-converter](https://github.com/matbeedotcom/libreoffice-document-converter) ([`docs/API.md`](https://github.com/matbeedotcom/libreoffice-document-converter/blob/main/docs/API.md)) | `MPL-2.0` in `package.json` *(no top-level `LICENSE` file in GitHub repo)* | **242 MB** (`253.7 MB` decimal) in `node_modules` | **Yes** (`node >=18.0.0`, dual CJS `require()` and ESM `import()`), supports `.docx -> PDF` and `.docx -> PNG` (`exportAsImage`), plus `includeSystemFonts` / `loadFontsFromDirectory` | **Only genuine pure-Node LibreOffice WASM package found, but immature:** only **37 GitHub stars**, small third-party maintainer (not TDF/Allotropia), **~1 GB RAM** per worker, and its own `docs/API.md` warns *"Avoid parallel conversions."* Worth benchmarking as a zero-OS-install fallback prototype, **not** yet proven enough to rely on as the sole production renderer for a consulting team. |
| **`docx-preview` (`docxjs`)** | [npm `docx-preview@0.4.1`](https://www.npmjs.com/package/docx-preview); [VolodymyrBaydalka/docxjs](https://github.com/VolodymyrBaydalka/docxjs) | Apache-2.0 | 0.93 MB | Browser DOM only (would still need headless browser for PDF/PNG) | **Disqualified by its own README:** *"Realtime page breaking is not implemented"*, only breaks on explicit `<w:br w:type="page"/>` or Word-saved `<w:lastRenderedPageBreak/>` (which Node `docx` never generates), *"fields is not supported yet"* (breaks `Page N` footers), and *"Only `renderAsync` function is stable."* |
| **`mammoth`** | [npm `mammoth@1.13.0`](https://www.npmjs.com/package/mammoth); [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) *(already in `qrg-kit/package.json`)* | BSD-2-Clause | 1.6 MB | Yes (Node >=12, CJS) | **Disqualified for PDF layout.** README explicitly states it converts semantic structure only, ignores fonts/sizes/colors, and *"The formatting of the table itself, such as borders, is currently ignored."* Keep `mammoth` for text extraction into proofing (Section 3), not visual rendering. |

**Bottom line on 1C:** There is **no mature, lightweight, widely adopted pure-Node/WASM `.docx -> PDF` engine** yet. `@matbee/libreoffice-converter` is the closest emerging contender (real LibreOfficeKit in WASM), but its 242 MB npm footprint, ~1 GB RAM requirement, and tiny 37-star maintenance base make native/portable LibreOffice far safer for production today.

---

### 1D. Dual-Render from the Same `guides/NN.js` Source (`.docx` + HTML -> Chromium PDF)

#### Feasibility & CSS Paged Media Capabilities

Because all QRGs are authored through the 9 helpers in `kit/lib/docx_helpers.js`, an HTML/CSS twin renderer could emit print-ready HTML from the exact same guide definitions and print to PDF via Chromium's `page.pdf()`.

* **Modern Chromium print CSS:** Since **Chrome 131** (October 2024), Chromium natively supports CSS Paged Media `@page` margin boxes (`@bottom-left`, `@bottom-right`, `counter(page)`), allowing clean styled footers directly in CSS ([Chrome for Developers — Add content to the margins of web pages when printed using CSS](https://developer.chrome.com/blog/print-margins)) instead of relying on `page.pdf()`'s limited `footerTemplate` (which per [Playwright `Page.pdf` docs](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-page.md) cannot see page stylesheets). Chromium also supports `break-after: avoid` (for headings/lead callouts), `break-inside: avoid` (for steps/callout boxes/table rows), and `thead { display: table-header-group }` (repeating table headers).

#### Critical Trade-Off: Page-Break Parity vs. `.docx` in Google Docs

* **Divergent layout truths:** Blink/Skia's HTML layout engine calculates line wrapping, font metrics, list indents, table padding, and page breaks differently from Microsoft Word and Google Docs.
* **Workflow impact for `qrg-builder`:** Because clients review and comment on the `.docx` uploaded to Google Docs while the final deliverable is a PDF (plus optional `.docx`), dual-rendering means:
  1. Visual QA of PNGs made from the HTML-rendered PDF **will NOT verify the `.docx` layout** (broken `.docx` tables, orphan headings, or shifted figures would go unseen).
  2. Client feedback referencing *"Page 4, step 9"* in Google Docs may land on a different page in the HTML-generated PDF.
  3. Maintaining two parallel styling implementations (`docx_helpers.js` OOXML + print CSS) doubles styling drift risk.
* Dual-rendering only wins if the team decides the **HTML->PDF is the canonical layout** and treats `.docx` strictly as a reflowable text-review artifact (or edits directly in HTML/Markdown rather than `.docx`).

#### Bundled Chromium vs. Auto-Detecting System Chrome / Edge

| Package (Latest Nov 2026) | License | Unpacked Size | Node Engine & Module Format | Browser Footprint & Corporate Laptop Reality |
| :--- | :--- | :--- | :--- | :--- |
| **`playwright-core@1.65.1`** ([npm](https://www.npmjs.com/package/playwright-core), [docs](https://github.com/microsoft/playwright/blob/main/docs/src/browsers.md)) | Apache-2.0 | **13.3 MB** (zero deps) | **`node >=20`**, dual **CommonJS `require()`** & ESM | Downloads **0 MB** of browsers ([`packages/playwright-core/README.md`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/README.md)). Built-in auto-detection for pre-installed corporate browsers via `chromium.launch({ channel: 'msedge' })` (Edge is pre-installed on every Windows 10/11 corporate laptop) or `channel: 'chrome'` (Windows/macOS/Linux). |
| **`puppeteer-core@25.18.1`** ([npm](https://www.npmjs.com/package/puppeteer-core), [docs](https://github.com/puppeteer/puppeteer/blob/main/docs/guides/configuration.md)) | Apache-2.0 | **6.1 MB** | **`node >=22.12.0`**, **ESM** (`"type": "module"`). *(Last Node 20 CJS pin: `24.43.1`)* | Downloads **0 MB** of browsers, but requires manually passing `executablePath` per OS (no built-in `channel: 'msedge'` resolver). |
| **Full `puppeteer` / `playwright`** | Apache-2.0 | +170–282 MB browser cache | Same as `-core` | Full `puppeteer` auto-downloads Chrome for Testing (**~170 MB macOS, ~280 MB Windows, ~282 MB Linux**) plus `chrome-headless-shell` ([Puppeteer Installation Docs](https://github.com/puppeteer/puppeteer/blob/main/docs/guides/installation.md)). Official docs explicitly warn that modern npm/pnpm script-blocking or corporate proxies frequently block automatic browser downloads. |

---

## 2. Cross-Platform `PDF -> per-page PNG` in Pure Node.js (Replacing `pdf_to_png.ps1`)

Zero OS binaries (no Poppler `pdftoppm`, no Ghostscript, no ImageMagick) are required.

| Option | Latest Version & Primary Source | License | Footprint (Unpacked) | Node Engine & CJS/ESM | Prebuilt Binaries / Reliability | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`pdfjs-dist` + `@napi-rs/canvas`** *(direct, ~40 lines)* | `pdfjs-dist@6.5.438` ([mozilla/pdf.js](https://github.com/mozilla/pdf.js), [`examples/node/pdf2png/pdf2png.mjs`](https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs)); `@napi-rs/canvas@1.1.1` ([Brooooooklyn/canvas](https://github.com/Brooooooklyn/canvas)) | **Apache-2.0** + **MIT** | `pdfjs-dist`: 35.9 MB + 1 platform binary of `@napi-rs/canvas` (**37.0 MB** Win x64, **27.7 MB** macOS arm64, **34.1 MB** Linux x64) | `pdfjs-dist@6.5.438` & `5.x`: **`node >=22.13 \|\| >=24`**; **`pdfjs-dist@4.10.38`**: **`node >=20`**. Ships `.mjs` (`pdfjs-dist/legacy/build/pdf.mjs`); load cleanly from CJS via `await import(...)`. `@napi-rs/canvas` is CJS, `node >=10`. | **Excellent.** `@napi-rs/canvas` wraps Google Skia via Rust Node-API with **0 system dependencies** (no Cairo, no `node-gyp`, no C++ compiler) and ships prebuilt binaries for Win x64/arm64, macOS x64/arm64, and Linux x64/arm64 (glibc >=2.18 & musl). `pdfjs-dist` declares `@napi-rs/canvas` as its own official `optionalDependencies` and auto-wires `pdfDocument.canvasFactory`. | **Recommended.** Cleanest permissive license, zero OS tools, Mozilla-maintained official Node example, exact DPI control (`scale = dpi / 72`). |
| **`pdf-to-img`** *(thin wrapper over `pdfjs-dist`)* | `pdf-to-img@7.0.2` ([k-yle/pdf-to-img](https://github.com/k-yle/pdf-to-img)) | **MIT** (wraps Apache-2.0 `pdfjs-dist`) | 17 KB + `pdfjs-dist` + `@napi-rs/canvas` | ESM-only (README shows CJS `await import('pdf-to-img')`). `v7.0.2`: `node >=22.13`; `v6.3.0`: `>=20.19`; `v5.0.0`: `>=20`. | Same prebuilt `@napi-rs/canvas` stack as direct `pdfjs-dist`. | Good shortcut if you want a 5-line async iterator (`for await (const png of await pdf(...))`), though calling `pdfjs-dist` directly avoids extra version coupling. |
| **`pdf-img-convert`** | `pdf-img-convert@2.0.0` ([ol-th/pdf-img-convert.js](https://github.com/ol-th/pdf-img-convert.js)) | MIT | 19 KB + heavy deps | CJS | **Avoid:** depends on legacy Cairo `canvas` (fragile native C++ builds on corporate laptops) and `node-fetch`. | **Not recommended.** |
| **`unpdf`** | `unpdf@2.2.1` ([unjs/unpdf](https://github.com/unjs/unpdf)) | MIT | 3.1 MB | ESM-only, **`node >=24`** | Serverless-oriented pdf.js bundle; still requires canvas for image rendering. | Overkill / Node 24 requirement too high for Node 20/22 laptops. |
| **`mupdf`** *(official Artifex WASM)* | `mupdf@1.28.6` ([npm `mupdf`](https://www.npmjs.com/package/mupdf); [MuPDF JS Guide](https://mupdf.readthedocs.io/en/latest/guide/using-with-javascript.html); [MuPDF License](https://mupdf.readthedocs.io/en/latest/license.html)) | **AGPL-3.0-or-later** *(or paid Commercial license)* | **13.7 MB** (zero dependencies) | **ESM-only** (`"type": "module"`, load from CJS via `await import('mupdf')`) | Pure WebAssembly — zero native binaries, very fast and crisp `page.toPixmap(...).asPNG()`. | **License blocker for consulting kits.** See AGPL note below. |
| **Headless Chrome / Chromium** | [Chrome Headless Docs](https://developer.chrome.com/docs/automation-and-testing/headless) | Apache-2.0 / BSD | System Chrome/Edge (or ~280 MB bundled) | Via `playwright-core` / CLI | **Poor fit for PDF->PNG:** Chrome's `--screenshot` on a PDF renders the browser PDF viewer UI/single viewport rather than cleanly exporting every page to separate PNGs; per-page rasterization still requires running `pdf.js` inside a browser page. | **Not recommended** for PDF->PNG (use `pdfjs-dist` directly in Node). |

#### Crucial Licensing Note on `mupdf` (AGPL-3.0 vs. Consulting Workflow)

Artifex's official license page ([MuPDF License](https://mupdf.readthedocs.io/en/latest/license.html)) states:
> *"MuPDF is licensed under the GNU AGPL. This is a complex license that allows you to use MuPDF to build your own projects for free, with no warranty and no support. It imposes many conditions on users, including the need to release the full source code for systems built with it... For those users that cannot (or do not want to) comply with the terms of the GNU AGPL, it is also offered under a commercial license."*

While strictly internal CLI execution inside a single company without distributing `qrg-kit` or exposing it over a network does not typically trigger AGPL distribution/remote-interaction clauses, **`qrg-kit/package.json` is currently `"license": "UNLICENSED"` (proprietary)**. If `qrg-kit` is ever shared with a client, distributed to partner consultants, or wrapped into an internal web UI/service, `mupdf` creates immediate copyleft or commercial-licensing liability. Because `pdfjs-dist` (`Apache-2.0`) + `@napi-rs/canvas` (`MIT`) matches `mupdf`'s zero-OS-binary convenience with zero copyleft risk, **`pdfjs-dist` + `@napi-rs/canvas` is the clear winner**.

---

## 3. Offline English Spelling & Grammar Proofing in Pure Node.js (Replacing `word_proof.ps1`)

Because `qrg-kit` already includes `mammoth` and `jszip`, extracting paragraph-level plain text or Markdown from built `.docx` files (excluding raw XML markup while preserving paragraph boundaries) requires zero new parser dependencies.

| Package | Latest Version & Primary Source | Scope | License | Unpacked Size | Node & CJS/ESM | Custom Dictionary & Tuning API | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`harper.js`** *(Automattic)* | `harper.js@3.2.0` ([npm](https://www.npmjs.com/package/harper.js); [Automattic/harper](https://github.com/Automattic/harper) — 17.9k stars; [Node.js Docs](https://writewithharper.com/docs/harperjs/node); [CJS Example](https://github.com/Automattic/harper/blob/master/packages/harper.js/examples/commonjs-simple/index.js); [`Linter.ts`](https://github.com/Automattic/harper/blob/master/packages/harper.js/src/Linter.ts)) | **Spelling AND Grammar** (articles `a`/`an`, agreement, repeated words, punctuation, phrasing — 100% offline Rust/WASM) | **Apache-2.0** | **91.4 MB** (`95.8 MB` decimal — bundles 4 WASM variants: `binary`, `slimBinary`, `binaryInlined`, `slimBinaryInlined`; only 1 loads at runtime) | Pure ESM (`"type": "module"`). Officially documented for CommonJS via `await import('harper.js')` + `await import('harper.js/binary')` (or `slimBinary`) using **`LocalLinter`** *(never `WorkerLinter` in Node)*. | **Rich first-class API:** `importWords(words[])` / `exportWords()` / `clearWords()` for project allowlists (product names & UI labels); `ignoreLint()` / `exportIgnoredLints()` / `importIgnoredLints()` (context-hashed false-positive suppression); `setLintConfig()` to toggle individual rules; `Dialect.American \| British \| Canadian \| Australian \| Indian`; `lint(text, { language: 'plaintext' \| 'markdown' })`. | **Top recommendation.** Only mature, permissively licensed, 100% offline pure-Node engine that replaces **both** Word's spelling AND grammar checks. |
| **`nspell` + `dictionary-en`** | `nspell@2.1.5` ([wooorm/nspell](https://github.com/wooorm/nspell)); `dictionary-en@4.0.0` ([wooorm/dictionaries](https://github.com/wooorm/dictionaries/blob/main/dictionaries/en/readme.md)) | **Spelling ONLY** (no grammar) | `nspell`: **MIT**; `dictionary-en`: **(MIT AND BSD)** | **0.59 MB** combined (42 KB + 575 KB) | `nspell` is CJS; **`dictionary-en@4.0.0` is ESM-only** (`const { default: dict } = await import('dictionary-en')`, exporting `{ aff: Buffer, dic: Buffer }`; note `nspell`'s old README still shows v2 callback syntax). | `spell.add(word)`, `spell.personal(dic)` (Hunspell personal wordlists). **No built-in tokenizer** — caller must split words/contractions/acronyms. | Best lightweight fallback **only** if a ~91 MB `node_modules` footprint is unacceptable and grammar checks are not needed. |
| **`retext-spell`** | `retext-spell@6.1.0` ([retextjs/retext-spell](https://github.com/retextjs/retext-spell)) | **Spelling ONLY** (wraps `nspell` in `unified`/`retext` NLP AST) | **MIT** | 24 KB (+ unified/retext deps, <2 MB total) | **ESM-only** (`await import(...)` from CJS) | Supports `personal` dictionary & `ignore` word arrays, plus built-in English sentence/word tokenization via `retext-english`. | Cleaner than raw `nspell` if you only want spelling, but still zero grammar checking. |
| **`cspell-lib`** | `cspell-lib@10.5.2` ([streetsidesoftware/cspell](https://github.com/streetsidesoftware/cspell/tree/main/packages/cspell-lib)) | **Spelling ONLY** (strong technical/camelCase tokenization) | **MIT** | ~0.6 MB (+ bundled dicts) | **ESM-only**, requires **`node >=22.18.0`** | Project config files, custom wordlists, regex ignores. | Great for technical UI terms, but spell-only and raises Node floor to 22.18+. |
| **`write-good`** | `write-good@1.0.8` ([btford/write-good](https://github.com/btford/write-good)) | Prose **style heuristics only** (passive voice, adverbs, weasel words, clichés) | **MIT** | 42 KB | CJS (`node >=6`) | Boolean rule toggles (`{ passive: false }`). | **Not** a spell or grammar checker; tends to produce noise on concise imperative QRGs. |
| **`alex`** | `alex@11.0.1` ([get-alex/alex](https://github.com/get-alex/alex)) | **Inclusive-language linter only** | **MIT** | 38 KB (+ remark/retext deps) | **ESM-only** | `.alexignore` / rule allowlists. | Orthogonal to spelling & grammar proofing. |

#### `harper.js` Operational Notes for `qrg-kit`

1. **Official CommonJS usage pattern** (from [`Automattic/harper` `examples/commonjs-simple/index.js`](https://github.com/Automattic/harper/blob/master/packages/harper.js/examples/commonjs-simple/index.js)):
   ```js
   const harper = await import("harper.js");
   const { binary } = await import("harper.js/binary"); // or "harper.js/slimBinary"
   const linter = new harper.LocalLinter({ binary, dialect: harper.Dialect.American });
   try {
     await linter.importWords(projectDictionaryWords);
     const lints = await linter.lint(text, { language: "plaintext" });
     // ...map lints to [{ file, kind, text, sentence }]
   } finally {
     await linter.dispose();
   }
   ```
2. **Full `binary` vs `slimBinary`:** Per [`harper-wasm/Cargo.toml`](https://github.com/Automattic/harper/blob/master/harper-wasm/Cargo.toml) and root [`justfile`](https://github.com/Automattic/harper/blob/master/justfile), `slimBinary` is compiled with `--no-default-features`, omitting `typst`, `thesaurus`, and `context-ranking`. For QRG proofing in Node.js, use the full `harper.js/binary` for best context-ranked suggestions (both are already present in the installed npm package).
3. **Early-access API caveat:** Automattic's [Introduction to harper.js](https://writewithharper.com/docs/harperjs/introduction) notes that `harper.js` is still in early access and its API may change across releases — pin an exact version (just like `docx: "8.5.0"`) in `kit/package.json`.

---

## 4. Plain-English Synthesis Matrix & Recommendation

### End-to-End Architecture Comparison

| Architecture | OS Support (Win / Mac / Linux) | Install Footprint | Admin Rights Needed? | Google Docs / Word Layout Fidelity | License Compliance (for Consulting Teams) | Key Trade-Offs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. LibreOffice Headless (Installed or Portable/AppImage) `.docx -> PDF` + `pdfjs-dist`/`@napi-rs/canvas` `PDF -> PNG` + `harper.js` Proofing** *(with optional Word COM fallback on Windows)* | **Full** (Win, macOS Intel/ARM, Linux x64/ARM) | ~213–350 MB download (~700–800 MB unpacked) for LibreOffice + ~165 MB in `node_modules` (`harper.js` + `pdfjs-dist` + `@napi-rs/canvas`) | **No** (PortableApps on Win, `~/Applications` `.dmg` on macOS, AppImage on Linux — subject only to strict corporate AppLocker/Gatekeeper executable allowlists) | **High (Single Source of Truth).** Renders the *exact* `.docx` sent to Google Docs; LibreOffice bundles metric-compatible **Carlito** for Calibri automatically. Minor table/keepNext edge cases should be smoke-tested once per template. | **100% Clean.** LibreOffice (MPL-2.0, invoked as external CLI), `pdfjs-dist` (Apache-2.0), `@napi-rs/canvas` (MIT), `harper.js` (Apache-2.0). Zero AGPL, zero Microsoft licenses. | Requires one-time LibreOffice (or Portable) setup on each consultant's laptop; slightly slower startup than in-process WASM (~1–3s per `.docx`, mitigated by batching or parallel isolated `-env:UserInstallation` profiles). |
| **B. Dual-Render (`.docx` via `docx` + HTML -> `playwright-core` using System Edge/Chrome for PDF) + `pdfjs-dist`/`@napi-rs/canvas` + `harper.js`** | **Full** (Edge pre-installed on Windows; Chrome/Edge common on macOS/Linux) | **~180 MB** total in `node_modules` (0 MB browser download when using system Edge/Chrome) | **No** (reuses corporate-approved Edge or Chrome already installed on laptop) | **Split Truth (Risky for Google Docs review).** HTML->PDF looks crisp, but page breaks and table wrapping **will not match** the `.docx` uploaded to Google Docs; visual QA on PDF PNGs does not inspect `.docx` layout bugs. | **100% Clean.** `playwright-core` (Apache-2.0) + Apache-2.0/MIT stack. | Doubles layout-maintenance burden (OOXML + print CSS) and breaks 1:1 page-number parity between Google Docs review copies and final PDFs. Only attractive if `.docx` is demoted to secondary/reflowable status. |
| **C. Pure-Node WASM (`@matbee/libreoffice-converter` `.docx -> PDF/PNG`) + `harper.js`** | **Full** (wherever Node runs) | **~335 MB** in `node_modules` (242 MB LibreOffice WASM + 91 MB Harper) | **No** (`npm install` only; zero external executables) | **High** (LibreOfficeKit WASM, same layout engine as Option A; needs font verification / `includeSystemFonts: true` or bundled Carlito) | **Check carefully.** `MPL-2.0` declared in npm `package.json`, no repo `LICENSE` file; small third-party maintainer (37 stars). | **Too immature for production today:** ~1 GB RAM per run, no parallel conversion, 37-star single-maintainer package, huge npm install. Worth watching or offering as an experimental fallback, not primary. |
| **D. Pandoc -> Typst / WeasyPrint / LaTeX** | Full (with external TeX/Typst/WeasyPrint binaries) | 50 MB (Typst) to 4+ GB (TeX Live) | Often yes (or manual portable binaries) | **Poor / Disqualified** for `.docx -> PDF`: Pandoc explicitly discards Word layout, `keepNext`, `cantSplit`, fixed widths, callout boxes, and footers. | GPL-2.0 (Pandoc CLI) + Apache-2.0 (Typst) | Wrong tool for rendering `.docx`; only viable if rewriting the entire kit to author in Markdown/Typst instead of `.docx`. |

### Clear Recommendation for `qrg-builder`

Adopt **Architecture A** in three clean, incremental steps:

1. **Replace `pdf_to_png.ps1` immediately (100% pure Node, zero friction):**
   * Switch `render_guides.js` to **`pdfjs-dist` + `@napi-rs/canvas`** (Apache-2.0 + MIT, zero OS binaries, prebuilt Skia N-API bindings across Windows/macOS/Linux).
   * Decide on the Node.js floor first: because Node 20 hit EOL on 2026-04-30, bumping `kit/package.json` to `"node": ">=22.13"` lets you use current `pdfjs-dist@6.x`; if locked corporate laptops still ship Node 20, pin `pdfjs-dist@4.10.38` + `@napi-rs/canvas@1.1.1`. Load `pdfjs-dist/legacy/build/pdf.mjs` via `await import(...)` so `qrg-kit` stays CommonJS.
2. **Replace `word_proof.ps1` immediately (100% pure Node, zero friction):**
   * Extract paragraph text from `.docx` (using already-installed `mammoth` or `jszip` XML walk) and run **`harper.js`** (`LocalLinter` + `harper.js/binary`, Apache-2.0) loaded via `await import(...)`.
   * Feed a per-project custom dictionary (`importWords(...)`) from `qrg.config.json` (or a `dictionary.txt` file) so client product names and UI labels aren't repeatedly flagged, and emit the exact same `{ file, kind, text, sentence }` JSON schema `proof_guides.js` already prints.
3. **Replace `word_render.ps1` with a pluggable renderer defaulting to LibreOffice Headless (with optional Word COM fallback on Windows):**
   * Auto-detect LibreOffice in order: `QRG_SOFFICE` env var / `qrg.config.json` path -> bundled/local PortableApps (`App\libreoffice\program\soffice.com`) or AppImage -> standard OS install path (`soffice.com` on Windows, `/Applications` or `~/Applications` on macOS, `soffice` on Linux) -> optional fallback to `word_render.ps1` on Windows if Microsoft Word is installed and LibreOffice is absent.
   * Always invoke LibreOffice with `--headless --norestore -env:UserInstallation=<fresh temp file URI> --convert-to pdf:writer_pdf_Export --outdir <dir>` so it never collides with open desktop windows.
   * Keep **`Calibri`** as default font (LibreOffice automatically maps it to its bundled metric-compatible **Carlito** via `VCL.xcu`), and run an initial side-by-side visual check on 2–3 representative QRGs to confirm `keepLeadCallouts` and repeating table headers match expectations in Writer.

---

## Primary Sources Cited

* **Node.js Release Schedule:** https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
* **LibreOffice Command-Line Parameters (`--headless`, `-env:UserInstallation`, `soffice.com`):** https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
* **LibreOffice PDF Export CLI Parameters:** https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html
* **LibreOffice Alternative Downloads (Portable & AppImage):** https://www.libreoffice.org/download-other/
* **LibreOffice macOS Installation Instructions:** https://www.libreoffice.org/installation-instructions/#macos
* **LibreOffice Portable (PortableApps.com):** https://portableapps.com/apps/office/libreoffice_portable
* **LibreOffice AppImage (LibreItalia):** https://appimages.libreitalia.org/LibreOffice-latest.basic-x86_64.AppImage
* **AppImage FUSE Troubleshooting (`--appimage-extract-and-run`):** https://docs.appimage.org/user-guide/troubleshooting/fuse.html
* **LibreOffice Font Substitution Table (`VCL.xcu` — Calibri -> Carlito, Arial -> Liberation Sans):** https://github.com/LibreOffice/core/blob/master/officecfg/registry/data/org/openoffice/VCL.xcu
* **LibreOffice Bundled Fonts (`Module_more_fonts.mk` & `ExternalPackage_carlito.mk`):** https://github.com/LibreOffice/core/blob/master/external/more_fonts/Module_more_fonts.mk ; https://github.com/LibreOffice/core/blob/master/external/more_fonts/ExternalPackage_carlito.mk
* **LibreOffice Writer Multi-Page Repeating Header Bug Umbrella (`tdf#138020`):** https://bugs.documentfoundation.org/show_bug.cgi?id=138020
* **Google Fonts — Carlito (OFL, Calibri Metric-Compatible):** https://github.com/googlefonts/carlito/blob/main/README.md ; https://github.com/google/fonts/blob/main/ofl/carlito/METADATA.pb
* **Pandoc Official Manual (Limitations & Creating a PDF):** https://pandoc.org/MANUAL.html ; https://pandoc.org/MANUAL.html#creating-a-pdf
* **ONLYOFFICE Desktop Editors / Core / Conversion API:** https://github.com/ONLYOFFICE/DesktopEditors ; https://github.com/ONLYOFFICE/core ; https://api.onlyoffice.com/docs/docs-api/additional-api/conversion-api
* **Collabora Online:** https://github.com/CollaboraOnline/online ; https://github.com/CollaboraOnline/online/blob/master/COPYING
* **ZetaOffice & `zetajs` (Allotropia LOWA):** https://zetaoffice.net/ ; https://github.com/allotropia/zetajs ; https://github.com/allotropia/zetajs/blob/main/docs/start.md
* **`@matbee/libreoffice-converter`:** https://www.npmjs.com/package/@matbee/libreoffice-converter ; https://github.com/matbeedotcom/libreoffice-document-converter ; https://github.com/matbeedotcom/libreoffice-document-converter/blob/main/docs/API.md
* **`docx-preview` (`VolodymyrBaydalka/docxjs`):** https://github.com/VolodymyrBaydalka/docxjs/blob/master/README.md
* **`mammoth` (`mwilliamson/mammoth.js`):** https://github.com/mwilliamson/mammoth.js/blob/master/README.md
* **Chrome CSS `@page` Margin Boxes (Chrome 131+):** https://developer.chrome.com/blog/print-margins
* **Chrome Headless Mode:** https://developer.chrome.com/docs/automation-and-testing/headless
* **Playwright / `playwright-core` (Browsers, Channels, `Page.pdf`):** https://github.com/microsoft/playwright/blob/main/docs/src/browsers.md ; https://github.com/microsoft/playwright/blob/main/docs/src/api/class-page.md ; https://github.com/microsoft/playwright/blob/main/packages/playwright-core/README.md
* **Puppeteer / `puppeteer-core` (Installation, Configuration, System Requirements):** https://github.com/puppeteer/puppeteer/blob/main/docs/guides/installation.md ; https://github.com/puppeteer/puppeteer/blob/main/docs/guides/configuration.md ; https://github.com/puppeteer/puppeteer/blob/main/docs/guides/system-requirements.md
* **Mozilla `pdf.js` / `pdfjs-dist` (Node PDF-to-PNG Example & Package Metadata):** https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs ; https://www.npmjs.com/package/pdfjs-dist
* **`@napi-rs/canvas` (`Brooooooklyn/canvas`):** https://github.com/Brooooooklyn/canvas ; https://github.com/Brooooooklyn/canvas/blob/main/LICENSE
* **`pdf-to-img` (`k-yle/pdf-to-img`):** https://github.com/k-yle/pdf-to-img/blob/main/README.md
* **`pdf-img-convert` & `unpdf`:** https://www.npmjs.com/package/pdf-img-convert ; https://www.npmjs.com/package/unpdf
* **MuPDF (`mupdf` npm, JS Guide, AGPL/Commercial License):** https://www.npmjs.com/package/mupdf ; https://mupdf.readthedocs.io/en/latest/guide/using-with-javascript.html ; https://mupdf.readthedocs.io/en/latest/license.html
* **`harper.js` (Automattic — Intro, Node.js, CJS Example, `Linter.ts`, `Cargo.toml`, `justfile`):** https://writewithharper.com/docs/harperjs/introduction ; https://writewithharper.com/docs/harperjs/node ; https://github.com/Automattic/harper/blob/master/packages/harper.js/examples/commonjs-simple/index.js ; https://github.com/Automattic/harper/blob/master/packages/harper.js/src/Linter.ts ; https://github.com/Automattic/harper/blob/master/harper-wasm/Cargo.toml ; https://github.com/Automattic/harper/blob/master/justfile
* **`nspell` & `dictionary-en`:** https://github.com/wooorm/nspell/blob/main/readme.md ; https://github.com/wooorm/dictionaries/blob/main/dictionaries/en/readme.md
* **`retext-spell`, `cspell-lib`, `write-good`, `alex`:** https://github.com/retextjs/retext-spell/blob/main/readme.md ; https://github.com/streetsidesoftware/cspell/tree/main/packages/cspell-lib ; https://github.com/btford/write-good/blob/master/README.md ; https://github.com/get-alex/alex/blob/main/readme.md
