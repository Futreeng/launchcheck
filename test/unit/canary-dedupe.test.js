"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildCanary, judgeCanary, applyCanaryFailure } = require("../../src/verify");
const { dedupe } = require("../../src/report-model");
const { tmpdir, write } = require("./helpers");

function ctx() {
  const root = tmpdir();
  write(root, "routes/a.js", "const r = x;\nrouter.get('/export', (req, res) => res.json(req.user));\n");
  return { target: root, sweepResults: [{ method: "GET", path: "/api/export", status: 401, file: "routes/a.js", line: 2, prefixKnown: true }] };
}
const ok = { checkAll: (l) => ({ valid: l || [], invalid: [] }) };
const bad = { checkAll: (l) => ({ valid: [], invalid: l || [] }) };
const out = (ref, verdict, counter = []) => ({ status: "ok", output: { verdicts: [{ ref, verdict, reasoning: "r", counter_evidence: counter }] } });

test("canary is built from a route the sweep saw return 401, citing its real definition line", () => {
  const c = buildCanary(ctx(), "security", 5);
  assert.equal(c.id, "F-security-5");
  assert.match(c.claim, /GET \/api\/export has no authentication guard/);
  assert.equal(c.evidence[0].quote, "router.get('/export', (req, res) => res.json(req.user));");
});

test("no 401/403 in the sweep -> no canary", () => {
  assert.equal(buildCanary({ ...ctx(), sweepResults: [{ status: 200, file: "routes/a.js", line: 2 }] }, "security", 1), null);
});

test("canary judged: refuted with evidence passes; confirmed fails; refuted without evidence is inconclusive", () => {
  const c = buildCanary(ctx(), "security", 5);
  assert.equal(judgeCanary(c, out(c.id, "refuted", [{ kind: "artifact" }]), ok).status, "passed");
  assert.equal(judgeCanary(c, out(c.id, "confirmed"), ok).status, "FAILED");
  assert.equal(judgeCanary(c, out(c.id, "refuted", [{ kind: "artifact" }]), bad).status, "inconclusive");
  assert.equal(judgeCanary(c, out("F-other", "refuted"), ok).status, "ignored");
});

test("a failed canary downgrades that lens's confirmations to contested", () => {
  const lr = { findings: [{ verification: { verdict: "confirmed" } }, { verification: { verdict: "refuted" } }] };
  applyCanaryFailure(lr);
  assert.equal(lr.findings[0].verification.verdict, "contested");
  assert.equal(lr.findings[1].verification.verdict, "refuted");
});

test("dedupe merges cross-lens findings with overlapping evidence and records corroboration", () => {
  const e = (a, b) => [{ kind: "file", path: "routes/reports.js", line_start: a, line_end: b }];
  const list = [
    { id: "F-security-1", lens: "security", lensTitle: "Security", claim: "GET /api/reports/:id has no ownership check, any user reads any report", evidence: e(27, 31) },
    { id: "F-data-privacy-1", lens: "data-privacy", lensTitle: "Data", claim: "No ownership check on GET /api/reports/:id exposes other users report data", evidence: e(29, 29) },
    { id: "F-cost-1", lens: "cost", lensTitle: "Cost", claim: "Unbounded LLM spend", evidence: e(5, 12) },
    { id: "F-legal-1", lens: "legal", lensTitle: "Legal", claim: "No privacy policy exists while signup collects emails", evidence: e(28, 30) },
  ];
  const d = dedupe(list);
  assert.equal(d.length, 3, "same lines but a different claim must NOT be merged");
  assert.deepEqual(d[0].corroborated_by.map((c) => c.id), ["F-data-privacy-1"]);
});
