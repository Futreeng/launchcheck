"use strict";
// Self-contained HTML report: one file, all CSS inline, NO JavaScript, no external requests
// (no fonts, images, or scripts), so it renders identically when double-clicked, emailed,
// or dropped in Slack. The top is written for a non-technical reader; everything technical
// (including the raw evidence artifacts) is embedded below in collapsed <details>.

const { STAGE_MEANING } = require("./prompts");
const { VERDICT_LABEL, VERDICT_PLAIN, rankedLive, haronItems, topIssues, canaryLine, allUnknowns, verdictTag, oneLine } = require("./report-model");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const PLAIN_SEV = (f) => (f.blocking ? "Launch-stopper" : f.severity === "critical" || f.severity === "high" ? "Serious" : f.severity === "medium" ? "Worth fixing" : "Minor");
const PLAIN_STATUS = { confirmed: "Double-checked", contested: "Needs a human to check", unverified: "Needs a human to check", refuted: "Ruled out" };
const PLAIN_UNKNOWN_SEV = { critical: "could stop the launch", high: "could be serious", medium: "worth knowing", low: "minor", info: "minor" };

function tag(text, cls) {
  return `<span class="tag ${cls}">${esc(text)}</span>`;
}

function statusTag(f) {
  const v = f.verification?.verdict || "unverified";
  return tag(PLAIN_STATUS[v], v === "confirmed" ? "t-ok" : v === "refuted" ? "t-muted" : "t-warn");
}

function sevTag(f) {
  const s = PLAIN_SEV(f);
  return tag(s, s === "Launch-stopper" ? "t-bad" : s === "Serious" ? "t-bad2" : s === "Worth fixing" ? "t-warn" : "t-muted");
}

function evHtml(e) {
  if (e.kind === "file") return `<li><code>${esc(e.path)}:${e.line_start}${e.line_end !== e.line_start ? `-${e.line_end}` : ""}</code> <q>${esc(oneLine(e.quote, 300))}</q></li>`;
  return `<li>artifact <a href="#art-${esc(e.artifact_id)}"><code>${esc(e.artifact_id)}</code></a> <q>${esc(oneLine(e.excerpt, 300))}</q></li>`;
}

function findingHtml(f) {
  const v = f.verification || {};
  return `<div class="finding">
  <div class="fhead"><code>${esc(f.id)}</code> ${tag(f.severity.toUpperCase() + (f.original_severity ? ` (was ${f.original_severity})` : ""), "t-plain")} ${tag(`confidence ${f.confidence}`, "t-plain")} ${tag(f.blocking ? "BLOCKING" : "non-blocking", f.blocking ? "t-bad" : "t-plain")} ${tag(verdictTag(f), v.verdict === "confirmed" ? "t-ok" : v.verdict === "refuted" ? "t-muted" : "t-warn")} ${tag(`owner: ${f.owner}`, "t-plain")}</div>
  <p class="claim">${esc(f.claim)}</p>
  <p><em>Why it matters:</em> ${esc(f.why_it_matters)}</p>
  ${f.calibration_note ? `<p><em>Calibration:</em> ${esc(f.calibration_note)}</p>` : ""}
  <div class="sub">Evidence</div><ul class="ev">${(f.evidence || []).map(evHtml).join("")}${(f.probe_results || []).map((p) => `<li>probe <q>${esc(p.name)}</q> — secure would be: ${esc(p.secure_expectation)} ${p.artifact_id ? `→ <a href="#art-${esc(p.artifact_id)}"><code>${esc(p.artifact_id)}</code></a>` : "(not run)"}</li>`).join("")}</ul>
  <div class="sub">Adversarial verifier: ${esc(verdictTag(f))}</div>
  <p>${esc(v.reasoning || "—")}</p>
  ${v.attempted ? `<p class="muted"><em>Tried:</em> ${esc(v.attempted)}</p>` : ""}
  ${v.note ? `<p class="muted"><em>Note:</em> ${esc(v.note)}</p>` : ""}
  ${v.precedent_used ? `<p class="muted"><em>Precedent applied:</em> ${esc(v.precedent_used)}</p>` : ""}
  ${(v.counter_evidence || []).length ? `<ul class="ev">${v.counter_evidence.map(evHtml).join("")}</ul>` : ""}
  <p class="muted">key <code>${esc(f.key)}</code></p>
</div>`;
}

