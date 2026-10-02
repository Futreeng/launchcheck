"use strict";
// Pipeline:
//   0. safety gate (refuse on prod config / live credentials in scope)
//   1. profile (type/stage inference, at most one question)
//   2. evidence: static scans, sandbox, real test run, real npm audit, boot app + probe sweep
//   3. lens agents in parallel, each scoped to one lane
//   4. mechanical evidence validation (unanchored claims dropped); agent-proposed probes executed
//   5. adversarial verifier per lens (different model by default)
//   6. deterministic verdict, stored history, reports

const fs = require("fs");
const os = require("os");
const path = require("path");
const U = require("./util");
const safety = require("./safety");
const store = require("./store");
const { resolveProfile } = require("./detect");
const { LENSES, BY_ID } = require("./categories");
const { EvidenceRegistry } = require("./evidence/registry");
const S = require("./evidence/static");
const { extractRoutes, routesArtifact } = require("./evidence/routes");
const { runTests, runAudit } = require("./evidence/exec");
const probe = require("./evidence/probe");
const { createSandbox } = require("./sandbox");
const { getBackend } = require("./agents");
const { LENS_OUTPUT } = require("./agents/schemas");
const { lensPrompt } = require("./prompts");
const { makeValidator } = require("./validate");
const { verifyLens, mergeVerification, buildCanary, judgeCanary, applyCanaryFailure } = require("./verify");
const { computeVerdict, effectiveWeight } = require("./verdict");
const report = require("./report");
const { evidenceOverlap } = require("./report-model");

const TOOL_VERSION = require("../package.json").version;
const MAX_PROBE_SEQUENCES = 40;

class RefusedError extends Error {}

