// lib/lock.js: a folder lock shared by every script and helper agent on this machine.
//   render: one render at a time on this machine (LibreOffice headless or optional Windows Word COM fallback).
//           Machine-wide: ~/.qrg_kit/render.lock (override with QRG_RENDER_LOCK, for example to share another
//           project's render lock).
//   build:  one live build, or one edit of a shared generator file, at a time per project: <project>/_work/_build.lock.
//           build_qrgs.js takes it for every live build (not for scratch builds).
// A lock older than its stale time is treated as left behind by a crashed run and removed. owner.txt in the lock folder
// says which process holds it.
// scripts/with_lock.js runs a command under a lock and sets QRG_HOLDS_<KIND>_LOCK=1 for it, so a kit script started
// inside it (build_qrgs.js under "build", render_guides.js under "render") does not wait for its own parent.
const fs = require("fs");
const os = require("os");
const path = require("path");

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const heldEnv = (kind) => "QRG_HOLDS_" + kind.toUpperCase() + "_LOCK";

function lockPath(kind, P) {
  if (kind === "render") return process.env.QRG_RENDER_LOCK || path.join(os.homedir(), ".qrg_kit", "render.lock");
  if (kind === "build") return path.join(P.root, "_work", "_build.lock");
  throw new Error("lock kind must be render or build");
}

// acquire(kind, P) waits for the lock and returns a release function (safe to call more than once).
function acquire(kind, P) {
  if (process.env[heldEnv(kind)] === "1") return () => {};
  const lock = lockPath(kind, P), staleMin = kind === "build" ? 15 : 10;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let n = 0;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > staleMin * 60000) {
          console.log("removing stale " + kind + " lock " + lock);
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (e2) { continue; }
      if (n++ % 15 === 0) {
        let who = "";
        try { who = " held by " + fs.readFileSync(path.join(lock, "owner.txt"), "utf8").trim(); } catch (e3) { /* no owner file yet */ }
        console.log("waiting for the " + kind + " lock (" + lock + ")" + who + "...");
      }
      sleep(3000);
    }
  }
  try { fs.writeFileSync(path.join(lock, "owner.txt"), "pid " + process.pid + " since " + new Date().toISOString() + ": " + process.argv.slice(1).join(" ").slice(0, 300)); } catch (e) { /* lock still held */ }
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    process.off("exit", release);
    try { fs.rmSync(lock, { recursive: true, force: true }); } catch (e) { /* already gone */ }
  };
  process.once("exit", release);
  return release;
}

// withLock(kind, P, fn): run a synchronous fn under the lock.
function withLock(kind, P, fn) {
  const release = acquire(kind, P);
  try { return fn(); } finally { release(); }
}

// withLockAsync(kind, P, fn): hold the lock across an async fn and always release it.
async function withLockAsync(kind, P, fn) {
  const release = acquire(kind, P);
  try { return await fn(); } finally { release(); }
}

module.exports = { acquire, withLock, withLockAsync, lockPath, heldEnv, sleep };
