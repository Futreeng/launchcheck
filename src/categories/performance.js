"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "performance",
  title: "Performance & scaling assumptions",
  question: "Does anything grow without bound as usage grows, and what is fine at pilot scale but will not be fine at 10x?",
  hunt: `
- UNBOUNDED GROWTH is the canonical bug: e.g. a conversation/dialogue transcript replayed in full on every turn until it hits a provider context/body-size ceiling; history arrays that are appended forever; whole JSON datastore read and rewritten on every request; caches with no eviction; log files with no rotation.
- N+1 patterns: a DB/API call inside a loop over users/posts/items; sequential awaits that could be batched.
- Work done synchronously in the request path that takes seconds-to-minutes (scrapes, multi-LLM calls, image processing) instead of a job queue; request timeouts vs. hosting platform timeouts (cite the platform config if present).
- Single-process assumptions that break with >1 instance: in-memory job queues, in-memory rate limiters, local-disk storage, setInterval workers.
- Body-size limits (e.g. express.json limit) vs. what the app sends upstream.
- Quantify where you can from code: "each report runs N LLM calls sequentially" with the loop cited. Don't speculate about load numbers you can't see — put 'real traffic unknown' in could_not_verify.`,
  artifacts: ["routes", "files"],
  stageWeights: [0.3, 0.5, 0.9, 1.1],
  typeFactor: { saas: 1.0, sdk: 1.0, internal: 0.7 },
  stageNotes: {
    concept: "Scale is not a concept-stage concern unless growth is unbounded per user.",
    pilot: "5-10 users won't find scaling limits; unbounded per-session growth still bites.",
    beta: "Public traffic finds the 10x limits.",
    ga: "Scaling failures during launch traffic are the most visible kind.",
  },
});
