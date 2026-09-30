"use strict";
// Shared helpers. No third-party deps on purpose: this tool must not add supply-chain risk
// to the projects it evaluates, and must not break when npm does.

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const IS_WIN = process.platform === "win32";

function log(phase, msg) {
  const t = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${t}] ${phase.padEnd(9)} ${msg}\n`);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Retry on Windows/OneDrive file locks. Convergence lost data to exactly this race
// (sync client holding a handle during rename), so every write goes through here.
function withLockRetry(fn) {
  let last;
  for (let i = 0; i < 6; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      sleepSync(100 * 2 ** i);
    }
  }
  throw last;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Atomic write: temp file + rename, so a crash mid-write never leaves a truncated file
// that silently replaces good history.
function writeFileAtomic(file, data) {
  mkdirp(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  withLockRetry(() => fs.renameSync(tmp, file));
}

function writeJSON(file, obj) {
  writeFileAtomic(file, JSON.stringify(obj, null, 2) + "\n");
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (fallback !== undefined && e.code === "ENOENT") return fallback;
    if (fallback !== undefined && e instanceof SyntaxError) {
      throw new Error(`Corrupt JSON in ${file}: ${e.message}. Not overwriting it; fix or move it by hand.`);
    }
    throw e;
  }
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

// Run a command, capture everything, never throw. Timeouts kill the whole process tree
// (a bare child.kill() leaves grandchildren alive on Windows when a shell is involved).
function run(cmd, args, opts = {}) {
  const { cwd, env, timeoutMs = 120000, input, shell = false, maxBytes = 20 * 1024 * 1024 } = opts;
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, shell, windowsHide: true, detached: !IS_WIN });
    } catch (e) {
      return resolve({ code: -1, stdout: "", stderr: String(e), timedOut: false, durationMs: 0, spawnError: e.message });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < maxBytes) stdout += d;
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < maxBytes) stderr += d;
    });
    child.on("error", (e) => {
      stderr += `\n[spawn error] ${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code === null ? -1 : code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

// Files that are "the project": tracked + untracked-but-not-ignored. Falls back to a walk
// when the target isn't a git repo.
const WALK_SKIP = new Set(["node_modules", ".git", ".launchcheck", ".next", ".turbo", ".cache", "Library", "Temp", "obj"]);
function listProjectFiles(root) {
  const out = git(root, ["ls-files", "-co", "--exclude-standard", "-z"]);
  if (out !== null) {
    return out
      .split("\0")
      .filter(Boolean)
      .filter((f) => !f.startsWith(".launchcheck/") && !/(^|\/)node_modules\//.test(f))
      .filter((f) => exists(path.join(root, f)));
  }
  const files = [];
  (function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (WALK_SKIP.has(e.name)) continue;
        walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      } else if (e.isFile()) files.push(rel ? `${rel}/${e.name}` : e.name);
    }
  })(root, "");
  return files;
}

// Every file on disk (including ignored ones) except dependency/VCS dirs. Used only to find
// credential files so they can be quarantined.
function listAllFiles(root, maxDepth = 6) {
  const files = [];
  (function walk(dir, rel, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === ".launchcheck") continue;
        walk(path.join(dir, e.name), r, depth + 1);
      } else if (e.isFile()) files.push(r);
    }
  })(root, "", 0);
  return files;
}

function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function readText(file, maxBytes = 1024 * 1024) {
  try {
    const st = fs.statSync(file);
    if (st.size > maxBytes) return null;
    const buf = fs.readFileSync(file);
    if (isProbablyBinary(buf)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function truncate(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

function tail(s, lines) {
  const a = String(s ?? "").split(/\r?\n/);
  return a.length > lines ? `…[${a.length - lines} earlier lines omitted]\n` + a.slice(-lines).join("\n") : a.join("\n");
}

function expand(p) {
  if (typeof p !== "string") return p;
  if (p.startsWith("~/")) return path.join(require("os").homedir(), p.slice(2));
  if (p.startsWith("~")) return require("os").homedir() + p.slice(1);
  return p;
}

function ensureDir(dir) {
  mkdirp(dir);
}

module.exports = {
  IS_WIN,
  log,
  sleepSync,
  withLockRetry,
  mkdirp,
  writeFileAtomic,
  writeJSON,
  readJSON,
  exists,
  slugify,
  stamp,
  toPosix,
  killTree,
  run,
  pool,
  git,
  listProjectFiles,
  listAllFiles,
  readText,
  truncate,
  tail,
  expand,
  ensureDir,
};