function denyGlobs(quarantined) {
  // Exact files found on disk (a broad "**/.env.*" glob would also block .env.example
  // templates, which agents should read), plus common names as a backstop.
  const g = new Set(["./.launchcheck/**", "**/.env", "**/.env.local", "**/.env.production", "**/.env.production.local", "**/.env.development.local"]);
  for (const q of quarantined) {
    const m = q.match(/^((?:.*\/)?(?:\.vercel|\.netlify|\.aws|\.gcloud|\.azure|\.ssh))\//);
    g.add(m ? `./${m[1]}/**` : `./${q}`);
  }
  return [...g];
}

function processLensOutput(lens, out, validator, ctx) {
  const findings = [];
  const dropped = [];
  (out.findings || []).forEach((f, i) => {
    const ev = validator.checkAll(f.evidence);
    const base = {
      id: `F-${lens.id}-${i + 1}`,
      lens: lens.id,
      key: U.slugify(f.key || f.claim).slice(0, 60),
      severity: f.severity,
      confidence: f.confidence,
      blocking: !!f.blocking,
      claim: f.claim,
      why_it_matters: f.why_it_matters,
      plain_summary: f.plain_summary,
      owner: f.owner || "joe",
      probes: (f.probes || []).slice(0, 4),
      probe_results: [],
    };
    if (!ev.valid.length) {
      dropped.push({ ...base, dropped_reasons: ev.invalid.map((x) => x.reason) });
      return;
    }
    base.evidence = ev.valid;
    if (ev.invalid.length) base.invalid_evidence = ev.invalid.map((x) => x.reason);
    const mult = ctx.rubric.confidence_multipliers[base.key];
    if (typeof mult === "number" && mult < 1) {
      base.confidence_multiplier = mult;
      if (mult < 0.75 && base.confidence !== "low") {
        base.original_confidence = base.confidence;
        base.confidence = base.confidence === "high" ? "medium" : "low";
      }
      base.calibration_note = `down-ranked: key "${base.key}" was a false positive before (confidence multiplier ${mult})`;
    }
    findings.push(base);
  });
  const passes = [];
  (out.passes || []).forEach((p, i) => {
    const ev = validator.checkAll(p.evidence);
    const item = { id: `P-${lens.id}-${i + 1}`, key: U.slugify(p.key || p.claim).slice(0, 60), claim: p.claim };
    if (!ev.valid.length) dropped.push({ ...item, kind: "pass", dropped_reasons: ev.invalid.map((x) => x.reason) });
    else passes.push({ ...item, evidence: ev.valid });
  });

  // Standing checks from calibration are mandatory. Unreported = could_not_verify, never pass.
  const required = ctx.rubric.standing_checks.filter((c) => c.lens === lens.id && c.active !== false);
  const reported = new Map((out.standing_checks || []).map((s) => [String(s.id).trim(), s]));
  const standing = required.map((c) => {
    const r = reported.get(c.id);
    if (!r) return { id: c.id, text: c.text, status: "could_not_verify", note: "the lens agent did not report on this standing check — treated as unknown, not as passing", evidence: [] };
    const ev = validator.checkAll(r.evidence || []);
    let status = r.status;
    let note = r.note;
    if (status === "pass" && !ev.valid.length) {
      status = "could_not_verify";
      note = `claimed pass without valid evidence (${note})`;
    }
    return { id: c.id, text: c.text, status, note, evidence: ev.valid };
  });
  for (const s of standing) {
    if (s.status !== "fail") continue;
    const covering = findings.find((f) => f.claim.includes(s.id) || f.key.includes(s.id.toLowerCase()) || (s.evidence.length && evidenceOverlap(f, { evidence: s.evidence })));
    if (covering) {
      covering.standing_check = s.id;
      continue;
    }
    const check = required.find((c) => c.id === s.id);
    if (s.evidence.length) {
      findings.push({
        id: `F-${lens.id}-standing-${s.id}`,
        lens: lens.id,
        key: `standing-${s.id.toLowerCase()}`,
        severity: check.severity || "high",
        confidence: "medium",
        blocking: !!check.blocking,
        claim: `Standing check ${s.id} FAILED: ${s.text} — ${s.note}`,
        why_it_matters: `This exact issue was missed before and bit in reality (${check.source || "calibration"}).`,
        plain_summary: `A problem that hurt us before is still present: ${s.text.slice(0, 140)}`,
        owner: check.owner || "joe",
        evidence: s.evidence,
        probes: [],
        probe_results: [],
        origin: "standing-check",
      });
    }
  }
  const cnv = (out.could_not_verify || []).map((c) => ({ ...c, lens: lens.id }));
  for (const s of standing.filter((x) => x.status === "could_not_verify")) {
    cnv.push({ lens: lens.id, question: `Standing check ${s.id}: ${s.text}`, why: s.note, what_would_resolve: "check by hand, or re-run so the lens can report it", severity_if_bad: required.find((c) => c.id === s.id)?.severity || "high" });
  }
  return { findings, passes, dropped, standing, could_not_verify: cnv };
}

async function collectEvidence(ctx, opts) {
  const { target, files, registry, safetyResult, projectCfg } = ctx;
  const add = (a) => a && registry.add(a);
  U.log("evidence", "static scans (git, files, env names, manifests, licenses, credentials, tests, routes)");
  add(ctx.gitArtifact);
  add(S.filesArtifact(target, files, safetyResult.quarantined));
  const envA = S.envArtifact(target, files);
  add(envA);
  add(S.packageArtifact(target, files));
  add(S.licensesArtifact(target, files));
  add(S.secretsArtifact(safetyResult, files.length));
  add(S.testInventoryArtifact(target, files));
  const routes = extractRoutes(target, files);
  add(routesArtifact(routes));

  ctx.probeAvailable = false;
  ctx.probeUnavailableReason = "probing disabled (--no-probe)";
  if (opts.noExec) {
    ctx.probeUnavailableReason = "execution disabled (--no-exec)";
    add({ id: "tests-skipped", title: "Test suite execution", summary: "NOT RUN (--no-exec): test results unknown", content: "Execution was disabled for this run." });
    return;
  }
  let sb;
  try {
    sb = createSandbox(target, files, safetyResult.quarantined, ctx.runId);
    ctx.sandbox = sb;
    U.log("sandbox", `copied ${sb.copied} files (${Math.round(sb.bytes / 1024)} KB) to ${sb.dir}; linked ${sb.linked.join(", ") || "no node_modules"}; excluded ${sb.skippedCredentialFiles.length} credential files`);
  } catch (e) {
    ctx.probeUnavailableReason = `sandbox could not be created: ${e.message}`;
    add({ id: "sandbox-error", title: "Sandbox creation", summary: `FAILED: ${e.message}`, content: e.stack || e.message });
    return;
  }
  if (!opts.noTests) {
    U.log("tests", "running the project's test suite(s) in the sandbox");
    for (const a of await runTests(sb, files, { timeoutMs: opts.testTimeoutMs })) {
      add(a);
      U.log("tests", `${a.id}: ${a.summary}`);
    }
  } else add({ id: "tests-skipped", title: "Test suite execution", summary: "NOT RUN (--no-tests): test results unknown", content: "Tests were disabled for this run." });
  if (!opts.noAudit) {
    U.log("audit", "npm audit (real registry query) in the sandbox");
    for (const a of await runAudit(sb, files)) {
      add(a);
      U.log("audit", `${a.id}: ${a.summary}`);
    }
  }
  if (opts.noProbe) return;
  U.log("probe", "booting sandboxed app (scrubbed env, no credentials, no dev-bypass flags)");
  const server = await probe.startServer(sb, target, projectCfg, ctx.profile.signals.serverFiles || [], ctx.redact, envA.names);
  if (!server.ok) {
    ctx.probeUnavailableReason = server.reason;
    add({ id: "server-log", title: "Sandboxed app boot (FAILED)", command: server.command || null, summary: `app did not boot: ${server.reason}`, content: server.log || server.reason });
    U.log("probe", `not available: ${server.reason}`);
    return;
  }
  ctx.server = server;
  // Generated per-run secrets must be redacted from every artifact and agent output too.
  ctx.redact = server.redact;
  ctx.redactDeep = (o) => safety.redactDeep(o, server.redact);
  registry.redact = server.redact;
  ctx.probeAvailable = true;
  U.log("probe", `app up at ${server.baseUrl}; sweeping ${routes.length} discovered routes with no credentials`);
  const sw = await probe.sweep(server, routes, ctx.redact);
  add(sw.artifact);
  ctx.sweepResults = sw.results;
  add({ id: "server-log", title: "Sandboxed app output during boot and sweep", command: server.command, summary: `stdout/stderr of the sandboxed app (${server.getLog().length} chars)`, content: U.tail(server.getLog(), 400) });
}

async function runLens(lens, ctx, backend, opts, validator) {
  const standingChecks = ctx.rubric.standing_checks.filter((c) => c.lens === lens.id && c.active !== false);
  const prior = (ctx.previous?.lenses?.find((l) => l.lens === lens.id)?.findings || []).filter((f) => f.verification?.verdict !== "refuted");
  const prompt = lensPrompt(lens, ctx, { standingChecks, prior });
  U.log("lens", `${lens.id}: started`);
  const call = () => backend.run({ prompt, schema: LENS_OUTPUT, cwd: ctx.target, readDirs: [ctx.evidenceDir], denyReadGlobs: ctx.denyReadGlobs, model: opts.model, timeoutMs: opts.agentTimeoutMs, budgetUsd: opts.budgetUsd });
  const isEmpty = (r) => r.ok && !(r.output.findings || []).length && !(r.output.passes || []).length && !(r.output.could_not_verify || []).length;
  let res = await call();
  // A lens that says nothing at all — no findings, no passes, not even an unknown — has not
  // evaluated anything. Never let that read as "ran fine, found nothing". Retry once, then fail.
  if (isEmpty(res)) {
    U.log("lens", `${lens.id}: returned an EMPTY result (no findings, passes or unknowns) — retrying once`);
    const firstCost = res.meta.costUsd || 0;
    res = await call();
    res.meta.costUsd = (res.meta.costUsd || 0) + firstCost;
    res.meta.retriedEmpty = true;
    if (isEmpty(res)) res = { ok: false, error: "lens returned an empty result twice (no findings, passes, or unknowns) — treated as NOT evaluated, not as clean", meta: res.meta };
  }
  const rubricWeight = ctx.weights[lens.id];
  if (!res.ok) {
    U.log("lens", `${lens.id}: FAILED — ${res.error}`);
    return {
      lens: lens.id,
      title: lens.title,
      status: "failed",
      error: res.error,
      meta: res.meta,
      rubric_weight: rubricWeight,
      effective_weight: rubricWeight,
      findings: [],
      passes: [],
      dropped: [],
      standing: [],
      could_not_verify: [{ lens: lens.id, question: `The whole "${lens.title}" lens`, why: `the lens agent failed: ${res.error}`, what_would_resolve: `re-run: launchcheck run --lenses=${lens.id}`, severity_if_bad: rubricWeight >= 1 ? "high" : "medium" }],
    };
  }
  const out = ctx.redactDeep(res.output);
  const processed = processLensOutput(lens, out, validator, ctx);
  const eff = effectiveWeight(rubricWeight, out.applicability_score);
  U.log("lens", `${lens.id}: ${processed.findings.length} findings, ${processed.passes.length} passes, ${processed.could_not_verify.length} unknowns, ${processed.dropped.length} dropped for bad evidence ($${(res.meta.costUsd || 0).toFixed(2)}, ${Math.round(res.meta.durationMs / 1000)}s)`);
  return {
    lens: lens.id,
    title: lens.title,
    status: "ok",
    meta: res.meta,
    rubric_weight: rubricWeight,
    applicability_score: out.applicability_score,
    applicability_reason: out.applicability_reason,
    effective_weight: eff,
    notes_on_downweighting: out.notes_on_downweighting,
    resolved_prior_keys: out.resolved_prior_keys || [],
    ...processed,
  };
}

async function executeProbes(ctx, lensResults) {
  if (!ctx.probeAvailable) return;
  const all = [];
  for (const lr of lensResults) for (const f of lr.findings) for (const p of f.probes || []) all.push({ f, p });
  if (!all.length) return;
  const toRun = all.slice(0, MAX_PROBE_SEQUENCES);
  U.log("probe", `executing ${toRun.length} agent-proposed probe sequences${all.length > toRun.length ? ` (${all.length - toRun.length} over the cap, not run)` : ""}`);
  let n = 0;
  for (const { f, p } of toRun) {
    n++;
    const transcript = await probe.runSequence(ctx.server, p, n, ctx.redact);
    const id = `probe-${String(n).padStart(2, "0")}-${f.lens}`.slice(0, 60);
    ctx.registry.add({ id, title: `Probe: ${p.name} (for ${f.id})`, command: `HTTP sequence against sandboxed app ${ctx.server.baseUrl}`, summary: `secure expectation: ${p.secure_expectation}`, content: transcript });
    f.probe_results.push({ name: p.name, secure_expectation: p.secure_expectation, artifact_id: id, transcript });
  }
  for (const { f, p } of all.slice(MAX_PROBE_SEQUENCES)) f.probe_results.push({ name: p.name, secure_expectation: p.secure_expectation, artifact_id: null, transcript: "NOT RUN: over the per-run probe cap" });
}

async function evaluate(targetArg, opts) {
  const started = Date.now();
  const target = path.resolve(targetArg || process.cwd());
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`not a directory: ${target}`);

  const files = U.listProjectFiles(target);
  const projectCfg = store.loadProject(target);

  // 0. Safety gate — before any write, process, or request.
  const safetyResult = safety.inspect(target, files, { probeUrl: opts.probeUrl, allowlist: projectCfg.fake_secret_allowlist });
  if (safetyResult.refuse) throw new RefusedError(safety.formatRefusal(safetyResult, target));
  const redact = safety.makeRedactor(safetyResult.redactValues);

  const lensBackend = getBackend(opts.backend || "claude-code");
  const verifierBackend = getBackend(opts.verifier || "claude-code");
  for (const b of [lensBackend, verifierBackend]) {
    const a = b.available();
    if (!a.ok) throw new Error(`agent backend "${b.name}" unavailable: ${a.detail}`);
  }

  // 1. Profile.
  const interactive = !!process.stdin.isTTY && !opts.yes;
  const profile = await resolveProfile(target, files, { flags: { type: opts.type, stage: opts.stage }, saved: projectCfg.profile || {}, interactive });
  if (profile.stageSource === "answered") {
    projectCfg.profile = { ...(projectCfg.profile || {}), stage: profile.stage, answered_at: new Date().toISOString() };
    store.saveProject(target, projectCfg);
  }
  let rubric = store.loadRubric(target);
  const orgRubric = store.loadOrgRubric();
  if (orgRubric) rubric = store.applyOrgRubric(rubric, orgRubric);
  const weights = rubric.weights[profile.type][profile.stage];

  const g = S.gitArtifact(target);
  const runId = `${U.stamp()}-${g.meta.short}`;
  const workDir = U.mkdirp(path.join(os.tmpdir(), `launchcheck-work-${runId}`));
  const evidenceDir = U.mkdirp(path.join(workDir, "evidence"));
  const registry = new EvidenceRegistry(evidenceDir, redact);
  const pkgName = U.readJSON(path.join(target, "package.json"), null)?.name;
  const projectName = projectCfg.name || pkgName || path.basename(target);
  const previous = store.latestRuns(target, 1)[0] || null;
  const lensIds = opts.lenses ? opts.lenses.split(",").map((s) => s.trim()).filter(Boolean) : LENSES.map((l) => l.id);
  for (const id of lensIds) if (!BY_ID[id]) throw new Error(`unknown lens "${id}". Lenses: ${LENSES.map((l) => l.id).join(", ")}`);

  const ctx = {
    target,
    files,
    projectCfg,
    safetyResult,
    redact,
    redactDeep: (o) => safety.redactDeep(o, redact),
    profile,
    rubric,
    weights,
    git: g.meta,
    gitArtifact: g.artifact,
    runId,
    evidenceDir,
    registry,
    projectName,
    previous,
    lensIds,
    denyReadGlobs: denyGlobs(safetyResult.quarantined),
  };

  U.log("start", `${projectName} @ ${g.meta.short}${g.meta.dirty ? " (dirty)" : ""} — type=${profile.type} (${profile.typeSource}), stage=${profile.stage} (${profile.stageSource})`);
  for (const a of profile.assumptions) U.log("assume", a);
  if (safetyResult.quarantined.length) U.log("safety", `quarantined ${safetyResult.quarantined.length} credential file(s): ${safetyResult.quarantined.join(", ")}`);

  const lensResults = [];
  try {
    // 2. Evidence.
    await collectEvidence(ctx, opts);

    // 3. Lenses.
    const validator = makeValidator({ root: target, registry, quarantined: safetyResult.quarantined, evidenceDir });
    const lenses = lensIds.map((id) => BY_ID[id]);
    U.log("lenses", `running ${lenses.length} independent lens agents (concurrency ${opts.concurrency}, backend ${lensBackend.name}${opts.model ? `, model ${opts.model}` : ""})`);
    lensResults.push(...(await U.pool(lenses, opts.concurrency, (l) => runLens(l, ctx, lensBackend, opts, validator))));

    // 4. Probes proposed by lenses, against the live sandbox.
    await executeProbes(ctx, lensResults);

    // 5. Adversarial verification.
    // One planted known-false claim, in the first probe-capable lens that has something to verify.
    const canaryLens = ["security", "monetization", "data-privacy", "reliability", "cost"].map((id) => lensResults.find((l) => l.lens === id && l.status === "ok" && (l.findings.length || l.passes.length))).find(Boolean);
    const canary = canaryLens ? buildCanary(ctx, canaryLens.lens, canaryLens.findings.length + 1) : null;
    ctx.canary = { lens: canaryLens?.lens || null, result: { status: "not_run", detail: canaryLens ? "no route returned 401/403 in the unauthenticated sweep" : "no eligible lens" } };
    U.log("verify", `adversarial verification per lens (backend ${verifierBackend.name}, model ${opts.verifierModel || "default"})`);
    await U.pool(lensResults, opts.concurrency, async (lr) => {
      if (lr.status !== "ok") {
        lr.verification = { status: "skipped", reason: "lens failed" };
        return;
      }
      const lens = BY_ID[lr.lens];
      const withCanary = canary && lr === canaryLens ? canary : null;
      const v = await verifyLens(lens, ctx, lr, verifierBackend, { model: opts.verifierModel, timeoutMs: opts.agentTimeoutMs, budgetUsd: opts.budgetUsd, canary: withCanary });
      lr.verification = { status: v.status, error: v.error, reason: v.reason, meta: v.meta };
      mergeVerification(lr, v, validator, lens);
      if (withCanary) {
        ctx.canary.result = judgeCanary(withCanary, v, validator);
        lr.canary = ctx.canary.result;
        if (ctx.canary.result.status === "FAILED") applyCanaryFailure(lr);
        U.log("canary", `${lr.lens} verifier vs planted false claim: ${ctx.canary.result.status}${ctx.canary.result.verdict ? ` (said ${ctx.canary.result.verdict})` : ""}`);
      }
      const tally = {};
      for (const f of lr.findings) tally[f.verification.verdict] = (tally[f.verification.verdict] || 0) + 1;
      U.log("verify", `${lr.lens}: ${v.status}${v.error ? ` (${v.error})` : ""} — ${Object.entries(tally).map(([k, n]) => `${k}=${n}`).join(" ") || "no findings"}`);
    });
  } finally {
    if (ctx.server) ctx.server.stop();
    if (ctx.sandbox && !opts.keepSandbox) ctx.sandbox.cleanup();
  }

  // 6. Synthesis.
  const verdict = computeVerdict(lensResults);
  const costs = lensResults.reduce((s, lr) => s + (lr.meta?.costUsd || 0) + (lr.verification?.meta?.costUsd || 0), 0);
  const record = {
    schema: 1,
    tool_version: TOOL_VERSION,
    run_id: runId,
    started_at: new Date(started).toISOString(),
    duration_ms: Date.now() - started,
    target,
    project: projectName,
    project_slug: U.slugify(projectName),
    git: g.meta,
    profile,
    rubric_version: rubric.version,
    weights,
    backends: {
      lens: { name: lensBackend.name, model_requested: opts.model || "default" },
      verifier: { name: verifierBackend.name, model_requested: opts.verifierModel || "default" },
    },
    safety: { quarantined: safetyResult.quarantined, env_files: safetyResult.envFiles.map((e) => ({ file: e.file, keys: e.keys })) },
    sandbox: ctx.sandbox ? { copied: ctx.sandbox.copied, linked_node_modules: ctx.sandbox.linked, excluded_credential_files: ctx.sandbox.skippedCredentialFiles } : null,
    verifier_canary: ctx.canary || { lens: null, result: { status: "not_run", detail: "verification did not run" } },
    probe: { available: ctx.probeAvailable, reason: ctx.probeAvailable ? null : ctx.probeUnavailableReason, command: ctx.server?.command || null },
    artifacts: registry.index().map(({ id, title, summary, exitCode }) => ({ id, title, summary, exitCode })),
    lenses: lensResults.map((lr) => ({ ...lr })),
    verdict,
    cost_usd: Math.round(costs * 100) / 100,
    previous_run_id: previous?.run_id || null,
  };
  record.diff = previous ? report.diffRuns(previous, record) : null;

  // Persist: history record, evidence copy, reports.
  const histFile = store.saveRun(target, record);
  const outDir = store.runDir(target, runId);
  const evOut = U.mkdirp(path.join(outDir, "evidence"));
  for (const a of registry.index()) fs.copyFileSync(a.file, path.join(evOut, path.basename(a.file)));
  const md = report.renderMarkdown(record);
  const html = report.renderHtml(record, { artifacts: Object.fromEntries(registry.index().map((a) => [a.id, registry.get(a.id).text])) });
  U.writeFileAtomic(path.join(outDir, "report.md"), md);
  U.writeFileAtomic(path.join(outDir, "report.html"), html);
  U.writeFileAtomic(path.join(outDir, "report.json"), JSON.stringify(record, null, 2));
  const latestDir = U.mkdirp(store.paths(target).latest);
  U.writeFileAtomic(path.join(latestDir, "report.html"), html);
  U.writeFileAtomic(path.join(latestDir, "report.md"), md);
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {}
  return { record, histFile, outDir, reportHtml: path.join(outDir, "report.html"), reportMd: path.join(outDir, "report.md") };
}

module.exports = { evaluate, RefusedError, processLensOutput, denyGlobs };