const CSS = `
:root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1a;--muted:#62625d;--line:#e3e2dd;--bad:#b42318;--bad-bg:#fdeceb;--bad2:#c4320a;--warn:#93370d;--warn-bg:#fef4e6;--ok:#067647;--ok-bg:#e8f6ee;--h:#5925dc;--h-bg:#f2effd;--code:#f0efeb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--card:#1e1e1c;--ink:#ecebe6;--muted:#a3a29b;--line:#34332f;--bad:#ff8f84;--bad-bg:#3b1a17;--bad2:#ff9c66;--warn:#fdb562;--warn-bg:#3a2a14;--ok:#6ce0a4;--ok-bg:#12301f;--h:#b9a6ff;--h-bg:#26203d;--code:#2a2a27}}
:root[data-theme="dark"]{--bg:#141413;--card:#1e1e1c;--ink:#ecebe6;--muted:#a3a29b;--line:#34332f;--bad:#ff8f84;--bad-bg:#3b1a17;--bad2:#ff9c66;--warn:#fdb562;--warn-bg:#3a2a14;--ok:#6ce0a4;--ok-bg:#12301f;--h:#b9a6ff;--h-bg:#26203d;--code:#2a2a27}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:880px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:1.5rem;margin:0 0 4px}
h2{font-size:1.15rem;margin:34px 0 10px}
h3{font-size:1rem;margin:22px 0 8px}
.meta{color:var(--muted);font-size:.9rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:14px 0}
.verdict{border-left:8px solid var(--c);background:var(--card)}
.verdict .label{font-size:1.9rem;font-weight:800;letter-spacing:.02em;color:var(--c);line-height:1.1}
.verdict p{margin:10px 0 0;font-size:1.05rem}
.v-NOT_READY{--c:var(--bad)}.v-READY_WITH_CAVEATS{--c:var(--warn)}.v-READY{--c:var(--ok)}
ol.top{padding-left:0;list-style:none;counter-reset:t;margin:0}
ol.top li{counter-increment:t;position:relative;padding:12px 0 12px 42px;border-top:1px solid var(--line)}
ol.top li:first-child{border-top:0}
ol.top li::before{content:counter(t);position:absolute;left:0;top:12px;width:28px;height:28px;border-radius:50%;background:var(--code);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem}
.tag{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.03em;padding:2px 8px;border-radius:99px;margin:0 4px 4px 0;vertical-align:1px;white-space:nowrap}
.t-bad{background:var(--bad-bg);color:var(--bad)}.t-bad2{background:var(--bad-bg);color:var(--bad2)}.t-warn{background:var(--warn-bg);color:var(--warn)}.t-ok{background:var(--ok-bg);color:var(--ok)}.t-muted{background:var(--code);color:var(--muted)}.t-plain{background:var(--code);color:var(--ink);font-weight:600}
.haron{background:var(--h-bg);border-color:transparent;border-left:6px solid var(--h)}
.haron h2{margin-top:0;color:var(--h)}
.muted{color:var(--muted)}
ul{padding-left:20px}
li{margin:4px 0}
code{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:.85em;background:var(--code);padding:1px 5px;border-radius:5px;word-break:break-word}
q{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:.82em;color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-word;background:var(--code);padding:12px;border-radius:8px;font-size:.78rem;max-height:520px;overflow:auto}
details{margin:10px 0}
details>summary{cursor:pointer;font-weight:650;padding:8px 0}
details.tech{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 20px 14px;margin-top:34px}
details.tech>summary{font-size:1.1rem}
.finding{border-top:1px solid var(--line);padding:14px 0}
.fhead{margin-bottom:6px}
.claim{font-weight:600}
.sub{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:10px;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:.86rem;display:block;overflow-x:auto}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.kv td:first-child{color:var(--muted);white-space:nowrap;width:1%}
.legend{font-size:.86rem;color:var(--muted)}
footer{margin-top:40px;font-size:.82rem;color:var(--muted)}
@media print{details.tech{display:none}body{background:#fff}}
`;

