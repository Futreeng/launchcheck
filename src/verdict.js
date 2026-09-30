"use strict";
// Deterministic synthesis. The top-line verdict is computed from verified findings by fixed,
// inspectable rules — no LLM writes the verdict, so no LLM can soften it.

const SEV = { critical: 10, high: 6, medium: 3, low: 1, info: 0.3 };
const CONF = { high: 1, medium: 0.7, low: 0.4 };
const SEV_ORDER = ["critical", "high", "medium", "low", "info"];
const MIN_WEIGHT_FOR_BLOCKING = 0.4;

function effectiveWeight(rubricWeight, applicability) {
  const a = typeof applicability === "number" && applicability >= 0 && applicability <= 1 ? applicability : 1;
  // The lens agent can at most halve the rubric weight; it can't argue its own lane away.
  return Math.round(rubricWeight * (0.5 + 0.5 * a) * 100) / 100;
}

function priority(f, w) {
  return Math.round(SEV[f.severity] * CONF[f.confidence] * w * (f.confidence_multiplier ?? 1) * 100) / 100;
}

function isConfirmed(f) {
  return f.verification?.verdict === "confirmed";
}
function isOpen(f) {
  return ["contested", "unverified"].includes(f.verification?.verdict);
}

function computeVerdict(lensResults) {
  const all = [];
  for (const lr of lensResults) for (const f of lr.findings || []) all.push({ f, w: lr.effective_weight, lens: lr });
  const live = all.filter(({ f }) => f.verification?.verdict !== "refuted");
  for (const x of live) x.f.priority = priority(x.f, x.w);

  const counts = (pred) => live.filter(pred);
  const confirmedBlockers = counts(({ f, w }) => f.blocking && isConfirmed(f) && ["critical", "high"].includes(f.severity) && w >= MIN_WEIGHT_FOR_BLOCKING);
  const openBlockers = counts(({ f, w }) => f.blocking && isOpen(f) && w >= MIN_WEIGHT_FOR_BLOCKING);
  const confirmedSerious = counts(({ f, w }) => !f.blocking && isConfirmed(f) && ["critical", "high"].includes(f.severity) && w >= 0.8);
  const failedLenses = lensResults.filter((lr) => lr.status === "failed" && lr.rubric_weight >= 1.0);
  const seriousUnknowns = lensResults.flatMap((lr) => (lr.could_not_verify || []).filter((c) => ["critical", "high"].includes(c.severity_if_bad) && lr.effective_weight >= 1.0).map((c) => ({ ...c, lens: lr.lens })));

  let verdict;
  const reasons = [];
  if (confirmedBlockers.length) {
    verdict = "NOT_READY";
    reasons.push(`${confirmedBlockers.length} blocking issue${confirmedBlockers.length > 1 ? "s" : ""} confirmed by the adversarial verifier`);
    if (openBlockers.length) reasons.push(`${openBlockers.length} more possible blocker(s) still contested`);
  } else if (openBlockers.length || confirmedSerious.length || failedLenses.length || seriousUnknowns.length) {
    verdict = "READY_WITH_CAVEATS";
    if (openBlockers.length) reasons.push(`${openBlockers.length} possible blocker(s) the verifier could neither confirm nor rule out — a human must decide`);
    if (confirmedSerious.length) reasons.push(`${confirmedSerious.length} confirmed high-severity issue(s) that aren't blocking on their own`);
    if (failedLenses.length) reasons.push(`${failedLenses.length} important lens(es) failed to run: ${failedLenses.map((l) => l.lens).join(", ")}`);
    if (seriousUnknowns.length) reasons.push(`${seriousUnknowns.length} high-stakes question(s) could not be verified`);
  } else {
    verdict = "READY";
    reasons.push("no confirmed or contested blockers, no confirmed high-severity issues, and no high-stakes unknowns in heavily weighted lenses");
  }

  const ranked = live.sort((a, b) => (b.f.blocking && !isOpen(b.f) ? 1 : 0) - (a.f.blocking && !isOpen(a.f) ? 1 : 0) || b.f.priority - a.f.priority);
  return {
    verdict,
    reasons,
    counts: {
      confirmedBlockers: confirmedBlockers.length,
      openBlockers: openBlockers.length,
      confirmedSerious: confirmedSerious.length,
      failedLenses: failedLenses.length,
      seriousUnknowns: seriousUnknowns.length,
      findings: all.length,
      refuted: all.length - live.length,
    },
    ranked: ranked.map(({ f }) => f.id),
    rules: {
      NOT_READY: `any blocking finding of critical/high severity that the verifier CONFIRMED, in a lens with effective weight >= ${MIN_WEIGHT_FOR_BLOCKING}`,
      READY_WITH_CAVEATS: "otherwise, if any blocker is contested/unverified, any confirmed critical/high issue exists in a lens weighted >= 0.8, a lens weighted >= 1.0 failed to run, or a critical/high-stakes question could not be verified in a lens weighted >= 1.0",
      READY: "none of the above",
      effective_weight: "rubric weight x (0.5 + 0.5 x lens applicability score)",
      priority: "severity (critical 10, high 6, medium 3, low 1, info 0.3) x confidence (high 1, medium 0.7, low 0.4) x effective weight x calibration confidence multiplier",
    },
  };
}

module.exports = { computeVerdict, effectiveWeight, priority, SEV_ORDER, MIN_WEIGHT_FOR_BLOCKING };
