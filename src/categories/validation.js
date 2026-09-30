"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "validation",
  title: "Validation evidence",
  question: "Is there any real signal — pilot feedback, actual usage data, anything beyond 'we built it' — that this solves the problem it claims to, versus zero outside validation?",
  hunt: `
- This is often the most uncomfortable finding and the most important one not to soften. "We built it and it runs" is not validation. Internal demos and self-run smoke tests are not validation. Sales pitch docs are claims, not evidence.
- Look for: user feedback notes, interview notes, pilot tester lists with outcomes, analytics/event tracking code AND evidence it's been looked at (reports, exports), waitlist/signup counts, testimonials with provenance, support tickets, retention data, A/B results, any measured outcome.
- If the product makes claims about outcomes (e.g. "grows your audience", "catches cheaters", scores that predict something): is there any measurement of whether the claim holds? Is there instrumentation to find out after launch?
- Distinguish: (a) evidence of real external validation — cite it; (b) instrumentation that could produce validation — cite it; (c) nothing. (c) is a finding; for a paid launch it's high severity. If validation might exist outside the repo (calls, emails), say so in could_not_verify — don't assume either way.`,
  artifacts: ["files", "git"],
  stageWeights: [0.7, 0.9, 1.1, 1.3],
  typeFactor: { saas: 1.1, sdk: 1.1, internal: 0.8 },
  stageNotes: {
    concept: "A concept needs a plan to validate, not validation itself.",
    pilot: "A pilot IS the validation step; it needs a way to capture results.",
    beta: "Launching to the public without any outside signal is a bet.",
    ga: "Charging money without outside validation is the biggest bet of all.",
  },
});
