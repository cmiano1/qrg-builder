# Standard US Letter Only and Word-Default Final Release with Optional PDF

Status: accepted

Every QRG produced by the kit must be strictly Standard US Letter (`8.5" × 11"`, `1"` margins, `6.5"` content width)—never A4—so printed pages, screenshot scaling, and client layouts stay uniform across every project. At final release (`make_send_copies.js`), clean-named Send Copies default to Word (`.docx`) because clients expect editable Word deliverables, and the release workflow explicitly asks whether matching PDF copies (generated from the exact locked `.docx`) are also needed.

## Consequences

- `qrg.config.json` / `docx_helpers.js` / `gdocs_lint.js` enforce US Letter as the sole supported page size (rejecting A4 configuration), while `annotate_screenshot.js` reads custom brand `palette.accent` from `qrg.config.json` against the fixed `6.5"` US Letter content width.
- Release staging supports a `--with-pdf` flag (and an explicit confirmation prompt in `SKILL.md`) so matching clean-named `.pdf` Send Copies are staged alongside `.docx` whenever requested.
