"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { tmpdir, write, sampleRecord } = require("./helpers");

process.env.LAUNCHCHECK_HOME = tmpdir("lc-home-");
const store = require("../../src/store");
const { applyCalibration } = require("../../src/calibrate");
const { processLensOutput } = require("../../src/orchestrator");
const { BY_ID } = require("../../src/categories");
const { makeValidator } = require("../../src/validate");

function project() {
  const root = tmpdir();
  write(root, "server.js", "const x = 1;\napp.listen(3000)\n");
  store.loadRubric(root);
  store.saveRun(root, sampleRecord());
  return root;
}

const reg = { get: () => null };

test("false negative: rubric version bumps, lens weight rises, standing check + lesson recorded", () => {
  const root = project();
  const before = store.loadRubric(root);
  const res = applyCalibration(root, { note: "pilot 10/2", missed: [{ lens: "reliability", text: "Thumbnails on ephemeral disk vanished on redeploy", severity: "high" }] });
  const after = store.loadRubric(root);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.weights.saas.beta.reliability, Math.round((before.weights.saas.beta.reliability + 0.15) * 100) / 100);
  assert.equal(after.standing_checks.length, 1);
  assert.equal(after.standing_checks[0].lens, "reliability");
  assert.match(fs.readFileSync(res.lessons, "utf8"), /Thumbnails on ephemeral disk vanished on redeploy/);
  assert.ok(fs.existsSync(path.join(root, ".launchcheck", "rubric-history", `rubric.v${after.version}.json`)));
  assert.match(res.diff, /reliability/);
  // cross-project: a brand-new project of the same type inherits the delta
  const fresh = store.freshRubric();
  assert.equal(fresh.weights.saas.beta.reliability, after.weights.saas.beta.reliability);
});

test("standing check changes the next run: unreported = could_not_verify; failed with evidence = finding", () => {
  const root = project();
  applyCalibration(root, { missed: [{ lens: "reliability", text: "Health check lies about DB", severity: "high", blocking: true }] });
  const rubric = store.loadRubric(root);
  const lens = BY_ID.reliability;
  const validator = makeValidator({ root, registry: reg, quarantined: [] });
  const silent = processLensOutput(lens, { findings: [], passes: [], standing_checks: [], could_not_verify: [] }, validator, { rubric });
  assert.equal(silent.standing[0].status, "could_not_verify");
  assert.ok(silent.could_not_verify.some((c) => /Standing check SC-001/.test(c.question)));
  const failed = processLensOutput(lens, { findings: [], passes: [], standing_checks: [{ id: "SC-001", status: "fail", note: "still lies", evidence: [{ kind: "file", path: "server.js", line_start: 2, line_end: 2, quote: "app.listen(3000)" }] }], could_not_verify: [] }, validator, { rubric });
  assert.equal(failed.findings.length, 1);
  assert.equal(failed.findings[0].origin, "standing-check");
  assert.equal(failed.findings[0].blocking, true);
  // If the lens already reported the same issue (overlapping evidence), no duplicate finding.
  const ev = { kind: "file", path: "server.js", line_start: 2, line_end: 2, quote: "app.listen(3000)" };
  const both = processLensOutput(lens, { findings: [{ key: "health-lies", severity: "high", confidence: "high", blocking: true, claim: "c", why_it_matters: "w", plain_summary: "p", owner: "joe", evidence: [ev] }], passes: [], standing_checks: [{ id: "SC-001", status: "fail", note: "n", evidence: [ev] }], could_not_verify: [] }, validator, { rubric });
  assert.equal(both.findings.length, 1);
  assert.equal(both.findings[0].standing_check, "SC-001");
});

test("false positive: precedent recorded and the same key is down-ranked next run", () => {
  const root = project();
  applyCalibration(root, { falsePositives: [{ findingId: "F-security-1", reason: "internal-only route behind VPN" }] });
  const rubric = store.loadRubric(root);
  assert.equal(rubric.fp_precedents.length, 1);
  assert.equal(rubric.confidence_multipliers["f-security-1"], 0.7);
  const validator = makeValidator({ root, registry: reg, quarantined: [] });
  const out = processLensOutput(BY_ID.security, { findings: [{ key: "f-security-1", severity: "high", confidence: "high", blocking: true, claim: "c", why_it_matters: "w", plain_summary: "p", owner: "joe", evidence: [{ kind: "file", path: "server.js", line_start: 1, line_end: 1, quote: "const x = 1;" }] }], passes: [], standing_checks: [], could_not_verify: [] }, validator, { rubric });
  assert.equal(out.findings[0].confidence, "medium");
  assert.equal(out.findings[0].original_confidence, "high");
  assert.match(out.findings[0].calibration_note, /false positive before/);
});

test("findings with no valid evidence are dropped, not kept", () => {
  const root = project();
  const rubric = store.loadRubric(root);
  const validator = makeValidator({ root, registry: reg, quarantined: [] });
  const out = processLensOutput(BY_ID.security, { findings: [{ key: "k", severity: "high", confidence: "high", blocking: true, claim: "vibes", why_it_matters: "w", plain_summary: "p", owner: "joe", evidence: [{ kind: "file", path: "server.js", line_start: 1, quote: "try { validate()" }] }], passes: [], standing_checks: [], could_not_verify: [] }, validator, { rubric });
  assert.equal(out.findings.length, 0);
  assert.equal(out.dropped.length, 1);
});
