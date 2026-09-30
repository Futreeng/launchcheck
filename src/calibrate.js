"use strict";
// Learning loop. Feed back what actually happened after a real launch or incident:
//
//  FALSE NEGATIVE (it bit us, the report didn't flag it):
//    - becomes a named STANDING CHECK for that lens: every future run must explicitly
//      report pass/fail/could-not-verify on it (unreported = unknown, never a pass), and a
//      failure becomes a finding automatically
//    - raises that lens's weight for this project's type/stage (+0.15, max 2.0), and records
//      the same delta cross-project so new projects of this type start there
//    - appended verbatim to .launchcheck/lessons/<slug>.md
//
//  FALSE POSITIVE (flagged as blocking/serious, turned out not to matter):
//    - becomes a PRECEDENT shown to the verifier on every future run of that lens
//    - multiplies the confidence weight of that finding key by 0.7 (floor 0.3); below 0.75
//      the finding's confidence drops a level
//    - appended verbatim to the lessons file
//
// Every change bumps rubric.json's version, is logged in its changelog with the reason, is
// snapshotted to rubric-history/, and is printed as a diff.

const readline = require("readline");
const store = require("./store");
const { LENSES, BY_ID } = require("./categories");
const { oneLine } = require("./report-model");

const FN_WEIGHT_STEP = 0.15;
const FP_CONFIDENCE_FACTOR = 0.7;

function flatten(obj, prefix = "", out = {}) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = Array.isArray(obj) ? JSON.stringify(obj) : obj;
  return out;
}

function rubricDiff(before, after) {
  const a = flatten({ weights: before.weights, confidence_multipliers: before.confidence_multipliers });
  const b = flatten({ weights: after.weights, confidence_multipliers: after.confidence_multipliers });
  const lines = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) lines.push(`  ${k}: ${a[k] ?? "(none)"} -> ${b[k]}`);
  const newChecks = after.standing_checks.filter((c) => !before.standing_checks.some((x) => x.id === c.id));
  for (const c of newChecks) lines.push(`  + standing_checks ${c.id} [${c.lens}] ${oneLine(c.text, 120)}`);
  const newPrec = after.fp_precedents.filter((c) => !before.fp_precedents.some((x) => x.id === c.id));
  for (const c of newPrec) lines.push(`  + fp_precedents ${c.id} [${c.lens}] key=${c.key}`);
  lines.push(`  version: ${before.version} -> ${after.version}`);
  return lines.join("\n");
}

