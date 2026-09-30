"use strict";

const { LENSES } = require("./categories");

const COMPANY = `Futreeng LLC is a two-person company: Joe (lead full-stack: backend, product, AI integration) and Haron (frontend, design, marketing — owns all UI/visual work). There is no QA team, no ops team, no legal team, no security person. Whatever you miss, nobody catches. This project has the same risk as Futreeng's others: things that look fine at the surface and are subtly wrong underneath (silent overwrites, file-lock races, errors from one layer that look identical to errors from another, stale hardcoded lists, state bugs that only affect some code paths).`;

const STAGE_MEANING = {
  concept: "concept — only the team uses it; it's an experiment",
  pilot: "pilot — a handful of known testers will use it",
  beta: "beta — the public can use it, nobody is paying yet",
  ga: "general availability — paying customers will use it",
};

function profileBlock(ctx) {
  const p = ctx.profile;
  return [
    `PROJECT: ${ctx.projectName}  (${ctx.target})`,
    `Git: ${ctx.git.sha ? `${ctx.git.short} on ${ctx.git.branch}${ctx.git.dirty ? ", working tree DIRTY (uncommitted changes are included)" : ""}` : "not a git repo"}`,
    `Type: ${p.type} (${p.typeSource}).  Stage being launched into: ${STAGE_MEANING[p.stage]} (${p.stageSource}).`,
    p.assumptions.length ? `Assumptions in effect: ${p.assumptions.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function artifactIndex(ctx) {
  return ctx.registry
    .index()
    .map((a) => `- ${a.id}: ${a.title} — ${a.summary}\n    file: ${a.file}`)
    .join("\n");
}

const EVIDENCE_RULES = `EVIDENCE RULES — these are enforced MECHANICALLY after you answer. Violating items are deleted automatically, not softened:
- Every finding needs at least one evidence item.
  - kind "file": repo-relative path (forward slashes), line_start, line_end, and quote = EXACT text copied verbatim from within those lines (keep it short, <=200 chars). A quote that is not literally in the file invalidates the evidence.
  - kind "artifact": artifact_id plus excerpt = EXACT text copied verbatim from that artifact file (<=300 chars).
- If you cannot anchor a claim in a file line or an artifact, DO NOT make it. Put the open question in could_not_verify instead. "Error handling looks solid" is not a finding. "8 of 14 async handlers in server/routes/ lack try/catch" is — and must cite the locations (several evidence items).
- Never cite a quarantined credential file; you are denied access to them by design. Don't try to read .env files.
- launchcheck's own .launchcheck/ directory is not evidence.`;

const CALIBRATION_RULES = `SEVERITY, CONFIDENCE AND BLOCKING ARE SEPARATE:
- severity = impact IF the claim is true, calibrated to THIS stage and audience (critical/high/medium/low/info).
- confidence = how sure you are that it IS true (high = you verified it, e.g. probe result or unambiguous code; medium = strong code evidence but untested; low = plausible, needs a human to confirm). High-severity/low-confidence findings are valuable — report them as such, never inflate the confidence.
- blocking = true only if this ALONE should stop launching to the stated audience.
- Be honest, not alarmist. Do not downplay a real risk or wave it off. Do not manufacture blockers from nitpicks either: style issues, missing nice-to-haves and hypothetical-at-this-scale concerns are low/info and never blocking. Both failure modes are measured and penalized by calibration after real launches.`;

function standingChecksBlock(checks) {
  if (!checks.length) return "STANDING CHECKS: none for this lens yet.";
  return [
    "STANDING CHECKS — each was a real miss on this project in the past. You MUST explicitly check every one and report it in standing_checks with its id (pass / fail / could_not_verify, with evidence). If one fails, ALSO report it as a finding.",
    ...checks.map((c) => `- ${c.id}: ${c.text}${c.added ? `  (added ${c.added.slice(0, 10)} after: ${c.source || "calibration"})` : ""}`),
  ].join("\n");
}

function priorBlock(prior) {
  if (!prior || !prior.length) return "PRIOR RUN: none (or no findings from this lens).";
  return [
    "PRIOR RUN — findings this lens reported last time. If the same issue is still present, REUSE its key exactly. If you verify it's fixed, list the key in resolved_prior_keys. Don't carry an issue forward without re-checking the evidence, and don't assume it's fixed without checking.",
    ...prior.map((f) => `- key=${f.key} [${f.severity}${f.blocking ? ", blocking" : ""}; verifier: ${f.verification?.verdict || "n/a"}] ${f.claim.slice(0, 220)}`),
  ].join("\n");
}

const PROBE_RULES = `PROBES (you can test behavior, not just read code): a sandboxed copy of the app is running on localhost (fresh local state, scrubbed environment, NO real API keys or credentials, no dev-bypass flags). You may attach up to 4 probe sequences to a finding. After you answer they are executed for real and the transcripts go to an independent verifier. Use them to TRY the thing you're worried about: request without a token, sign up a free user and call a paid endpoint, read another user's resource, send malformed input.
- steps: method, path (starting with /, no host), optional headers [{name,value}], optional body as a JSON string, optional capture [{var, from:"json:dot.path"}] to reuse values as {{var}} later; {{rand}} is unique per sequence (e.g. "lc{{rand}}@example.test"). Cookies persist between steps.
- secure_expectation: what a correctly-built app returns.
- The probe-sweep artifact already shows what every discovered route returns with no credentials. Read it first.
- Paid third-party calls will fail in the sandbox (no keys) — test whether the GATE refuses before the call, not the call itself.`;

function lensPrompt(lens, ctx, { standingChecks, prior }) {
  const others = LENSES.filter((l) => l.id !== lens.id && ctx.lensIds.includes(l.id)).map((l) => `  - ${l.title}`).join("\n");
  const weight = ctx.weights[lens.id];
  return `You are the "${lens.title}" lens of launchcheck: an internal, adversarial launch-readiness evaluator. You are one of several INDEPENDENT agents; each sees only its own lane so a blind spot in one lane can't be papered over by another.

${COMPANY}

${profileBlock(ctx)}

YOUR LANE — ${lens.question}
What to hunt for:
${lens.hunt.trim()}

Stay in your lane. These other lenses are being evaluated independently — do NOT report their issues:
${others}

Weighting context: the rubric weights this lens ${weight} for a ${ctx.profile.type} project at ${ctx.profile.stage} stage (1.0 = normal). Set applicability_score (0-1) to how much this lens matters for THIS project at THIS stage, and explain in notes_on_downweighting what you deliberately treated as less important and why. That reasoning is shown in the report.

${EVIDENCE_RULES}

${CALIBRATION_RULES}

PASSES: report things that genuinely work, with evidence, in passes. An independent verifier will attack every pass: green checks that don't mean what they claim ("tests pass" but assert nothing, "auth required" but the probe got 200) are converted into findings.

COULD NOT VERIFY: first-class output, not a gap. Every question that matters for this lens that you could not answer from the repo, artifacts, or probes (production config, real traffic, whether validation exists outside the repo, whether a dashboard setting is on) goes here, with what would resolve it. An empty list is suspicious: it usually means overclaiming.

${ctx.probeAvailable && lens.canProbe ? PROBE_RULES : ctx.probeAvailable ? "PROBES: not available to this lens (the probe-sweep artifact is still readable)." : `PROBES: the app could NOT be booted in the sandbox (${ctx.probeUnavailableReason}). Anything you'd have tested at runtime goes in could_not_verify — do not assume it would have passed.`}

${standingChecksBlock(standingChecks)}

${priorBlock(prior)}

EVIDENCE ARTIFACTS (real command output and scans from this run; Read the files):
${artifactIndex(ctx)}

Work efficiently: read the artifacts relevant to you first, then targeted Grep/Read of the code. Aim for roughly 40 tool calls or fewer. Set lens="${lens.id}". owner: "haron" for frontend/design/marketing work, "joe" for backend/infra/product, "both" or "either" otherwise. plain_summary: one sentence a non-technical teammate understands.`;
}

function evidenceLines(evs) {
  return (evs || [])
    .map((e) => (e.kind === "file" ? `      - ${e.path}:${e.line_start}-${e.line_end}  "${e.quote}"` : `      - artifact ${e.artifact_id}: "${e.excerpt}"`))
    .join("\n");
}

function verifierPrompt(lens, ctx, { findings, passes, precedents, bundle }) {
  const claims = findings
    .map((f) => {
      const probes = (f.probe_results || []).map((p) => `    probe "${p.name}" (secure_expectation: ${p.secure_expectation}) — transcript in artifact ${p.artifact_id}:\n${p.transcript.split("\n").map((l) => `      ${l}`).join("\n")}`).join("\n");
      return `[${f.id}] severity=${f.severity} confidence=${f.confidence} blocking=${f.blocking}\n    claim: ${f.claim}\n    why it matters (per the claimant): ${f.why_it_matters}\n    evidence:\n${evidenceLines(f.evidence)}${probes ? `\n${probes}` : ""}`;
    })
    .join("\n\n");
  const passList = passes.map((p) => `[${p.id}] ${p.claim}\n    evidence:\n${evidenceLines(p.evidence)}`).join("\n\n");
  const prec = precedents.length
    ? `CALIBRATION PRECEDENTS — past findings on this project that were flagged but turned out NOT to matter after a real launch. For each claim, check whether the same reasoning applies here. If you rely on one, name it in precedent_used. Don't apply a precedent blindly: the code may have changed.\n${precedents.map((p) => `- ${p.id} (key=${p.key}): flagged "${p.claim.slice(0, 200)}" — turned out fine because: ${p.reason}`).join("\n")}`
    : "CALIBRATION PRECEDENTS: none for this lens.";
  return `You are the ADVERSARIAL VERIFIER for the "${lens.title}" lens of launchcheck. A different agent — whose reasoning you do not see — made the claims below. Your ONLY job is to try to break each one. You are not a reviewer who agrees; a claim survives only if you tried hard to refute it and failed.

${COMPANY}

${profileBlock(ctx)}

For each claim:
1. Re-open the cited evidence yourself. Is the quote what the claim says it is, in context (read the surrounding code, callers, middleware registration order)?
2. Hunt for counter-evidence: a global middleware that guards the route, a check in a caller, config that changes behavior, a test that covers it, a documented decision that makes it intentional and safe, a probe transcript that contradicts the claim.
3. Probe transcripts are real runtime behavior from a sandboxed local copy. Compare them to the secure_expectation. Runtime beats code-reading: if the code "looks" guarded but the probe got a 200 with data, the claim holds; if it looks unguarded but the probe got 401, the claim is refuted. The unauthenticated sweep over all routes is in artifact probe-sweep. The sandbox had no API keys, so upstream failures (5xx from a missing key) don't prove a gate exists.
4. Decide if it matters in context (stage/audience). You may adjust severity/blocking, with the reason.
Verdicts: confirmed = you tried to refute it and the evidence held. refuted = you found concrete counter-evidence; you MUST cite it in counter_evidence (same rules as below) or your refutation is discarded and the claim is marked contested. contested = you can neither cleanly confirm nor refute; say exactly what a human must check.
Do not default to "confirmed" out of politeness, and do not refute without evidence.

THEN ATTACK THE PASSES: each is something the lens agent claimed works. Is it real? Tests that assert nothing meaningful (assert(true), only checking that a mock returns what it was told to), "auth enforced" that a probe contradicts, a lockfile audit that's clean because the lockfile is empty, a health check that can't fail. Verdict holds / hollow / contested, with evidence for hollow.

EVIDENCE RULES (enforced mechanically): file evidence = repo-relative path, line_start, line_end, and quote copied VERBATIM from those lines. Artifact evidence = artifact_id + excerpt copied VERBATIM. Credential files (.env etc.) are quarantined; don't try to read them.

${prec}

CLAIMS TO BREAK:
${claims || "(none)"}

PASSES TO ATTACK:
${passList || "(none)"}
${bundle ? `\nEVIDENCE BUNDLE (you have no file tools; this is the cited code with surrounding context and the artifacts):\n${bundle}` : ""}

EVIDENCE ARTIFACTS for this run:
${artifactIndex(ctx)}

Answer every [F-…] ref in verdicts and every [P-…] ref in pass_challenges. Aim for roughly 40 tool calls or fewer.`;
}

module.exports = { lensPrompt, verifierPrompt, STAGE_MEANING };
