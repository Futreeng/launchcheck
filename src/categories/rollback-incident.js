"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "rollback-incident",
  title: "Rollback & incident response",
  question: "If this breaks in production five minutes after launch, what is the actual plan?",
  hunt: `
- Is there a documented rollback path (redeploy previous commit, platform rollback button, feature flag/kill switch)? Cite it. If the honest answer is "there isn't one", say so plainly: that is a BLOCKING finding for anything customer-facing and a lower-severity note for an internal/pilot tool.
- Can the risky new features be turned off without a deploy (env flags, feature toggles)? Cite them.
- Database migrations: are they reversible? Does boot auto-migrate (so rolling back code onto a migrated schema breaks)?
- Who gets told when it breaks? Is there any alerting at all, or does the team find out from users?
- Is there a way to tell users something is wrong (status message, banner, email)?
- Deploy coupling: does a deploy to one thing (e.g. a demo/mock deploy) risk being confused with the real product?`,
  artifacts: ["files", "git", "env-example"],
  stageWeights: [0.2, 0.5, 1.0, 1.4],
  typeFactor: { saas: 1.1, sdk: 0.8, internal: 0.6 },
  stageNotes: {
    concept: "Nothing to roll back yet.",
    pilot: "Testers need a 'we know, it's off' answer, not a runbook.",
    beta: "Public breakage needs a real rollback path.",
    ga: "No rollback plan on a paid launch is blocking.",
  },
});
