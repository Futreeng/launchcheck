"use strict";
const { defineLens } = require("./_define");

// The fixed lens list is a floor, not a ceiling. This lens exists to find project-specific
// risk categories nobody listed — with exactly the same evidence discipline.
module.exports = defineLens({
  id: "uncovered-risk",
  title: "Project-specific risk (not covered by other lenses)",
  question: "What category of launch risk is specific to THIS project and not covered by any of the other lenses?",
  hunt: `
- First read enough of the project to know what it claims to do. Then ask: what could go wrong that is specific to this domain? Examples of the shape (not a checklist): an LLM-generated score or recommendation presented to users as fact with no grounding/validation; a scraper that violates a platform's terms and can get the product's data source cut off; a game anti-cheat that can be trivially bypassed client-side or produces false bans; synthetic training data that leaks into production claims; outputs that make claims about named real people.
- You must NOT duplicate the other lenses (listed below). If an issue fits one of them, leave it — that lens is independently looking.
- For each finding, name the risk category you're proposing in the claim (e.g. "[Output validity] ...") so it can become a permanent lens later if it keeps recurring.
- Same evidence rules as everyone else: no anchor, no finding.`,
  artifacts: ["files", "routes", "probe"],
  canProbe: true,
  stageWeights: [0.8, 0.9, 1.0, 1.1],
  typeFactor: { saas: 1.0, sdk: 1.0, internal: 1.0 },
  stageNotes: {
    concept: "Domain-specific risk matters from day one.",
    pilot: "Domain-specific risk matters from day one.",
    beta: "Domain-specific risk matters from day one.",
    ga: "Domain-specific risk matters from day one.",
  },
});
