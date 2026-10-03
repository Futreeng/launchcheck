"use strict";
const { STAGES, TYPES } = require("./_define");

const LENSES = [
  require("./functional-tests"),
  require("./security"),
  require("./data-privacy"),
  require("./reliability"),
  require("./performance"),
  require("./cost"),
  require("./ops"),
  require("./dependencies"),
  require("./docs-busfactor"),
  require("./monetization"),
  require("./design-completion"),
  require("./legal"),
  require("./compliance-privacy"),
  require("./accessibility"),
  require("./third-party-vetting"),
  require("./soc2"),
  require("./validation"),
  require("./rollback-incident"),
  require("./uncovered-risk"),
];

const BY_ID = Object.fromEntries(LENSES.map((l) => [l.id, l]));

function defaultWeight(lens, type, stage) {
  const w = lens.stageWeights[STAGES.indexOf(stage)] * (lens.typeFactor[type] ?? 1);
  return Math.round(Math.min(2, Math.max(0.1, w)) * 100) / 100;
}

// Fully expanded default weight table, written verbatim into each project's rubric.json so
// every number that affects a verdict is visible and hand-editable.
function defaultWeightTable() {
  const table = {};
  for (const type of TYPES) {
    table[type] = {};
    for (const stage of STAGES) {
      table[type][stage] = {};
      for (const l of LENSES) table[type][stage][l.id] = defaultWeight(l, type, stage);
    }
  }
  return table;
}

module.exports = { LENSES, BY_ID, STAGES, TYPES, defaultWeight, defaultWeightTable };