function nextId(prefix, list) {
  const n = list.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/**
 * @param target project dir
 * @param input { missed: [{lens, text, severity?, blocking?}], falsePositives: [{findingId|key, reason}], note }
 */
function applyCalibration(target, input) {
  const runs = store.latestRuns(target, 1);
  const last = runs[0];
  if (!last) throw new Error("no previous launchcheck run found for this project — run `launchcheck run` first");
  const rubric = store.loadRubric(target);
  const before = JSON.parse(JSON.stringify(rubric));
  const { type, stage } = last.profile;
  const today = new Date().toISOString();
  const changes = [];
  const lessonBlocks = [];
  const findings = last.lenses.flatMap((lr) => (lr.findings || []).map((f) => ({ ...f, lens: lr.lens })));

  for (const m of input.missed || []) {
    if (!BY_ID[m.lens]) throw new Error(`unknown lens "${m.lens}"`);
    const id = nextId("SC", rubric.standing_checks);
    rubric.standing_checks.push({
      id,
      lens: m.lens,
      text: m.text.trim(),
      severity: m.severity || "high",
      blocking: !!m.blocking,
      owner: m.owner || "joe",
      added: today,
      source: `calibration after run ${last.run_id}${input.note ? ` (${input.note})` : ""}`,
      active: true,
    });
    const w = rubric.weights[type][stage];
    const old = w[m.lens];
    w[m.lens] = Math.round(Math.min(2, old + FN_WEIGHT_STEP) * 100) / 100;
    store.recordTypeDelta(type, stage, m.lens, FN_WEIGHT_STEP, `false negative on ${last.project}: ${oneLine(m.text, 100)}`);
    changes.push(`FN ${id} -> ${m.lens} weight ${old} -> ${w[m.lens]} (${type}/${stage})`);
    lessonBlocks.push(`## ${today.slice(0, 10)} — MISSED (false negative) → standing check ${id} [${m.lens}]\n\nRun: ${last.run_id} (commit ${last.git.short})${input.note ? `\nContext: ${input.note}` : ""}\n\nVerbatim:\n\n> ${m.text.trim().replace(/\n/g, "\n> ")}\n\nEffect: every future run's ${BY_ID[m.lens].title} lens must explicitly check this; ${m.lens} weight for ${type}/${stage} ${old} → ${w[m.lens]}.`);
  }

  for (const fp of input.falsePositives || []) {
    const f = findings.find((x) => x.id === fp.findingId) || findings.find((x) => x.key === fp.key);
    if (!f) throw new Error(`finding ${fp.findingId || fp.key} not found in last run ${last.run_id}`);
    const id = nextId("FP", rubric.fp_precedents);
    rubric.fp_precedents.push({ id, lens: f.lens, key: f.key, claim: f.claim, reason: fp.reason.trim(), severity_was: f.severity, blocking_was: f.blocking, added: today, source_run: last.run_id });
    const old = rubric.confidence_multipliers[f.key] ?? 1;
    rubric.confidence_multipliers[f.key] = Math.round(Math.max(0.3, old * FP_CONFIDENCE_FACTOR) * 100) / 100;
    changes.push(`FP ${id} -> key ${f.key} confidence multiplier ${old} -> ${rubric.confidence_multipliers[f.key]}`);
    lessonBlocks.push(`## ${today.slice(0, 10)} — FLAGGED BUT DIDN'T MATTER (false positive) → precedent ${id} [${f.lens}]\n\nRun: ${last.run_id}, finding ${f.id} (key \`${f.key}\`, was ${f.severity}${f.blocking ? ", blocking" : ""})\n\nClaim: ${f.claim}\n\nWhy it didn't matter (verbatim):\n\n> ${fp.reason.trim().replace(/\n/g, "\n> ")}\n\nEffect: shown to the ${BY_ID[f.lens].title} verifier as a precedent on every future run; findings with this key down-ranked (confidence multiplier ${old} → ${rubric.confidence_multipliers[f.key]}).`);
  }

  if (!changes.length) return { changed: false, message: "nothing to record" };
  const version = store.saveRubric(target, rubric, changes.join("; "), input.note || "calibration from real outcome");
  const lessons = store.appendLesson(target, last.project_slug || last.project, lessonBlocks.join("\n\n"));
  return { changed: true, version, diff: rubricDiff(before, rubric), lessons, changes };
}

async function interactiveCalibration(target) {
  const last = store.latestRuns(target, 1)[0];
  if (!last) throw new Error("no previous launchcheck run found for this project — run `launchcheck run` first");
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
  const out = { missed: [], falsePositives: [] };
  process.stderr.write(`\nCalibrating against the last run: ${last.run_id} (verdict ${last.verdict.verdict}).\n`);
  out.note = await ask("What happened? (e.g. 'launched to 8 pilot users 10/2', 'incident 10/5') : ");

  process.stderr.write("\n1) FALSE NEGATIVES — what broke or bit you that the report did NOT flag?\n");
  for (;;) {
    const text = await ask("   Describe it specifically (Enter when done): ");
    if (!text) break;
    process.stderr.write(LENSES.map((l, i) => `     ${String(i + 1).padStart(2)}) ${l.title}`).join("\n") + "\n");
    const n = parseInt(await ask("   Which lens should have caught it? number: "), 10);
    const lens = LENSES[n - 1];
    if (!lens) {
      process.stderr.write("   (skipped — no valid lens chosen)\n");
      continue;
    }
    const sev = (await ask("   How bad was it? critical/high/medium/low [high]: ")) || "high";
    const blocking = /^y/i.test(await ask("   Should it have blocked the launch? y/N: "));
    out.missed.push({ lens: lens.id, text, severity: ["critical", "high", "medium", "low"].includes(sev) ? sev : "high", blocking });
  }

  const flagged = last.lenses.flatMap((lr) => (lr.findings || []).filter((f) => f.verification?.verdict !== "refuted" && (f.blocking || ["critical", "high"].includes(f.severity))));
  if (flagged.length) {
    process.stderr.write("\n2) FALSE POSITIVES — which of these, flagged as blocking/serious, turned out NOT to matter?\n");
    flagged.forEach((f, i) => process.stderr.write(`   ${String(i + 1).padStart(2)}) [${f.severity}${f.blocking ? ", blocking" : ""}] ${oneLine(f.claim, 130)} (${f.id})\n`));
    const picks = (await ask("   Numbers, comma-separated (Enter for none): ")).split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= flagged.length);
    for (const n of picks) {
      const f = flagged[n - 1];
      const reason = await ask(`   Why didn't ${f.id} matter? `);
      if (reason) out.falsePositives.push({ findingId: f.id, reason });
    }
  }
  rl.close();
  return applyCalibration(target, out);
}

module.exports = { applyCalibration, interactiveCalibration, rubricDiff };
