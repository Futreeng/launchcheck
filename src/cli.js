"use strict";

const path = require("path");
const { evaluate, RefusedError } = require("./orchestrator");
const store = require("./store");
const report = require("./report");
const { applyCalibration, interactiveCalibration } = require("./calibrate");
const { share } = require("./share");
const { LENSES, STAGES, TYPES } = require("./categories");
const { VERDICT_LABEL, VERDICT_PLAIN, topIssues, canaryLine, allUnknowns, oneLine } = require("./report-model");

const HELP = `launchcheck — Futreeng launch-readiness evaluator

  launchcheck run [path]         full evaluation (default: current directory)
      --type=saas|sdk|internal   override inferred project type
      --stage=concept|pilot|beta|ga   who you're shipping to (override inference)
      --lenses=a,b               run only these lenses (default: all ${LENSES.length})
      --concurrency=N            parallel agents (default 5)
      --model=M                  lens agent model (default sonnet)
      --verifier-model=M         verifier model (default opus: a different model from the lenses)
      --verifier=claude-code|gemini   verifier backend (gemini is experimental/untested)
      --no-probe  --no-tests  --no-audit  --no-exec   skip runtime steps (reported as unknowns)
      --probe-url=http://localhost:PORT   (reserved: only localhost is ever allowed)
      --agent-budget-usd=N       per-agent spend cap
      --yes                      never ask questions (state assumptions instead)
      --keep-sandbox             keep the temp sandbox copy for inspection
  launchcheck diff [path]        compare the latest run with the one before it
  launchcheck history [path]     list past runs and verdicts
  launchcheck calibrate [path]   record a real outcome (interactive), or non-interactively:
      --missed="what bit us" --lens=<lens-id> [--severity=high] [--blocking]
      --false-positive=<finding-id> --reason="why it didn't matter"
      --note="context, e.g. pilot launch 10/2"
  launchcheck share [path] [--to=dir]   copy the latest HTML report to your Desktop (or dir) and print the path
  launchcheck lenses             list lens ids

Exit codes: 0 ok, 1 error, 2 usage, 3 refused (production config / live credentials in scope).`;

function parse(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      let k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      let v = eq > 0 ? a.slice(eq + 1) : true;
      if (v === true && argv[i + 1] && !argv[i + 1].startsWith("--") && ["type", "stage", "lenses", "concurrency", "model", "verifier-model", "verifier", "probe-url", "agent-budget-usd", "missed", "lens", "severity", "false-positive", "reason", "note", "to", "backend"].includes(k)) v = argv[++i];
      flags[k] = v;
    } else pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}

function fail(msg, code = 2) {
  process.stderr.write(`${msg}\n`);
  process.exitCode = code;
}

async function cmdRun(target, f) {
  if (f.type && !TYPES.includes(f.type)) return fail(`--type must be one of ${TYPES.join(", ")}`);
  if (f.stage && !STAGES.includes(f.stage)) return fail(`--stage must be one of ${STAGES.join(", ")}`);
  const opts = {
    type: f.type,
    stage: f.stage,
    lenses: typeof f.lenses === "string" ? f.lenses : null,
    concurrency: parseInt(f.concurrency, 10) || 5,
    model: typeof f.model === "string" ? f.model : "sonnet",
    verifierModel: typeof f["verifier-model"] === "string" ? f["verifier-model"] : f.verifier === "gemini" ? undefined : "opus",
    backend: typeof f.backend === "string" ? f.backend : "claude-code",
    verifier: typeof f.verifier === "string" ? f.verifier : "claude-code",
    noProbe: !!f["no-probe"],
    noTests: !!f["no-tests"],
    noAudit: !!f["no-audit"],
    noExec: !!f["no-exec"],
    probeUrl: typeof f["probe-url"] === "string" ? f["probe-url"] : null,
    budgetUsd: f["agent-budget-usd"] ? Number(f["agent-budget-usd"]) : undefined,
    yes: !!f.yes,
    keepSandbox: !!f["keep-sandbox"],
    agentTimeoutMs: 25 * 60 * 1000,
    testTimeoutMs: 5 * 60 * 1000,
  };
  if (opts.probeUrl) return fail("--probe-url is reserved and not implemented in v1: launchcheck boots its own sandboxed copy. (Non-local URLs are always refused.)");
  try {
    const { record, reportHtml, reportMd, histFile } = await evaluate(target, opts);
    const live = topIssues(record);
    const unknowns = allUnknowns(record);
    const o = [];
    o.push("", `VERDICT: ${VERDICT_LABEL[record.verdict.verdict]} — ${record.verdict.reasons.join("; ")}`, VERDICT_PLAIN[record.verdict.verdict], "");
    o.push("Top issues:");
    for (const x of live) o.push(`  - [${x.severity}${x.blocking ? ", BLOCKING" : ""}, ${x.verification?.verdict}] ${oneLine(x.claim, 160)} (${x.id}${x.corroborated_by ? ` + ${x.corroborated_by.map((c) => c.id).join(", ")}` : ""})`);
    o.push("", `Verifier self-check: ${canaryLine(record)}`);
    if (!live.length) o.push("  (none)");
    o.push("", `Could not verify: ${unknowns.length}${unknowns.length ? ` (top: ${oneLine(unknowns[0].question, 120)})` : " — suspicious, check for overclaiming"}`);
    if (record.diff) o.push(`Since ${record.diff.previous_run_id}: ${record.diff.new.length} new, ${record.diff.resolved.length} resolved, ${record.diff.persisting.length} still present`);
    if (record.profile.assumptions.length) o.push("", ...record.profile.assumptions.map((a) => `NOTE: ${a}`));
    o.push("", `HTML (for Haron): ${reportHtml}`, `Markdown:         ${reportMd}`, `History record:   ${histFile}`, `Agent cost:       ~$${record.cost_usd}`, "", "Hand it off: launchcheck share" + (target ? ` "${target}"` : ""), "");
    process.stdout.write(o.join("\n"));
  } catch (e) {
    if (e instanceof RefusedError) {
      process.stderr.write(e.message + "\n");
      process.exitCode = 3;
      return;
    }
    throw e;
  }
}

