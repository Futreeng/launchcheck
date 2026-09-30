"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "functional-tests",
  title: "Functional correctness & test coverage",
  question: "Do the tests that exist assert real behavior, did they actually pass when run, and what is the gap between what is tested and what a user will actually do?",
  hunt: `
- The test suite was ACTUALLY RUN in a sandbox. Read the tests-* artifacts for real pass/fail, exit codes, timeouts. Never infer "passing" from a CI badge, a README claim, or a STATUS doc: only from the artifact.
- Read test-inventory: test files that no test script runs (dead tests that look like coverage), files with zero assertions, trivial assertions (assert(true), expect(true).toBe(true)), tests that only assert on mocks they themselves configured.
- Map the user's real critical path (from routes / UI entry points / README) against what the tests exercise. Name the concrete untested paths (e.g. "signup -> free audit -> upgrade -> paid report has no test").
- Look for the "looks right, breaks in the runtime data flow" class: logic that only fails for some inputs/modes (e.g. one mode of several not covered, state updated on one code path but not another).
- A failing or un-runnable test suite is a finding (cite the artifact). No tests at all is a finding whose severity depends on stage.
- Report genuine strengths as passes (e.g. "path tests assert concrete scoring outputs"), citing the assertions themselves.`,
  artifacts: ["tests", "test-inventory", "routes", "package-scripts"],
  canProbe: true,
  stageWeights: [0.6, 0.9, 1.2, 1.4],
  typeFactor: { saas: 1.0, sdk: 1.1, internal: 0.9 },
  stageNotes: {
    concept: "A concept is expected to be thin on tests; only broken core logic matters.",
    pilot: "Pilot users hit the core path; untested core logic matters, edge cases less so.",
    beta: "External users will find every untested path.",
    ga: "Paying customers: untested critical paths are launch risk.",
  },
});
