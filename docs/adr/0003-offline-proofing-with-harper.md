# Offline Spelling and Grammar Proofing with `harper.js` Plus AI Meaning Review

Status: accepted

To eliminate Microsoft Word COM (`word_proof.ps1`) while keeping deterministic, offline spelling and grammar checks even when a teammate runs kit scripts without an AI assistant, `proof_guides.js` will extract text from built `.docx` files and run Automattic's offline Rust/WASM `harper.js` (`Apache-2.0`, loaded via dynamic `import()` from CommonJS) backed by a per-project custom dictionary for approved UI labels and product names. AI agents still read `_work/qa_text_NN.txt` for meaning, clarity, and factual accuracy.

## Considered Options

- **`nspell` + `dictionary-en` (<1 MB)**: Spelling only; misses grammar slips Word previously caught.
- **AI-only proofing (retire `proof_guides.js`)**: Zero extra package size, but non-deterministic and unavailable in standalone CLI workflows.

## Consequences

- Adds ~91 MB unpacked to `node_modules` (4 WASM variants bundled; only 1 loads in memory) and pins an exact `harper.js` version because the package is marked early-access.
- Keeps the advisory `{ file, kind, text, sentence }` output contract so proofing stays fast, offline, and non-blocking while `qa_qrgs.js` remains the hard gate.
