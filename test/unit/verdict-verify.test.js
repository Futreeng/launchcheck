"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { computeVerdict, effectiveWeight } = require("../../src/verdict");
const { mergeVerification } = require("../../src/verify");

const F = (o) => ({ id: "F-x-1", key: "k", severity: "high", confidence: "high", blocking: true, claim: "c", evidence: [{ kind: "file" }], verification: { verdict: "confirmed" }, ...o });
const L = (findings, o = {}) => ({ lens: "security", status: "ok", rubric_weight: 1, effective_weight: 1, findings, could_not_verify: [], ...o });

test("a confirmed high blocker means NOT_READY", () => {
  assert.equal(computeVerdict([L([F()])]).verdict, "NOT_READY");
});

test("a contested blocker caps at READY_WITH_CAVEATS, never READY", () => {
  assert.equal(computeVerdict([L([F({ verification: { verdict: "contested" } })])]).verdict, "READY_WITH_CAVEATS");
});

test("refuted findings don't count", () => {
  assert.equal(computeVerdict([L([F({ verification: { verdict: "refuted" } })])]).verdict, "READY");
});

test("a blocker in a heavily downweighted lens doesn't block", () => {
  assert.equal(computeVerdict([L([F()], { effective_weight: 0.2, rubric_weight: 0.2 })]).verdict, "READY");
});

test("a failed important lens prevents READY", () => {
  assert.equal(computeVerdict([L([], { status: "failed", rubric_weight: 1.3 })]).verdict, "READY_WITH_CAVEATS");
});

test("high-stakes unknowns in a weighted lens prevent READY", () => {
  const lr = L([], { could_not_verify: [{ question: "q", severity_if_bad: "critical" }] });
  assert.equal(computeVerdict([lr]).verdict, "READY_WITH_CAVEATS");
});

test("the lens agent can at most halve the rubric weight", () => {
  assert.equal(effectiveWeight(1.4, 0), 0.7);
  assert.equal(effectiveWeight(1.4, 1), 1.4);
});

const okValidator = { checkAll: (list) => ({ valid: list || [], invalid: [] }) };
const badValidator = { checkAll: (list) => ({ valid: [], invalid: (list || []).map((e) => ({ evidence: e, reason: "quote not found" })) }) };

test("verifier 'refuted' without valid counter-evidence becomes contested", () => {
  const lr = { findings: [F({ verification: undefined })], passes: [] };
  mergeVerification(lr, { status: "ok", output: { verdicts: [{ ref: "F-x-1", verdict: "refuted", reasoning: "nah", attempted: "looked", adjusted_severity: "unchanged", adjusted_blocking: "unchanged", counter_evidence: [{ kind: "file", path: "x", quote: "made up" }] }], pass_challenges: [] } }, badValidator, { id: "security" });
  assert.equal(lr.findings[0].verification.verdict, "contested");
});

test("claims the verifier ignores are contested, and a failed verifier leaves them unverified", () => {
  const a = { findings: [F({ verification: undefined })], passes: [] };
  mergeVerification(a, { status: "ok", output: { verdicts: [], pass_challenges: [] } }, okValidator, { id: "security" });
  assert.equal(a.findings[0].verification.verdict, "contested");
  const b = { findings: [F({ verification: undefined })], passes: [] };
  mergeVerification(b, { status: "failed", error: "boom" }, okValidator, { id: "security" });
  assert.equal(b.findings[0].verification.verdict, "unverified");
});

test("a pass judged hollow becomes a finding", () => {
  const lr = { findings: [], passes: [{ id: "P-functional-tests-1", key: "billing-tests", claim: "billing is tested", evidence: [{ kind: "file" }] }] };
  mergeVerification(lr, { status: "ok", output: { verdicts: [], pass_challenges: [{ ref: "P-functional-tests-1", verdict: "hollow", reasoning: "assert.ok(true)", evidence: [{ kind: "file" }] }] } }, okValidator, { id: "functional-tests" });
  assert.equal(lr.findings.length, 1);
  assert.equal(lr.findings[0].key, "hollow-billing-tests");
  assert.equal(lr.findings[0].severity, "high");
});
