"use strict";
// Shape every lens module exports. Keeping this explicit makes it obvious what a new lens
// has to supply (and keeps the rubric defaults next to the reasoning for them).
//
//   id           stable id used in rubric.json, history, calibration
//   title        human name
//   question     the one question this lens answers
//   hunt         lens-specific instructions: what to look for, how to prove it
//   artifacts    artifact id prefixes most relevant to this lens (the agent sees all of them)
//   canProbe     whether findings may carry HTTP probe sequences to run against the sandbox
//   stageWeights base weight by stage [concept, pilot, beta, ga]
//   typeFactor   multiplier by project type
//   stageNotes   why the weight is what it is at each stage (shown when downweighted)

const STAGES = ["concept", "pilot", "beta", "ga"];
const TYPES = ["saas", "sdk", "internal"];

function defineLens(def) {
  for (const k of ["id", "title", "question", "hunt", "stageWeights", "typeFactor", "stageNotes"]) {
    if (!def[k]) throw new Error(`lens ${def.id || "?"} missing ${k}`);
  }
  if (def.stageWeights.length !== 4) throw new Error(`lens ${def.id} needs 4 stage weights`);
  return { artifacts: [], canProbe: false, ...def };
}

module.exports = { defineLens, STAGES, TYPES };
