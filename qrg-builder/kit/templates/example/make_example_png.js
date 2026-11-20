// make_example_png.js: draws the made-up "case page" screenshot used by the example guide (templates/example/guides/01.js).
// It is a drawing, not a real system, so the example carries no client screen or data.
// Usage: node make_example_png.js "<out.png>"
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const out = process.argv[2];
if (!out) { console.error("usage: node make_example_png.js <out.png>"); process.exit(2); }
const W = 1200, H = 760, F = "Arial, Helvetica, sans-serif";
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 15}" fill="${o.fill || "#181818"}"${o.bold ? ' font-weight="bold"' : ""}>${s}</text>`;
const box = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx == null ? 4 : o.rx}" fill="${o.fill || "#ffffff"}" stroke="${o.stroke || "#c9c9c9"}" stroke-width="1"/>`;
const btn = (x, y, w, label, o = {}) => box(x, y, w, 34, { fill: o.fill || "#ffffff", stroke: o.stroke || "#c9c9c9" }) + t(x + 14, y + 22, label, { fill: o.color || "#0b5cab", size: 14, bold: !!o.bold });

let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
s += `<rect width="${W}" height="${H}" fill="#f3f3f3"/>`;
// header and highlights
s += `<rect width="${W}" height="52" fill="#16325c"/>` + t(24, 33, "Case 00001024", { fill: "#ffffff", size: 18, bold: true });
s += box(16, 64, W - 32, 72, { fill: "#ffffff" });
[["Status", "Open"], ["Priority", "Medium"], ["Case Origin", "Phone"], ["Owner", "Case Worker"]].forEach(([k, v], i) => {
  s += t(36 + i * 230, 92, k, { size: 12, fill: "#5c5c5c" }) + t(36 + i * 230, 116, v, { size: 15 });
});
// main card
s += box(16, 146, 728, 598, { fill: "#ffffff" });
[["Details", 36], ["Activity", 150], ["Related", 330]].forEach(([k, x]) => { s += t(x, 182, k, { size: 15, bold: k === "Activity", fill: k === "Activity" ? "#0b5cab" : "#3e3e3c" }); });
s += `<rect x="144" y="192" width="84" height="3" fill="#0b5cab"/><rect x="16" y="195" width="728" height="1" fill="#dddbda"/>`;
s += btn(36, 212, 104, "New Task") + btn(200, 212, 110, "Log a Call") + btn(380, 212, 108, "New Event");
// call form
s += box(36, 266, 688, 330, { fill: "#fafaf9", stroke: "#dddbda" });
s += t(56, 298, "Log a Call", { size: 16, bold: true });
s += t(56, 334, '<tspan fill="#ba0517">*</tspan> Subject', { size: 13, fill: "#3e3e3c" }) + box(56, 342, 640, 36);
s += t(66, 366, "Called about missing documents", { size: 14 });
s += t(56, 408, "Comments", { size: 13, fill: "#3e3e3c" }) + box(56, 416, 640, 110);
s += t(66, 442, "Asked for the signed form. They will upload it this week.", { size: 14 });
s += btn(530, 544, 80, "Cancel") + btn(620, 544, 76, "Save", { fill: "#0b5cab", stroke: "#0b5cab", color: "#ffffff", bold: true });
s += t(36, 640, "Past activity", { size: 15, bold: true }) + `<rect x="36" y="652" width="688" height="1" fill="#dddbda"/>`;
s += t(56, 682, "Email: Sent the document checklist", { size: 14 }) + t(56, 712, "Call: First contact about this case", { size: 14 });
// side card
s += box(760, 146, 424, 300, { fill: "#ffffff" }) + t(780, 182, "Contact", { size: 15, bold: true });
[["Name", "Example Contact"], ["Phone", "(555) 010-0100"], ["Email", "contact@example.com"]].forEach(([k, v], i) => {
  s += t(780, 220 + i * 60, k, { size: 12, fill: "#5c5c5c" }) + t(780, 242 + i * 60, v, { size: 15 });
});
s += "</svg>";
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
sharp(Buffer.from(s)).png().toFile(out).then(() => console.log("wrote " + out)).catch((e) => { console.error(e); process.exit(1); });
