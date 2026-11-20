// with_lock.js: run one command while holding a lock shared by every script and helper agent (lib/lock.js).
//   build  : one build, or one edit of a shared generator file, at a time in this project (build logs and _archive
//            moves are read-modify-write; two at once can drop each other's entries).
//   render : one hidden Word at a time on this machine (the same lock render_guides.js and proof_guides.js take).
// build_qrgs.js, render_guides.js, and proof_guides.js already take their lock, so this is for the other jobs:
//   node qrg_kit/scripts/with_lock.js build node my_edit_script.js             an edit of a shared file (config, helpers)
//   node qrg_kit/scripts/with_lock.js render powershell.exe -NoProfile -File qrg_kit/tools/word_render.ps1 -In a.docx -Out a.pdf
// Keep each locked job short (a build or render of 4 guides or fewer), so other agents are not kept waiting.
// The command runs with QRG_HOLDS_<KIND>_LOCK=1, so a kit script inside it does not wait for the lock it already has.
const { spawnSync } = require("child_process");
const { loadConfig } = require("../lib/config");
const { withLock, heldEnv } = require("../lib/lock");

const [kind, cmd, ...rest] = process.argv.slice(2);
if (!["build", "render"].includes(kind) || !cmd) { console.error("usage: with_lock.js <build|render> <command> [args...]"); process.exit(2); }
const P = loadConfig();
const r = withLock(kind, P, () => spawnSync(cmd, rest, { stdio: "inherit", env: { ...process.env, [heldEnv(kind)]: "1" } }));
if (r.error) { console.error("could not run " + cmd + ": " + r.error.message); process.exit(1); }
process.exit(r.status == null ? 1 : r.status);
