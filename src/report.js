"use strict";
// Markdown report (for Joe / Claude Code to work from), run-to-run diff, and re-export of
// the self-contained HTML renderer (for handing to Haron).

const { STAGE_MEANING } = require("./prompts");
const { renderHtml } = require("./html");
const { VERDICT_LABEL, VERDICT_PLAIN, rankedLive, haronItems, topIssues, canaryLine, allUnknowns, verdictTag, oneLine } = require("./report-model");

function ev(e) {
  if (e.kind === "file") return `\`${e.path}:${e.line_start}${e.line_end !== e.line_start ? `-${e.line_end}` : ""}\` — "${oneLine(e.quote)}"${e.relocated_from ? ` _(line corrected from ${e.relocated_from})_` : ""}`;
  return `artifact \`${e.artifact_id}\` — "${oneLine(e.excerpt)}"`;
}

function findingMd(f) {
  const lines = [];
  const sevNote = f.original_severity ? ` (verifier adjusted from ${f.original_severity})` : "";
  const blkNote = f.original_blocking !== undefined ? ` (verifier changed blocking from ${f.original_blocking})` : "";
  lines.push(`#### ${f.id} · ${f.severity.toUpperCase()}${sevNote} · confidence ${f.confidence}${f.original_confidence ? ` (was ${f.original_confidence})` : ""} · ${f.blocking ? "BLOCKING" : "non-blocking"}${blkNote} · ${verdictTag(f)} · owner ${f.owner}`);
  lines.push(`**${f.claim}**`, "");
  lines.push(`_Why it matters:_ ${f.why_it_matters}`);
  lines.push(`_Plain language:_ ${f.plain_summary}`);
  if (f.calibration_note) lines.push(`_Calibration:_ ${f.calibration_note}`);
  if (f.standing_check) lines.push(`_Standing check:_ this is ${f.standing_check} failing again`);
  lines.push("", "Evidence:");
  for (const e of f.evidence || []) lines.push(`- ${ev(e)}`);
  for (const p of f.probe_results || []) lines.push(`- probe "${p.name}" — expected if secure: ${p.secure_expectation}${p.artifact_id ? ` → transcript \`${p.artifact_id}\`` : " (not run)"}`);
  const v = f.verification || {};
  lines.push("", `Verifier (${verdictTag(f)}): ${v.reasoning || "—"}`);
  if (v.attempted) lines.push(`Verifier tried: ${v.attempted}`);
  if (v.note) lines.push(`Note: ${v.note}`);
  if (v.precedent_used) lines.push(`Precedent applied: ${v.precedent_used}`);
  for (const e of v.counter_evidence || []) lines.push(`- counter-evidence: ${ev(e)}`);
  lines.push(`Key: \`${f.key}\``, "");
  return lines.join("\n");
}

