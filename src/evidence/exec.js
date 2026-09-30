"use strict";
// Things that execute: the project's own test suite and `npm audit`. Both run inside the
// sandbox with a scrubbed environment, never in the real project directory.

const path = require("path");
const { run, readJSON, tail, truncate } = require("../util");
const { sandboxEnv } = require("../sandbox");

// npm is a .cmd shim on Windows, which needs a shell. Commands are fixed strings (no user
// input), passed as one command line so Node does not warn about unescaped args (DEP0190).
function npm(args, opts) {
  return run(`npm ${args.join(" ")}`, [], { ...opts, shell: true });
}

function testTargets(sandboxDir, files) {
  return files
    .filter((f) => /(^|\/)package\.json$/.test(f) && f.split("/").length <= 3)
    .map((f) => ({ rel: path.posix.dirname(f), json: readJSON(path.join(sandboxDir, f), null) }))
    .filter((p) => p.json?.scripts?.test && !/no test specified/.test(p.json.scripts.test));
}

async function runTests(sb, files, { timeoutMs = 300000 } = {}) {
  const artifacts = [];
  const targets = testTargets(sb.dir, files);
  if (!targets.length) {
    artifacts.push({ id: "tests-none", title: "Test suite execution", summary: "no package.json declares a real test script — nothing to run", content: "No package.json (depth <= 2) has a scripts.test other than npm's default placeholder." });
    return artifacts;
  }
  for (const t of targets) {
    const cwd = path.join(sb.dir, t.rel);
    const id = `tests-${t.rel === "." ? "root" : t.rel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const r = await npm(["test"], { cwd, env: sandboxEnv(sb, { NODE_ENV: "test" }), timeoutMs });
    const out = `${r.stdout}\n--- stderr ---\n${r.stderr}`;
    const verdict = r.timedOut ? `TIMED OUT after ${Math.round(timeoutMs / 1000)}s` : r.code === 0 ? "PASSED (exit 0)" : `FAILED (exit ${r.code})`;
    artifacts.push({
      id,
      title: `Test suite execution: ${t.rel === "." ? "(root)" : t.rel} — npm test`,
      command: `npm test   (cwd: sandbox copy of ${t.rel}; script: ${t.json.scripts.test})`,
      exitCode: r.code,
      durationMs: r.durationMs,
      summary: `${verdict} in ${Math.round(r.durationMs / 1000)}s — script: ${t.json.scripts.test}`,
      content: `result: ${verdict}\n\n` + truncate(tail(out, 600), 150000),
    });
  }
  return artifacts;
}

async function runAudit(sb, files) {
  const artifacts = [];
  const dirs = files.filter((f) => /(^|\/)package-lock\.json$/.test(f) && f.split("/").length <= 3).map((f) => path.posix.dirname(f));
  if (!dirs.length) {
    artifacts.push({ id: "npm-audit-none", title: "npm audit", summary: "no package-lock.json found — dependency vulnerabilities NOT checked", content: "npm audit requires a lockfile. None found at depth <= 2." });
    return artifacts;
  }
  for (const rel of dirs) {
    const cwd = path.join(sb.dir, rel);
    const lock = readJSON(path.join(cwd, "package-lock.json"), null);
    const lockCount = Object.keys(lock?.packages || {}).length - 1;
    const id = `npm-audit-${rel === "." ? "root" : rel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const parts = [`lockfile: ${rel}/package-lock.json with ${lockCount} locked packages${lockCount <= 0 ? " — EMPTY LOCKFILE: a clean audit here proves nothing" : ""}`, ""];
    let summary = "";
    let exitCode = null;
    for (const [label, args] of [
      ["production dependencies (--omit=dev)", ["audit", "--json", "--omit=dev"]],
      ["all dependencies", ["audit", "--json"]],
    ]) {
      const r = await npm(args, { cwd, env: sandboxEnv(sb), timeoutMs: 90000 });
      exitCode ??= r.code;
      let j = null;
      try {
        j = JSON.parse(r.stdout);
      } catch {}
      if (!j || j.error) {
        parts.push(`## ${label}: AUDIT FAILED (exit ${r.code}${r.timedOut ? ", timed out" : ""}) — vulnerabilities NOT checked`, truncate(r.stdout + r.stderr, 3000), "");
        summary ||= `audit FAILED for ${rel} — not checked`;
        continue;
      }
      const v = j.metadata?.vulnerabilities || {};
      const line = `critical=${v.critical || 0} high=${v.high || 0} moderate=${v.moderate || 0} low=${v.low || 0} total=${v.total || 0}`;
      parts.push(`## ${label}: ${line}`);
      for (const [name, info] of Object.entries(j.vulnerabilities || {})) {
        const via = (info.via || []).map((x) => (typeof x === "string" ? `via ${x}` : `${x.title || x.name} (${x.url || ""})`)).join("; ");
        parts.push(`  ${info.severity.toUpperCase()} ${name} ${info.range || ""} ${info.isDirect ? "[direct]" : "[transitive]"} fix=${info.fixAvailable ? (typeof info.fixAvailable === "object" ? `${info.fixAvailable.name}@${info.fixAvailable.version}${info.fixAvailable.isSemVerMajor ? " (major)" : ""}` : "yes") : "no"} — ${via}`);
      }
      parts.push("");
      if (label.startsWith("production")) summary = `${rel}: prod deps ${line}`;
    }
    artifacts.push({ id, title: `npm audit: ${rel}`, command: `npm audit --json [--omit=dev]   (cwd: sandbox copy of ${rel})`, exitCode, summary: summary + (lockCount <= 0 ? " (EMPTY lockfile)" : ""), content: parts.join("\n") });
  }
  return artifacts;
}

module.exports = { runTests, runAudit };
