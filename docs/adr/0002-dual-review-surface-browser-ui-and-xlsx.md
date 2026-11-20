# Dual Review Surface: Local Browser Review UI Alongside `.xlsx` OK List Export

Status: accepted

Reviewers need to inspect locked QRGs and record `OK to send` / `Fix before sending` decisions without requiring Microsoft Excel installed, while external clients and managers still expect a familiar spreadsheet handoff. We will provide both a local Browser Review UI (served by a zero-dependency local Node server that displays rendered pages side-by-side and auto-saves picks directly to the project's `review/` folder with zero technical download/JSON jargon) and the existing `.xlsx` OK List export, both backed by one shared pure review-state and carry-forward module validated in the throwaway prototype (`prototype/browser-review-ui`).

## Considered Options

- **`.xlsx` only**: Requires a spreadsheet app locally and breaks local file hyperlinks when uploaded to Google Sheets.
- **Browser Review UI only**: Eliminates spreadsheet sharing for external stakeholders who expect Excel or Google Sheets.

## Consequences

- Both surfaces enforce the exact same Review Lock (`SHA-256`) and carry-forward rules: unlocked or tampered builds cannot be approved, and rebuilt guides reset blank with their earlier call displayed.
- Picks saved in the Browser Review UI can be exported to `.xlsx` or consumed directly by `make_send_copies.js`.