function renderMarkdown(rec) {
  const p = rec.profile;
  const live = rankedLive(rec);
  const top = topIssues(rec);
  const unknowns = allUnknowns(rec);
  const haron = haronItems(rec);
  const contested = live.filter((f) => ["contested", "unverified"].includes(f.verification?.verdict));
  const refuted = rec.lenses.flatMap((lr) => (lr.findings || []).filter((f) => f.verification?.verdict === "refuted"));
  const dropped = rec.lenses.flatMap((lr) => (lr.dropped || []).map((d) => ({ ...d, lens: lr.lens })));
  const out = [];
  out.push(`# launchcheck — ${rec.project}`, "");
  out.push(`**Verdict: ${VERDICT_LABEL[rec.verdict.verdict]}** — ${rec.verdict.reasons.join("; ")}.`, "");
  out.push(`${VERDICT_PLAIN[rec.verdict.verdict]}`, "");
  out.push(`| | |`, `|---|---|`);
  out.push(`| Run | \`${rec.run_id}\` (${rec.started_at}, ${Math.round(rec.duration_ms / 60000)} min, ~$${rec.cost_usd} agent cost) |`);
  out.push(`| Commit | ${rec.git.sha ? `\`${rec.git.sha}\` on \`${rec.git.branch}\`${rec.git.dirty ? ` — **DIRTY** (${rec.git.dirtyCount} uncommitted paths included)` : ""}` : "not a git repo"} |`);
  out.push(`| Evaluated for | ${STAGE_MEANING[p.stage]} — stage **${p.stage}** (${p.stageSource}), type **${p.type}** (${p.typeSource}) |`);
  out.push(`| Why that profile | ${[...p.inference.type.reasons, ...p.inference.stage.reasons].join("; ") || "—"} |`);
  if (p.assumptions.length) out.push(`| Assumptions | ${p.assumptions.join(" ")} |`);
  out.push(`| Agents | lenses: ${rec.backends.lens.name} (${rec.backends.lens.model_requested}); verifier: ${rec.backends.verifier.name} (${rec.backends.verifier.model_requested}) |`);
  out.push(`| Runtime probing | ${rec.probe.available ? `yes — sandboxed local copy: ${rec.probe.command}` : `**NO** — ${rec.probe.reason}`} |`);
  out.push(`| Verifier self-check | ${canaryLine(rec)} |`);
  out.push(`| Rubric | v${rec.rubric_version} (.launchcheck/rubric.json) |`, "");

  out.push(`## Top issues`, "");
  if (!top.length) out.push("No live findings.", "");
  top.forEach((f, i) => out.push(`${i + 1}. **[${f.severity}${f.blocking ? ", blocking" : ""}, ${verdictTag(f).toLowerCase()}]** ${f.plain_summary} _(${f.lensTitle}; ${f.id}${f.corroborated_by ? `; independently also flagged by ${f.corroborated_by.map((c) => c.lensTitle).join(", ")}` : ""})_`));
  out.push("");

  out.push(`## Waiting on Haron (frontend / design / marketing)`, "");
  if (haron.length) haron.forEach((f) => out.push(`- **[${f.severity}${f.blocking ? ", blocking" : ""}, ${verdictTag(f).toLowerCase()}]** ${f.plain_summary} _(${f.id})_`));
  else out.push(rec.lenses.find((l) => l.lens === "design-completion")?.status === "ok" ? "Nothing in this run is waiting on frontend/design work." : "The design-completion lens did not run successfully, so this is **unknown**, not clear.");
  out.push("");

  out.push(`## Could not verify (${unknowns.length})`, "");
  out.push("These are real gaps in what this run knows, not passes. Each one is a question a human has to answer.", "");
  if (!unknowns.length) out.push("_None reported — treat that as suspicious: it usually means something is being overclaimed._");
  for (const c of unknowns) {
    out.push(`- **[${c.severity_if_bad} if bad]** ${c.question} — _${c.why}_ → to resolve: ${c.what_would_resolve} _(${c.lensTitle})_`);
  }
  out.push("");

  out.push(`## Contested (${contested.length})`, "");
  out.push("The verifier could neither confirm nor refute these. They are neither passes nor confirmed problems.", "");
  for (const f of contested) out.push(`- **${f.id}** [${f.severity}${f.blocking ? ", blocking" : ""}] ${oneLine(f.claim, 300)} — _verifier: ${oneLine(f.verification?.note || f.verification?.reasoning, 300)}_`);
  out.push("");

  if (rec.diff) {
    const d = rec.diff;
    out.push(`## Since last run (${d.previous_run_id})`, "");
    out.push(`Verdict: ${VERDICT_LABEL[d.verdict.from]} → ${VERDICT_LABEL[d.verdict.to]}. Commit: ${d.commit.from || "?"} → ${d.commit.to || "?"}. Unknowns: ${d.unknowns.from} → ${d.unknowns.to}.`, "");
    for (const [label, list] of [["New", d.new], ["Resolved", d.resolved], ["Still present", d.persisting], ["Severity changed", d.changed], ["Can't tell (lens didn't run in one of the runs)", d.unknown]]) {
      if (!list.length) continue;
      out.push(`**${label} (${list.length})**`);
      for (const x of list) out.push(`- \`${x.lens}/${x.key}\` ${x.detail || ""}`);
      out.push("");
    }
  }

  out.push(`## Lenses and weighting`, "");
  out.push(`| Lens | Status | Rubric weight | Applicability | Effective | Findings | Unknowns | Verifier |`, `|---|---|---|---|---|---|---|---|`);
  for (const lr of rec.lenses) {
    out.push(`| ${lr.title} | ${lr.status}${lr.error ? `: ${oneLine(lr.error, 80)}` : ""} | ${lr.rubric_weight} | ${lr.applicability_score ?? "—"} | ${lr.effective_weight} | ${(lr.findings || []).length} | ${(lr.could_not_verify || []).length} | ${lr.verification?.status || "—"}${lr.verification?.meta?.model ? ` (${lr.verification.meta.model})` : ""} |`);
  }
  out.push("");
  const down = rec.lenses.filter((lr) => lr.effective_weight < 0.7);
  if (down.length) {
    out.push(`**Downweighted lenses** (effective weight < 0.7) and why:`, "");
    for (const lr of down) out.push(`- **${lr.title}** (${lr.effective_weight}): ${lr.notes_on_downweighting || lr.applicability_reason || "—"}`);
    out.push("");
  }

  out.push(`## All live findings, by priority`, "");
  for (const f of live) out.push(findingMd(f));

  const standing = rec.lenses.flatMap((lr) => lr.standing || []);
  out.push(`## Standing checks from past calibration (${standing.length})`, "");
  if (!standing.length) out.push("None yet. They're added by `launchcheck calibrate` when a real launch/incident shows the tool missed something.");
  for (const s of standing) out.push(`- **${s.id}** ${s.status.toUpperCase()} — ${s.text} — _${s.note}_${(s.evidence || []).map((e) => `\n  - ${ev(e)}`).join("")}`);
  out.push("");

  out.push(`## Passes and how they held up`, "");
  for (const lr of rec.lenses) for (const p of lr.passes || []) out.push(`- **${p.id}** [${(p.challenge?.verdict || "unverified").toUpperCase()}] ${p.claim} — _${oneLine(p.challenge?.reasoning, 240)}_`);
  out.push("");

  out.push(`## Refuted by the verifier (${refuted.length})`, "");
  for (const f of refuted) {
    out.push(`- **${f.id}** [${f.severity}] ${oneLine(f.claim, 260)} — _${oneLine(f.verification.reasoning, 300)}_`);
    for (const e of f.verification.counter_evidence || []) out.push(`  - counter-evidence: ${ev(e)}`);
  }
  out.push("");

  out.push(`## Dropped claims (no verifiable evidence) (${dropped.length})`, "");
  out.push("Claims whose every citation failed mechanical validation (file/line/quote didn't match, or artifact excerpt not found). Listed for transparency; not counted.", "");
  for (const d of dropped) out.push(`- ${d.lens}: ${oneLine(d.claim, 200)} — ${[...new Set(d.dropped_reasons)].join("; ")}`);
  out.push("");

  out.push(`## Evidence artifacts`, "");
  for (const a of rec.artifacts) out.push(`- \`${a.id}\` — ${a.title}: ${a.summary}`);
  out.push("", `Full artifact files: \`.launchcheck/runs/${rec.run_id}/evidence/\``, "");

  out.push(`## How the verdict is computed`, "");
  for (const [k, v] of Object.entries(rec.verdict.rules)) out.push(`- **${k}**: ${v}`);
  out.push("", "_launchcheck proposes; a human decides. It never deploys, fixes, or touches production._", "");
  return out.join("\n");
}

