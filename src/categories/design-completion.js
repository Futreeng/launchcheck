"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "design-completion",
  title: "Design/UX completion status",
  question: "Is the UI wired to real, finished data and flows, or is it still placeholder/mock data — so nothing is marked launch-ready while secretly waiting on the frontend/design work?",
  hunt: `
- THIS IS NOT A DESIGN-QUALITY JUDGMENT. Never comment on taste, color, layout, typography, copy tone, or whether something looks good — that is Haron's call. You only answer: wired vs. placeholder, finished vs. unfinished.
- Look for: mock/fake data files or flags in the frontend (mock-api, sample data, hardcoded demo values), lorem ipsum, TODO/FIXME/"coming soon"/placeholder text in user-facing templates, buttons/links that go nowhere (href="#", onClick no-ops), pages referenced in navigation that don't exist, API calls the frontend makes to endpoints the backend doesn't have (compare frontend fetch paths with the routes artifact), forms that don't submit anywhere.
- Mock modes that can be active in production (hostname-based or query-param-based mock switches): cite the switch and the condition.
- Empty/error/loading states for the async parts (long jobs): does the UI handle 'job failed' and 'still running after N minutes', or only the happy path?
- For EVERY finding set owner. owner="haron" when the fix is frontend/design/marketing work (UI wiring, copy, missing pages, visual placeholders); owner="joe" when the frontend is fine but the backend endpoint it needs is missing/broken; "both" when it needs both.`,
  artifacts: ["routes", "files"],
  stageWeights: [0.3, 0.7, 1.1, 1.3],
  typeFactor: { saas: 1.1, sdk: 0.6, internal: 0.6 },
  stageNotes: {
    concept: "Placeholder UI is expected in a concept.",
    pilot: "Testers can tolerate rough UI but not dead ends.",
    beta: "Public users judge the product by what's wired.",
    ga: "Unfinished UI on a paid product reads as a broken product.",
  },
});
