"use strict";
// Everything launchcheck persists lives under <target>/.launchcheck/ (plus one small
// cross-project file under ~/.launchcheck/). Layout:
//
//   .launchcheck/
//     project.json                 inferred/answered profile + per-project settings
//     rubric.json                  lens weights, standing checks, false-positive precedents (versioned)
//     rubric-history/rubric.vN.json  snapshot of every rubric version, for diff/revert
//     history/<stamp>-<sha>.json   full record of every run (all findings, verdicts, evidence refs)
//     runs/<runId>/                report.md, report.html, evidence/*.txt for that run
//     lessons/<slug>.md            append-only human log of lessons (verbatim calibration input)
//     latest/report.html           copy of the newest HTML report

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readJSON, writeJSON, writeFileAtomic, mkdirp, exists, slugify } = require("./util");
const { defaultWeightTable } = require("./categories");

const RUBRIC_SCHEMA = 1;

function paths(target) {
  const root = path.join(target, ".launchcheck");
  return {
    root,
    project: path.join(root, "project.json"),
    rubric: path.join(root, "rubric.json"),
    rubricHistory: path.join(root, "rubric-history"),
    history: path.join(root, "history"),
    runs: path.join(root, "runs"),
    lessons: path.join(root, "lessons"),
    latest: path.join(root, "latest"),
  };
}

function globalPaths() {
  const root = process.env.LAUNCHCHECK_HOME || path.join(os.homedir(), ".launchcheck");
  return { root, typeWeights: path.join(root, "type-weights.json") };
}

function loadProject(target) {
  return readJSON(paths(target).project, {});
}

function saveProject(target, data) {
  writeJSON(paths(target).project, data);
}

// Cross-project learning: calibrations record per-type weight deltas here so a NEW project
// of the same type starts from what earlier projects taught us. Existing projects keep
// their own rubric.json (never silently changed by another project's calibration).
function loadTypeDeltas() {
  return readJSON(globalPaths().typeWeights, { deltas: {}, log: [] });
}

function recordTypeDelta(type, stage, lens, delta, reason) {
  const g = loadTypeDeltas();
  const key = `${type}/${stage}/${lens}`;
  g.deltas[key] = Math.round(((g.deltas[key] || 0) + delta) * 100) / 100;
  g.log.push({ at: new Date().toISOString(), key, delta, reason });
  writeJSON(globalPaths().typeWeights, g);
}

function freshRubric() {
  const weights = defaultWeightTable();
  const g = loadTypeDeltas();
  const inherited = [];
  for (const [key, d] of Object.entries(g.deltas || {})) {
    const [type, stage, lens] = key.split("/");
    if (weights[type]?.[stage]?.[lens] !== undefined) {
      weights[type][stage][lens] = Math.round(Math.min(2, Math.max(0.1, weights[type][stage][lens] + d)) * 100) / 100;
      inherited.push(`${key} ${d >= 0 ? "+" : ""}${d}`);
    }
  }
  return {
    schema: RUBRIC_SCHEMA,
    version: 1,
    note: "Hand-editable. Weights: 0.1-2.0 per lens per project type/stage (1.0 = normal). standing_checks come from calibration false negatives and are checked on every run. fp_precedents come from calibration false positives and are shown to the verifier. confidence_multipliers down-rank finding keys that were false positives before. Every change is logged in changelog and snapshotted in rubric-history/.",
    weights,
    standing_checks: [],
    fp_precedents: [],
    confidence_multipliers: {},
    changelog: [
      {
        version: 1,
        at: new Date().toISOString(),
        change: "created from launchcheck defaults" + (inherited.length ? `; inherited cross-project calibration deltas: ${inherited.join(", ")}` : ""),
        reason: "first run on this project",
      },
    ],
  };
}

function loadRubric(target) {
  const p = paths(target);
  if (!exists(p.rubric)) {
    const r = freshRubric();
    writeJSON(p.rubric, r);
    writeJSON(path.join(p.rubricHistory, `rubric.v${r.version}.json`), r);
    return r;
  }
  const r = readJSON(p.rubric);
  // Tolerate hand edits that drop fields.
  r.standing_checks ||= [];
  r.fp_precedents ||= [];
  r.confidence_multipliers ||= {};
  r.changelog ||= [];
  const defaults = defaultWeightTable();
  r.weights ||= {};
  for (const [type, stages] of Object.entries(defaults)) {
    r.weights[type] ||= {};
    for (const [stage, lenses] of Object.entries(stages)) {
      r.weights[type][stage] ||= {};
      for (const [lens, w] of Object.entries(lenses)) if (r.weights[type][stage][lens] === undefined) r.weights[type][stage][lens] = w;
    }
  }
  return r;
}

function saveRubric(target, rubric, change, reason) {
  const p = paths(target);
  rubric.version = (rubric.version || 0) + 1;
  rubric.changelog.push({ version: rubric.version, at: new Date().toISOString(), change, reason });
  writeJSON(p.rubric, rubric);
  writeJSON(path.join(p.rubricHistory, `rubric.v${rubric.version}.json`), rubric);
  return rubric.version;
}

function listHistory(target) {
  const dir = paths(target).history;
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

function loadRun(file) {
  return readJSON(file);
}

function latestRuns(target, n = 2) {
  return listHistory(target).slice(-n).reverse().map(loadRun);
}

function saveRun(target, record) {
  const p = paths(target);
  const file = path.join(p.history, `${record.run_id}.json`);
  writeJSON(file, record);
  return file;
}

function runDir(target, runId) {
  return mkdirp(path.join(paths(target).runs, runId));
}

function lessonsFile(target, slug) {
  return path.join(paths(target).lessons, `${slugify(slug)}.md`);
}

function appendLesson(target, slug, block) {
  const f = lessonsFile(target, slug);
  const head = exists(f)
    ? fs.readFileSync(f, "utf8")
    : `# launchcheck lessons — ${slug}\n\nAppend-only log of calibration input, recorded verbatim. The machine-readable form (what actually changes behavior) is in ../rubric.json: standing_checks and fp_precedents. Editing this file does not change behavior; editing rubric.json does.\n`;
  writeFileAtomic(f, head.replace(/\s*$/, "\n\n") + block.trim() + "\n");
  return f;
}

module.exports = {
  paths,
  globalPaths,
  loadProject,
  saveProject,
  loadRubric,
  saveRubric,
  freshRubric,
  recordTypeDelta,
  listHistory,
  loadRun,
  latestRuns,
  saveRun,
  runDir,
  lessonsFile,
  appendLesson,
};