function keyMap(rec) {
  const m = new Map();
  for (const lr of rec.lenses) for (const f of lr.findings || []) if (f.verification?.verdict !== "refuted") m.set(`${lr.lens}/${f.key}`, { lens: lr.lens, key: f.key, f });
  return m;
}

function diffRuns(prev, cur) {
  const a = keyMap(prev);
  const b = keyMap(cur);
  const okPrev = new Set(prev.lenses.filter((l) => l.status === "ok").map((l) => l.lens));
  const okCur = new Set(cur.lenses.filter((l) => l.status === "ok").map((l) => l.lens));
  const d = { previous_run_id: prev.run_id, verdict: { from: prev.verdict.verdict, to: cur.verdict.verdict }, commit: { from: prev.git?.short, to: cur.git?.short }, new: [], resolved: [], persisting: [], changed: [], unknown: [] };
  for (const [k, x] of b) {
    if (!a.has(k)) {
      if (!okPrev.has(x.lens)) d.unknown.push({ lens: x.lens, key: x.key, detail: "present now; lens didn't run last time" });
      else d.new.push({ lens: x.lens, key: x.key, detail: `[${x.f.severity}] ${oneLine(x.f.claim, 140)}` });
    } else {
      const p = a.get(k).f;
      d.persisting.push({ lens: x.lens, key: x.key, detail: `[${x.f.severity}]` });
      if (p.severity !== x.f.severity) d.changed.push({ lens: x.lens, key: x.key, detail: `${p.severity} → ${x.f.severity}` });
    }
  }
  for (const [k, x] of a) {
    if (b.has(k)) continue;
    if (!okCur.has(x.lens) || !cur.lenses.some((l) => l.lens === x.lens)) d.unknown.push({ lens: x.lens, key: x.key, detail: "was present; lens didn't run this time — NOT resolved" });
    else d.resolved.push({ lens: x.lens, key: x.key, detail: `[was ${x.f.severity}] ${oneLine(x.f.claim, 140)}` });
  }
  const unk = (r) => r.lenses.reduce((s, l) => s + (l.could_not_verify || []).length, 0);
  d.unknowns = { from: unk(prev), to: unk(cur) };
  return d;
}

function renderDiffText(d) {
  const lines = [`Compared with ${d.previous_run_id}`, `Verdict: ${VERDICT_LABEL[d.verdict.from]} -> ${VERDICT_LABEL[d.verdict.to]}`, `Commit: ${d.commit.from} -> ${d.commit.to}`, `Could-not-verify items: ${d.unknowns.from} -> ${d.unknowns.to}`, ""];
  for (const [label, list] of [["NEW", d.new], ["RESOLVED", d.resolved], ["STILL PRESENT", d.persisting], ["SEVERITY CHANGED", d.changed], ["UNKNOWN (lens missing from a run)", d.unknown]]) {
    lines.push(`${label} (${list.length})`);
    for (const x of list) lines.push(`  ${x.lens}/${x.key} ${x.detail || ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = { renderMarkdown, renderHtml, diffRuns, renderDiffText };