function cmdHistory(target) {
  const files = store.listHistory(target);
  if (!files.length) return process.stdout.write("No runs yet.\n");
  for (const f of files) {
    const r = store.loadRun(f);
    const n = r.lenses.reduce((s, l) => s + (l.findings || []).filter((x) => x.verification?.verdict !== "refuted").length, 0);
    const u = r.lenses.reduce((s, l) => s + (l.could_not_verify || []).length, 0);
    process.stdout.write(`${r.run_id}  ${VERDICT_LABEL[r.verdict.verdict].padEnd(18)}  ${r.profile.type}/${r.profile.stage}  findings=${n} unknowns=${u} blockers=${r.verdict.counts.confirmedBlockers}+${r.verdict.counts.openBlockers}?  rubric v${r.rubric_version}  $${r.cost_usd}\n`);
  }
}

function cmdDiff(target) {
  const runs = store.latestRuns(target, 2);
  if (runs.length < 2) return fail("need at least two runs to diff", 1);
  process.stdout.write(report.renderDiffText(report.diffRuns(runs[1], runs[0])) + "\n");
}

async function cmdCalibrate(target, f) {
  let res;
  if (f.missed || f["false-positive"]) {
    const input = { note: typeof f.note === "string" ? f.note : "", missed: [], falsePositives: [] };
    if (f.missed) {
      if (!f.lens) return fail("--missed needs --lens=<lens-id> (see `launchcheck lenses`)");
      input.missed.push({ lens: f.lens, text: String(f.missed), severity: typeof f.severity === "string" ? f.severity : "high", blocking: !!f.blocking });
    }
    if (f["false-positive"]) {
      if (typeof f.reason !== "string") return fail("--false-positive needs --reason=\"why it didn't matter\"");
      input.falsePositives.push({ findingId: String(f["false-positive"]), key: String(f["false-positive"]), reason: f.reason });
    }
    res = applyCalibration(target, input);
  } else {
    if (!process.stdin.isTTY) return fail("interactive calibration needs a terminal; use --missed/--false-positive flags instead");
    res = await interactiveCalibration(target);
  }
  if (!res.changed) return process.stdout.write("Nothing recorded.\n");
  process.stdout.write(`rubric.json updated to v${res.version}. Changes:\n${res.diff}\n\nLessons log: ${res.lessons}\nThe next \`launchcheck run\` will apply these.\n`);
}

async function main(argv) {
  const { cmd, pos, flags } = parse(argv);
  const target = path.resolve(pos[0] || process.cwd());
  switch (cmd) {
    case "run":
      return cmdRun(target, flags);
    case "history":
      return cmdHistory(target);
    case "diff":
      return cmdDiff(target);
    case "calibrate":
      return cmdCalibrate(target, flags);
    case "share": {
      const r = share(target, { to: typeof flags.to === "string" ? flags.to : undefined });
      process.stdout.write(`${r.dest}\n\nSaved the ${VERDICT_LABEL[r.run.verdict.verdict]} report for ${r.run.project} (${Math.round(r.bytes / 1024)} KB, single self-contained file). Drag it into Slack or attach it to an email; it opens in any browser with nothing else needed.\n`);
      return;
    }
    case "lenses":
      for (const l of LENSES) process.stdout.write(`${l.id.padEnd(20)} ${l.title}\n`);
      return;
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(HELP + "\n");
      return;
    default:
      return fail(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

module.exports = { main, parse };
