"use strict";
// Ephemeral sandbox: a temp copy of the project (only what git would commit, minus every
// quarantined credential file), dependencies linked read-through, and a scrubbed
// environment with no inherited secrets. Anything launchcheck EXECUTES (tests, the app for
// probing, npm audit) runs here — never in the real project directory.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { mkdirp, IS_WIN } = require("./util");

const MAX_SANDBOX_BYTES = 750 * 1024 * 1024;

function findNodeModulesDirs(root, maxDepth = 3) {
  const found = [];
  (function walk(dir, rel, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === ".git" || e.name === ".launchcheck") continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name === "node_modules") found.push(r);
      else walk(path.join(dir, e.name), r, depth + 1);
    }
  })(root, "", 0);
  return found;
}

function createSandbox(target, files, quarantined, runId) {
  const base = mkdirp(path.join(os.tmpdir(), `launchcheck-${runId}`));
  const app = mkdirp(path.join(base, "app"));
  const q = new Set(quarantined);
  let bytes = 0;
  let copied = 0;
  const skipped = [];
  for (const rel of files) {
    if (q.has(rel)) {
      skipped.push(rel);
      continue;
    }
    const src = path.join(target, rel);
    let st;
    try {
      st = fs.statSync(src);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    bytes += st.size;
    if (bytes > MAX_SANDBOX_BYTES) throw new Error(`project exceeds ${MAX_SANDBOX_BYTES / 1024 / 1024}MB sandbox limit`);
    const dst = path.join(app, rel);
    mkdirp(path.dirname(dst));
    fs.copyFileSync(src, dst);
    copied++;
  }
  // Link installed dependencies instead of copying (can be GBs). Junctions need no admin
  // rights on Windows. Caveat, stated in the report: a test that writes into node_modules
  // would write through to the real one.
  const linked = [];
  for (const rel of findNodeModulesDirs(target)) {
    const dst = path.join(app, rel);
    if (fs.existsSync(dst)) continue;
    mkdirp(path.dirname(dst));
    try {
      fs.symlinkSync(path.join(target, rel), dst, IS_WIN ? "junction" : "dir");
      linked.push(rel);
    } catch {}
  }
  mkdirp(path.join(base, "home"));
  return {
    base,
    dir: app,
    copied,
    bytes,
    linked,
    skippedCredentialFiles: skipped,
    cleanup() {
      // Remove links first so rmSync can never follow them into the real node_modules.
      for (const rel of linked) {
        try {
          fs.unlinkSync(path.join(app, rel));
        } catch {
          try {
            fs.rmdirSync(path.join(app, rel));
          } catch {}
        }
      }
      try {
        fs.rmSync(base, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    },
  };
}

const KEEP_ENV = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "COMSPEC", "ComSpec", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "LANG", "LC_ALL", "TERM", "SystemDrive", "ProgramFiles", "ProgramFiles(x86)", "CommonProgramFiles", "ProgramData"];

// Environment for anything executed in the sandbox: no inherited secrets, fake HOME so the
// user's ~/.npmrc, ~/.aws, cloud CLIs etc. are invisible, and NO dev-bypass flags.
function sandboxEnv(sb, extra = {}) {
  const env = {};
  for (const k of KEEP_ENV) if (process.env[k] !== undefined) env[k] = process.env[k];
  const home = path.join(sb.base, "home");
  const tmp = mkdirp(path.join(sb.base, "tmp"));
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: mkdirp(path.join(home, "AppData", "Roaming")),
    LOCALAPPDATA: mkdirp(path.join(home, "AppData", "Local")),
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
    npm_config_cache: path.join(sb.base, "npm-cache"),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    CI: "1",
    LAUNCHCHECK_SANDBOX: "1",
    NODE_ENV: "development",
  });
  return { ...env, ...extra };
}

module.exports = { createSandbox, sandboxEnv, findNodeModulesDirs };
