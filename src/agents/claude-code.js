"use strict";
// Backend: headless Claude Code (`claude -p`). Agents get read-only tools (Read/Grep/Glob),
// no MCP servers, no user/project settings, deny rules on every quarantined credential
// file, and structured output enforced with --json-schema.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { run, IS_WIN } = require("../util");

function findClaude() {
  if (process.env.LAUNCHCHECK_CLAUDE_BIN) return process.env.LAUNCHCHECK_CLAUDE_BIN;
  const names = IS_WIN ? ["claude.exe", "claude.cmd"] : ["claude"];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (fs.existsSync(p)) return p;
    }
  }
  for (const p of [path.join(os.homedir(), ".local", "bin", IS_WIN ? "claude.exe" : "claude"), path.join(os.homedir(), ".claude", "local", "claude")]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function denyRules(denyReadGlobs) {
  const rules = [];
  for (const g of denyReadGlobs) rules.push(`Read(${g})`);
  return rules;
}

function createClaudeCodeBackend() {
  const bin = findClaude();
  return {
    name: "claude-code",
    capabilities: { tools: true },
    available() {
      return bin ? { ok: true, detail: bin } : { ok: false, detail: "Claude Code CLI not found (set LAUNCHCHECK_CLAUDE_BIN)" };
    },
    async run({ prompt, schema, cwd, readDirs = [], denyReadGlobs = [], model, timeoutMs = 15 * 60 * 1000, budgetUsd, effort }) {
      const args = [
        "-p",
        "--output-format", "json",
        "--tools", "Read,Grep,Glob",
        "--permission-mode", "dontAsk",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--json-schema", JSON.stringify(schema),
      ];
      if (model) args.push("--model", model);
      if (effort) args.push("--effort", effort);
      if (budgetUsd) args.push("--max-budget-usd", String(budgetUsd));
      if (readDirs.length) args.push("--add-dir", ...readDirs);
      const deny = denyRules(denyReadGlobs);
      if (deny.length) args.push("--disallowedTools", ...deny);
      const attempt = async () => {
        const r = await run(bin, args, { cwd, input: prompt, timeoutMs, env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
        let j = null;
        try {
          j = JSON.parse(r.stdout);
        } catch {}
        const meta = {
          backend: "claude-code",
          model: j?.modelUsage ? Object.entries(j.modelUsage).sort((a, b) => (b[1].costUSD || 0) - (a[1].costUSD || 0))[0]?.[0] : model || null,
          costUsd: j?.total_cost_usd ?? null,
          durationMs: r.durationMs,
          turns: j?.num_turns ?? null,
          sessionId: j?.session_id ?? null,
          denials: (j?.permission_denials || []).map((d) => `${d.tool_name}:${d.tool_input?.file_path || d.tool_input?.path || d.tool_input?.pattern || ""}`),
        };
        if (r.timedOut) return { ok: false, error: `agent timed out after ${Math.round(timeoutMs / 60000)} min`, meta };
        if (!j) return { ok: false, error: `no JSON from claude (exit ${r.code}): ${(r.stderr || r.stdout).slice(0, 500)}`, meta };
        if (j.is_error || !j.structured_output) return { ok: false, error: `claude returned ${j.subtype || "error"}${j.api_error_status ? ` (API ${j.api_error_status})` : ""}: ${String(j.result || "").slice(0, 400)}`, meta };
        return { ok: true, output: j.structured_output, meta };
      };
      let res = await attempt();
      if (!res.ok && !/timed out/.test(res.error)) {
        await new Promise((r) => setTimeout(r, 15000));
        const second = await attempt();
        second.meta.retried = true;
        second.meta.firstError = res.error;
        if (res.meta.costUsd) second.meta.costUsd = (second.meta.costUsd || 0) + res.meta.costUsd;
        res = second;
      }
      return res;
    },
  };
}

module.exports = { createClaudeCodeBackend, findClaude };
