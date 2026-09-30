"use strict";
// Adversarial verification pass. One independent verifier agent per lens (fresh context,
// different model by default, sees only the claims + evidence — not the lens agent's
// reasoning). Its job is to break claims and to attack "passes" (gaming resistance).
// Merge rules are mechanical so the verifier can't rubber-stamp or wave things away:
//   - refuted without valid counter-evidence  -> contested
//   - claim the verifier didn't answer         -> contested ("not addressed by verifier")
//   - verifier failed entirely                 -> unverified (treated as contested)
//   - pass judged hollow                       -> converted into a finding

const path = require("path");
const { verifierPrompt } = require("./prompts");
const { VERIFIER_OUTPUT } = require("./agents/schemas");
const { readText } = require("./util");

function buildBundle(ctx, findings, passes) {
  // For backends without file tools: cited lines +/- 15 lines, and every artifact cited.
  const seen = new Set();
  const parts = [];
  const add = (e) => {
    if (e.kind === "file") {
      const k = `${e.path}:${e.line_start}`;
      if (seen.has(k)) return;
      seen.add(k);
      const lines = (readText(path.join(ctx.target, e.path)) || "").split(/\r?\n/);
      const lo = Math.max(0, e.line_start - 16);
      const hi = Math.min(lines.length, e.line_end + 15);
      parts.push(`--- ${e.path} lines ${lo + 1}-${hi} ---\n${lines.slice(lo, hi).map((l, i) => `${lo + i + 1}: ${l}`).join("\n")}`);
    } else if (!seen.has(e.artifact_id)) {
      seen.add(e.artifact_id);
      const a = ctx.registry.get(e.artifact_id);
      if (a) parts.push(`--- artifact ${a.id} ---\n${a.text.slice(0, 12000)}`);
    }
  };
  for (const f of [...findings, ...passes]) for (const e of f.evidence || []) add(e);
  const sweep = ctx.registry.get("probe-sweep");
  if (sweep && !seen.has("probe-sweep")) parts.push(`--- artifact probe-sweep ---\n${sweep.text.slice(0, 15000)}`);
  return ctx.redact(parts.join("\n\n"));
}

// Verifier canary: a claim we KNOW is false, built from a route the unauthenticated probe
// sweep saw return 401/403. It's mixed into one verifier's batch with an ordinary-looking id.
// A verifier that confirms it is rubber-stamping, so its confirmations can't be trusted.
function buildCanary(ctx, lensId, n) {
  const hit = (ctx.sweepResults || []).find((r) => [401, 403].includes(r.status) && r.file && r.line > 0 && r.prefixKnown !== false);
  if (!hit) return null;
  const line = (readText(path.join(ctx.target, hit.file)) || "").split(/\r?\n/)[hit.line - 1];
  if (!line || line.trim().length < 6) return null;
  return {
    id: `F-${lensId}-${n}`,
    lens: lensId,
    key: "canary",
    severity: "high",
    confidence: "medium",
    blocking: true,
    claim: `${hit.method} ${hit.path} has no authentication guard: an anonymous request with no token or cookie reaches the handler and gets its data.`,
    why_it_matters: "Anyone on the internet could call it.",
    plain_summary: "canary",
    owner: "joe",
    evidence: [{ kind: "file", path: hit.file, line_start: hit.line, line_end: hit.line, quote: line.trim().slice(0, 150) }],
    probe_results: [],
    canary_truth: `probe-sweep shows ${hit.method} ${hit.path} returned ${hit.status} to an unauthenticated request`,
  };
}

function judgeCanary(canary, verification, validator) {
  if (!canary) return { status: "not_run", detail: "no route returned 401/403 in the unauthenticated sweep, so no known-false claim could be built" };
  if (verification.status !== "ok") return { status: "not_run", detail: "verifier did not complete", claim: canary.claim };
  const v = (verification.output.verdicts || []).find((x) => String(x.ref).trim() === canary.id);
  if (!v) return { status: "ignored", detail: "the verifier did not address the planted false claim", claim: canary.claim, truth: canary.canary_truth };
  let verdict = v.verdict;
  if (verdict === "refuted" && !validator.checkAll(v.counter_evidence || []).valid.length) verdict = "contested";
  const status = verdict === "refuted" ? "passed" : verdict === "confirmed" ? "FAILED" : "inconclusive";
  return { status, verdict, claim: canary.claim, truth: canary.canary_truth, reasoning: v.reasoning };
}

