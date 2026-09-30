"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "reliability",
  title: "Reliability & failure handling",
  question: "When something fails — a rejected promise, a third-party API timing out, a malformed response — does the system fail loudly, recoverably, and with enough information to debug, or silently and confusingly?",
  hunt: `
- Async route handlers without error handling (Express 4 does NOT catch rejected promises from async handlers; an unhandled rejection can hang the request or crash the process). Count them precisely and list locations. Check for a global error handler and process-level unhandledRejection/uncaughtException handlers.
- Silent catches: catch blocks that swallow errors, return placeholder data that looks like success (e.g. "Analysis pending" returned as if it were a result), or log-and-continue on writes.
- Third-party dependency failure: for every external call (LLM APIs, scrapers like Bright Data/Apify, payment processor, email, DB): is there a timeout? A retry with backoff? A fallback? What does the user see? Does a job get stuck forever in 'running' if the worker dies? (async job/poll pattern).
- IDENTICAL-LOOKING ERRORS FROM DIFFERENT LAYERS: verify error messages carry source/layer info. Canonical example: a 413 from our own body-size limit vs a 413 from an upstream LLM provider looking identical to the user and to the logs. Look for error handlers that flatten upstream status codes/messages, or generic "Something went wrong" with no layer tag.
- Health checks that report ok while the thing is broken (e.g. /health says db ok for a fallback in-container DB that is wiped on restart). Cite the health handler.
- Data-loss races: read-modify-write on JSON files without locking, writes that overwrite instead of merge, file-sync (OneDrive/Dropbox) lock races, non-atomic writes.
- Stale hardcoded lists of external things (model names, API versions) that silently stop working.
- Probe what happens on malformed input (invalid JSON body, missing fields, huge body) where you can; secure_expectation should be a 4xx with a clear message, not a 500 or a hang.`,
  artifacts: ["probe", "server-log", "routes", "tests"],
  canProbe: true,
  stageWeights: [0.5, 0.9, 1.2, 1.4],
  typeFactor: { saas: 1.0, sdk: 1.0, internal: 0.9 },
  stageNotes: {
    concept: "Crashes are expected in a concept; only data loss matters.",
    pilot: "Testers will hit failures; they must at least be debuggable.",
    beta: "Silent failures at beta scale become support load you can't see.",
    ga: "Silent failures on a paid product lose money and trust.",
  },
});
