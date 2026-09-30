"use strict";
// Read-side helpers shared by the Markdown and HTML renderers.

const VERDICT_LABEL = { NOT_READY: "NOT READY", READY_WITH_CAVEATS: "READY WITH CAVEATS", READY: "READY" };
const VERDICT_PLAIN = {
  NOT_READY: "Not ready. We found problems that should stop this launch, and a second, independent check confirmed them.",
  READY_WITH_CAVEATS: "Ready with caveats. Nothing is confirmed as a launch-stopper, but there are open questions a person has to decide on before shipping.",
  READY: "Ready. No launch-stopping problems were found or left open. This is a recommendation — the go/no-go call is still yours.",
};
const SEV_ORDER = ["critical", "high", "medium", "low", "info"];

function allFindings(rec) {
  const byId = new Map();
  for (const lr of rec.lenses) for (const f of lr.findings || []) byId.set(f.id, { ...f, lensTitle: lr.title, weight: lr.effective_weight });
  return byId;
}

function rankedLive(rec) {
  const byId = allFindings(rec);
  return rec.verdict.ranked.map((id) => byId.get(id)).filter(Boolean);
}

function anchors(f) {
  return (f.evidence || []).map((e) => (e.kind === "file" ? { p: e.path, a: e.line_start, b: e.line_end } : { p: `artifact:${e.artifact_id}`, a: 0, b: 0, x: e.excerpt })).concat((f.probe_results || []).filter((r) => r.artifact_id).map((r) => ({ p: `artifact:${r.artifact_id}`, a: 0, b: 0, x: "*" })));
}

const MAX_SPAN = 20;
function fileAnchors(f) {
  return anchors(f).filter((x) => !x.p.startsWith("artifact:") && x.b - x.a < MAX_SPAN);
}
function overlaps(x, y) {
  return x.p === y.p && x.a <= y.b && y.a <= x.b;
}

// Two findings are the same issue if they share a key, or if MOST of each one's narrow code
// anchors overlap the other's. A single shared line isn't enough: many different issues
// cite the same handler. Broad spans (>20 lines) and shared artifacts never count.
const STOP = new Set("the a an and or of to in on for is are be by with no not any can it its this that from as at into than their has have does via only every all".split(" "));
function words(s) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9/:_.-]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
}
function similarity(s, t) {
  const a = words(s);
  const b = words(t);
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}

// Conservative on purpose: hiding a distinct issue from the summary is worse than showing a
// duplicate. Merge only on an identical key, or when most of each finding's narrow anchors
// overlap AND the claims themselves are substantially similar.
function evidenceOverlap(f, g) {
  const a = fileAnchors(f);
  const b = fileAnchors(g);
  if (!a.length || !b.length) return false;
  const fracA = a.filter((x) => b.some((y) => overlaps(x, y))).length / a.length;
  const fracB = b.filter((y) => a.some((x) => overlaps(x, y))).length / b.length;
  return fracA >= 0.5 && fracB >= 0.5;
}

function sameIssue(f, g) {
  if (f.key && f.key === g.key) return true;
  return evidenceOverlap(f, g) && similarity(f.claim, g.claim) >= 0.2;
}

// Collapse cross-lens duplicates for summaries; each kept item records which other lenses
// independently flagged the same thing (corroboration is itself a signal).
function dedupe(list) {
  const kept = [];
  for (const f of list) {
    const dup = kept.find((g) => g.lens !== f.lens && sameIssue(f, g));
    if (dup) (dup.corroborated_by ||= []).push({ id: f.id, lensTitle: f.lensTitle });
    else kept.push({ ...f });
  }
  return kept;
}

function topIssues(rec, n = 5) {
  return dedupe(rankedLive(rec)).slice(0, n);
}

function haronItems(rec) {
  return dedupe(rankedLive(rec).filter((f) => ["haron", "both"].includes(f.owner)));
}

const CANARY_TEXT = {
  passed: "PASSED — the verifier refuted a planted known-false claim, with counter-evidence",
  inconclusive: "INCONCLUSIVE — the verifier didn't confirm the planted false claim but couldn't refute it either",
  FAILED: "FAILED — the verifier CONFIRMED a planted known-false claim; that lens's confirmations were downgraded to contested",
  ignored: "IGNORED — the verifier skipped the planted claim",
  not_run: "not run",
};
function canaryLine(rec) {
  const c = rec.verifier_canary;
  if (!c) return "not recorded";
  return `${CANARY_TEXT[c.result.status] || c.result.status}${c.lens ? ` (${c.lens} verifier)` : ""}${c.result.status === "not_run" && c.result.detail ? `: ${c.result.detail}` : ""}`;
}

function allUnknowns(rec) {
  return rec.lenses
    .flatMap((lr) => (lr.could_not_verify || []).map((c) => ({ ...c, lensTitle: lr.title, weight: lr.effective_weight })))
    .sort((a, b) => SEV_ORDER.indexOf(a.severity_if_bad) - SEV_ORDER.indexOf(b.severity_if_bad) || (b.weight || 0) - (a.weight || 0));
}

function verdictTag(f) {
  const v = f.verification?.verdict || "unverified";
  return { confirmed: "CONFIRMED", refuted: "REFUTED", contested: "CONTESTED", unverified: "UNVERIFIED" }[v];
}

function oneLine(s, n = 220) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

module.exports = { VERDICT_LABEL, VERDICT_PLAIN, SEV_ORDER, allFindings, rankedLive, haronItems, topIssues, dedupe, sameIssue, evidenceOverlap, canaryLine, allUnknowns, verdictTag, oneLine };
