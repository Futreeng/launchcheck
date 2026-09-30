"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpdir(prefix = "lc-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, rel, text) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

// Built at runtime so no live-looking key is ever committed to this repo.
function fakeLiveStripeKey() {
  return "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc" + "Xz";
}

function sampleRecord(overrides = {}) {
  const f = (id, o) => ({
    id,
    lens: "security",
    key: id.toLowerCase(),
    severity: "high",
    confidence: "high",
    blocking: true,
    claim: `claim ${id} <script>alert(1)</script>`,
    why_it_matters: "because",
    plain_summary: `plain ${id}`,
    owner: "joe",
    evidence: [{ kind: "file", path: "server.js", line_start: 1, line_end: 1, quote: "const x" }],
    probe_results: [],
    verification: { verdict: "confirmed", reasoning: "held", counter_evidence: [] },
    ...o,
  });
  const lenses = [
    {
      lens: "security",
      title: "Security",
      status: "ok",
      rubric_weight: 1,
      effective_weight: 1,
      applicability_score: 1,
      findings: [f("F-security-1"), f("F-security-2", { owner: "haron", blocking: false, severity: "medium", verification: { verdict: "contested", reasoning: "unclear" } })],
      passes: [],
      dropped: [],
      standing: [],
      could_not_verify: [{ lens: "security", question: "prod CORS config?", why: "not in repo", what_would_resolve: "check host", severity_if_bad: "high" }],
    },
  ];
  return {
    schema: 1,
    tool_version: "test",
    run_id: "2026-01-01T00-00-00-000Z-abcdef12",
    started_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 60000,
    target: "/x",
    project: "demo",
    project_slug: "demo",
    git: { sha: "abcdef1234", short: "abcdef12", dirty: false, branch: "main" },
    profile: { type: "saas", stage: "beta", typeSource: "flag", stageSource: "flag", assumptions: [], inference: { type: { reasons: [] }, stage: { reasons: [] } } },
    rubric_version: 1,
    backends: { lens: { name: "claude-code", model_requested: "sonnet" }, verifier: { name: "claude-code", model_requested: "opus" } },
    safety: { quarantined: [".env"] },
    probe: { available: true, command: "node server.js" },
    artifacts: [{ id: "git", title: "Git", summary: "s" }],
    lenses,
    verdict: { verdict: "NOT_READY", reasons: ["x"], ranked: ["F-security-1", "F-security-2"], rules: { a: "b" }, counts: { confirmedBlockers: 1, openBlockers: 0 } },
    cost_usd: 1.23,
    diff: null,
    ...overrides,
  };
}

module.exports = { tmpdir, write, fakeLiveStripeKey, sampleRecord };