function renderHtml(rec, { artifacts = {} } = {}) {
  const p = rec.profile;
  const live = rankedLive(rec);
  const top = topIssues(rec);
  const haron = haronItems(rec);
  const unknowns = allUnknowns(rec);
  const designRan = rec.lenses.find((l) => l.lens === "design-completion")?.status === "ok";
  const date = new Date(rec.started_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const refuted = rec.lenses.flatMap((lr) => (lr.findings || []).filter((f) => f.verification?.verdict === "refuted"));
  const contested = live.filter((f) => ["contested", "unverified"].includes(f.verification?.verdict));
  const dropped = rec.lenses.flatMap((lr) => (lr.dropped || []).map((d) => ({ ...d, lens: lr.lens })));
  const standing = rec.lenses.flatMap((lr) => lr.standing || []);
  const failed = rec.lenses.filter((l) => l.status === "failed");

  const topHtml = top.length
    ? `<ol class="top">${top.map((f) => `<li>${sevTag(f)}${statusTag(f)}${f.corroborated_by ? tag(`found by ${f.corroborated_by.length + 1} separate checks`, "t-plain") : ""}<br>${esc(f.plain_summary)}</li>`).join("")}</ol>`
    : `<p>No open issues were found.</p>`;
  const haronHtml = haron.length
    ? `<ul>${haron.map((f) => `<li>${sevTag(f)}${statusTag(f)} ${esc(f.plain_summary)}</li>`).join("")}</ul>`
    : designRan
      ? `<p>Nothing in this report is waiting on frontend or design work.</p>`
      : `<p><strong>Unknown.</strong> The check for unfinished or placeholder UI didn't run successfully this time, so this is not an all-clear.</p>`;
  const unkTop = unknowns.slice(0, 5);
  const unknownHtml = unknowns.length
    ? `<p>There are <strong>${unknowns.length}</strong> things this check could not confirm either way. They are not passes. The most important:</p><ul>${unkTop.map((c) => `<li>${tag(PLAIN_UNKNOWN_SEV[c.severity_if_bad] || c.severity_if_bad, ["critical", "high"].includes(c.severity_if_bad) ? "t-warn" : "t-muted")} ${esc(c.question)}</li>`).join("")}</ul>${unknowns.length > 5 ? `<p class="muted">…and ${unknowns.length - 5} more in the technical detail below.</p>` : ""}`
    : `<p><strong>None were reported, which is unusual.</strong> Treat the result with extra suspicion: it usually means the check claimed more certainty than it had.</p>`;
  const diff = rec.diff;
  const diffHtml = diff
    ? `<div class="card"><h2 style="margin-top:0">Since the last check</h2><p>Verdict: <strong>${esc(VERDICT_LABEL[diff.verdict.from])}</strong> → <strong>${esc(VERDICT_LABEL[diff.verdict.to])}</strong>. ${diff.new.length} new issue(s), ${diff.resolved.length} fixed, ${diff.persisting.length} still open.</p></div>`
    : "";

  const lensRows = rec.lenses
    .map((lr) => `<tr><td>${esc(lr.title)}</td><td>${esc(lr.status)}${lr.error ? `<br><span class="muted">${esc(oneLine(lr.error, 140))}</span>` : ""}</td><td>${lr.rubric_weight}</td><td>${lr.applicability_score ?? "—"}</td><td><strong>${lr.effective_weight}</strong></td><td>${(lr.findings || []).length}</td><td>${(lr.could_not_verify || []).length}</td><td>${esc(lr.verification?.status || "—")}${lr.verification?.meta?.model ? `<br><span class="muted">${esc(lr.verification.meta.model)}</span>` : ""}</td></tr>`)
    .join("");
  const down = rec.lenses.filter((lr) => lr.effective_weight < 0.7);

  const artHtml = rec.artifacts
    .map((a) => `<details id="art-${esc(a.id)}"><summary><code>${esc(a.id)}</code> — ${esc(a.title)} <span class="muted">(${esc(oneLine(a.summary, 140))})</span></summary><pre>${esc(artifacts[a.id] ?? "(artifact text not embedded)")}</pre></details>`)
    .join("");

  const tech = `
<details class="tech"><summary>Full technical detail (for Joe)</summary>
<h3>Run</h3>
<table class="kv">
<tr><td>Run id</td><td><code>${esc(rec.run_id)}</code></td></tr>
<tr><td>Commit</td><td>${rec.git.sha ? `<code>${esc(rec.git.sha)}</code> on <code>${esc(rec.git.branch)}</code>${rec.git.dirty ? ` — <strong>dirty</strong>: ${rec.git.dirtyCount} uncommitted paths included` : ""}` : "not a git repo"}</td></tr>
<tr><td>Profile</td><td>type <strong>${esc(p.type)}</strong> (${esc(p.typeSource)}), stage <strong>${esc(p.stage)}</strong> (${esc(p.stageSource)})</td></tr>
<tr><td>Inference</td><td>${esc([...p.inference.type.reasons, ...p.inference.stage.reasons].join("; "))}</td></tr>
${p.assumptions.length ? `<tr><td>Assumptions</td><td>${esc(p.assumptions.join(" "))}</td></tr>` : ""}
<tr><td>Verdict reasons</td><td>${esc(rec.verdict.reasons.join("; "))}</td></tr>
<tr><td>Agents</td><td>lenses: ${esc(rec.backends.lens.name)} (${esc(rec.backends.lens.model_requested)}); verifier: ${esc(rec.backends.verifier.name)} (${esc(rec.backends.verifier.model_requested)})</td></tr>
<tr><td>Runtime probe</td><td>${rec.probe.available ? `yes — ${esc(rec.probe.command)}` : `<strong>no</strong> — ${esc(rec.probe.reason)}`}</td></tr>
<tr><td>Quarantined</td><td>${rec.safety.quarantined.length ? rec.safety.quarantined.map((q) => `<code>${esc(q)}</code>`).join(" ") : "none"}</td></tr>
<tr><td>Duration / cost</td><td>${Math.round(rec.duration_ms / 60000)} min, ~$${rec.cost_usd} agent cost</td></tr>
<tr><td>Verifier self-check</td><td>${esc(canaryLine(rec))}</td></tr>
<tr><td>Rubric</td><td>v${rec.rubric_version}</td></tr>
</table>
${failed.length ? `<h3>Lenses that failed</h3><ul>${failed.map((l) => `<li>${esc(l.title)}: ${esc(l.error)}</li>`).join("")}</ul>` : ""}
<h3>Lenses and weighting</h3>
<table><tr><th>Lens</th><th>Status</th><th>Rubric</th><th>Applic.</th><th>Effective</th><th>Findings</th><th>Unknowns</th><th>Verifier</th></tr>${lensRows}</table>
${down.length ? `<p><strong>Downweighted</strong> (effective &lt; 0.7):</p><ul>${down.map((lr) => `<li><strong>${esc(lr.title)}</strong> (${lr.effective_weight}): ${esc(lr.notes_on_downweighting || lr.applicability_reason || "—")}</li>`).join("")}</ul>` : ""}
<h3>All open findings by priority (${live.length})</h3>
${live.map(findingHtml).join("") || "<p>None.</p>"}
<h3>Could not verify (${unknowns.length})</h3>
<ul>${unknowns.map((c) => `<li><strong>[${esc(c.severity_if_bad)} if bad]</strong> ${esc(c.question)} — <em>${esc(c.why)}</em> → ${esc(c.what_would_resolve)} <span class="muted">(${esc(c.lensTitle)})</span></li>`).join("")}</ul>
<h3>Contested (${contested.length})</h3>
<ul>${contested.map((f) => `<li><code>${esc(f.id)}</code> ${esc(oneLine(f.claim, 260))} — <em>${esc(oneLine(f.verification?.note || f.verification?.reasoning, 260))}</em></li>`).join("") || "<li>None.</li>"}</ul>
<h3>Standing checks from calibration (${standing.length})</h3>
<ul>${standing.map((s) => `<li><strong>${esc(s.id)} ${esc(s.status.toUpperCase())}</strong> — ${esc(s.text)} — <em>${esc(s.note)}</em></li>`).join("") || "<li>None yet.</li>"}</ul>
<h3>Passes and how they held up</h3>
<ul>${rec.lenses.flatMap((lr) => (lr.passes || []).map((ps) => `<li>${tag((ps.challenge?.verdict || "unverified").toUpperCase(), ps.challenge?.verdict === "holds" ? "t-ok" : ps.challenge?.verdict === "hollow" ? "t-bad" : "t-warn")} ${esc(ps.claim)} — <span class="muted">${esc(oneLine(ps.challenge?.reasoning, 240))}</span></li>`)).join("") || "<li>None.</li>"}</ul>
<h3>Refuted by the verifier (${refuted.length})</h3>
${refuted.map(findingHtml).join("") || "<p>None.</p>"}
<h3>Dropped claims — no verifiable evidence (${dropped.length})</h3>
<ul>${dropped.map((d) => `<li>${esc(d.lens)}: ${esc(oneLine(d.claim, 200))} — <span class="muted">${esc([...new Set(d.dropped_reasons)].join("; "))}</span></li>`).join("") || "<li>None.</li>"}</ul>
${diff ? `<h3>Diff vs ${esc(diff.previous_run_id)}</h3><ul>${[["New", diff.new], ["Resolved", diff.resolved], ["Still present", diff.persisting], ["Severity changed", diff.changed], ["Unknown", diff.unknown]].map(([l, xs]) => (xs.length ? `<li><strong>${l} (${xs.length})</strong><ul>${xs.map((x) => `<li><code>${esc(x.lens)}/${esc(x.key)}</code> ${esc(x.detail || "")}</li>`).join("")}</ul></li>` : "")).join("")}</ul>` : ""}
<h3>How the verdict is computed</h3>
<ul>${Object.entries(rec.verdict.rules).map(([k, v]) => `<li><strong>${esc(k)}</strong>: ${esc(v)}</li>`).join("")}</ul>
<h3>Evidence artifacts (embedded)</h3>
${artHtml}
</details>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launchcheck: ${esc(rec.project)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${esc(rec.project)} — launch readiness</h1>
<div class="meta">Checked ${esc(date)} · version <code>${esc(rec.git.short || "no git")}</code>${rec.git.dirty ? " (includes unsaved work)" : ""} · evaluated for: ${esc(STAGE_MEANING[p.stage])}${p.stageSource === "inferred" || p.assumptions.length ? " (assumed — tell Joe if that's wrong)" : ""}</div>

<div class="card verdict v-${rec.verdict.verdict}">
  <div class="label">${esc(VERDICT_LABEL[rec.verdict.verdict])}</div>
  <p>${esc(VERDICT_PLAIN[rec.verdict.verdict])}</p>
</div>

<div class="card">
  <h2 style="margin-top:0">What matters most</h2>
  ${topHtml}
  <p class="legend"><strong>Double-checked</strong> means a second, independent check tried to prove it wrong and couldn't. <strong>Needs a human to check</strong> means the second check couldn't settle it either way.</p>
</div>

<div class="card haron">
  <h2>Waiting on Haron (frontend, design, marketing)</h2>
  ${haronHtml}
  <p class="legend">This check never judges how the design looks. It only asks whether screens are wired to real data or still placeholders.</p>
</div>

<div class="card">
  <h2 style="margin-top:0">What we couldn't check</h2>
  ${unknownHtml}
</div>
${diffHtml}
${tech}
<footer>Generated by launchcheck ${esc(rec.tool_version)} for Futreeng. This page is a single self-contained file: no internet connection, login or other files needed, and it's safe to email. It recommends; people decide. It never changes code or touches production.</footer>
</main>
</body>
</html>
`;
}

module.exports = { renderHtml, esc };