async function verifyLens(lens, ctx, lensResult, backend, opts) {
  const findings = opts.canary ? [...lensResult.findings, opts.canary] : lensResult.findings;
  const passes = lensResult.passes;
  if (!findings.length && !passes.length) return { status: "skipped", reason: "nothing to verify", meta: null };
  const precedents = (ctx.rubric.fp_precedents || []).filter((p) => p.lens === lens.id);
  const bundle = backend.capabilities.tools ? null : buildBundle(ctx, findings, passes);
  const prompt = verifierPrompt(lens, ctx, { findings, passes, precedents, bundle });
  const res = await backend.run({
    prompt,
    schema: VERIFIER_OUTPUT,
    cwd: ctx.target,
    readDirs: [ctx.evidenceDir],
    denyReadGlobs: ctx.denyReadGlobs,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
    budgetUsd: opts.budgetUsd,
  });
  if (!res.ok) return { status: "failed", error: res.error, meta: res.meta };
  return { status: "ok", output: ctx.redactDeep(res.output), meta: res.meta };
}

function mergeVerification(lensResult, verification, validator, lens) {
  const byRef = new Map();
  const passByRef = new Map();
  if (verification.status === "ok") {
    for (const v of verification.output.verdicts || []) byRef.set(String(v.ref).trim(), v);
    for (const p of verification.output.pass_challenges || []) passByRef.set(String(p.ref).trim(), p);
  }
  for (const f of lensResult.findings) {
    if (verification.status !== "ok") {
      f.verification = { verdict: "unverified", reasoning: verification.status === "failed" ? `verifier failed: ${verification.error}` : "not verified", counter_evidence: [] };
      continue;
    }
    const v = byRef.get(f.id);
    if (!v) {
      f.verification = { verdict: "contested", reasoning: "the verifier did not address this claim, so it was never adversarially checked", counter_evidence: [], forced: true };
      continue;
    }
    const counter = validator.checkAll(v.counter_evidence || []);
    let verdict = v.verdict;
    let note = null;
    if (verdict === "refuted" && counter.valid.length === 0) {
      verdict = "contested";
      note = `verifier said "refuted" but its counter-evidence failed validation (${counter.invalid.map((i) => i.reason).join("; ") || "none given"}), so this is contested rather than dismissed`;
    }
    f.verification = {
      verdict,
      reasoning: v.reasoning,
      attempted: v.attempted,
      counter_evidence: counter.valid,
      dropped_counter_evidence: counter.invalid,
      precedent_used: v.precedent_used || null,
      note,
    };
    if (verdict !== "refuted") {
      if (v.adjusted_severity && v.adjusted_severity !== "unchanged" && v.adjusted_severity !== f.severity) {
        f.original_severity = f.severity;
        f.severity = v.adjusted_severity;
      }
      if (v.adjusted_blocking && v.adjusted_blocking !== "unchanged") {
        const b = v.adjusted_blocking === "true";
        if (b !== f.blocking) {
          f.original_blocking = f.blocking;
          f.blocking = b;
        }
      }
    }
  }
  const hollow = [];
  for (const p of lensResult.passes) {
    if (verification.status !== "ok") {
      p.challenge = { verdict: "unverified", reasoning: "verifier did not run" };
      continue;
    }
    const c = passByRef.get(p.id);
    if (!c) {
      p.challenge = { verdict: "contested", reasoning: "the verifier did not address this pass" };
      continue;
    }
    const ev = validator.checkAll(c.evidence || []);
    p.challenge = { verdict: c.verdict, reasoning: c.reasoning, evidence: ev.valid };
    if (c.verdict === "hollow") {
      const evidence = ev.valid.length ? ev.valid : p.evidence;
      hollow.push({
        id: `${p.id}-hollow`,
        lens: lens.id,
        key: `hollow-${p.key}`,
        severity: ["security", "monetization", "functional-tests"].includes(lens.id) ? "high" : "medium",
        confidence: ev.valid.length ? "medium" : "low",
        blocking: false,
        claim: `Claimed as working, but the verifier found the evidence hollow: "${p.claim}" — ${c.reasoning}`,
        why_it_matters: "A green check that doesn't test what it claims hides the real risk (the metric was satisfied, the behavior wasn't verified).",
        plain_summary: `Something reported as working isn't actually proven to work: ${p.claim.slice(0, 140)}`,
        owner: "joe",
        evidence,
        probe_results: [],
        verification: { verdict: "confirmed", reasoning: `raised by the verifier while attacking pass ${p.id}`, counter_evidence: [] },
        origin: "hollow-pass",
      });
    }
  }
  lensResult.findings.push(...hollow);
}

// A verifier that confirmed the known-false claim has shown it rubber-stamps: none of its
// "confirmed" verdicts count as confirmation.
function applyCanaryFailure(lensResult) {
  for (const f of lensResult.findings) {
    if (f.verification?.verdict !== "confirmed") continue;
    f.verification.verdict = "contested";
    f.verification.note = "this lens's verifier CONFIRMED a planted known-false claim (canary), so its confirmations are not trusted; a human must check";
  }
}

module.exports = { verifyLens, mergeVerification, buildBundle, buildCanary, judgeCanary, applyCanaryFailure };
