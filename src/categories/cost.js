"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "cost",
  title: "Cost exposure",
  question: "For every paid LLM/API/data call: is there a bound on cost per user, per session, per day? Can a bug or an abusive user run up an unbounded bill?",
  hunt: `
- Enumerate every paid external call site (LLM providers, scraping/data vendors like Bright Data/Apify, email, image APIs). For each: what triggers it, can an anonymous or free user trigger it, and what caps it (per-user quota, per-day global cap, max tokens, max retries, max posts scraped)?
- Retry loops and fallbacks that multiply cost (a 4-provider fallback ladder = up to 4x calls on failure; retries without a cap; a poller that re-triggers work).
- Global caps: find the actual numeric defaults (e.g. FREE_RUNS_PER_DAY) and compute the worst-case daily spend from any per-call cost figures the repo documents. Cite both the default and the cost source. If costs are not documented anywhere, say so under could_not_verify.
- Is the cap enforced server-side before the spend, or counted after the fact? Is it keyed on something an attacker controls (e.g. a handle string, an IP behind a proxy, a new account per email with no verification)?
- Probe it where safe: e.g. call the free/anonymous endpoint that triggers paid work twice with the same and different identifiers and see whether the second call is refused. NOTE: the sandbox has no real API keys, so the paid call itself will fail — you're testing whether the gate refuses BEFORE attempting the call.
- Dev/test bypass flags that disable metering, and whether they're safely off by default.`,
  artifacts: ["probe", "routes", "env-example"],
  canProbe: true,
  stageWeights: [0.6, 1.0, 1.3, 1.4],
  typeFactor: { saas: 1.1, sdk: 0.8, internal: 1.0 },
  stageNotes: {
    concept: "Even a concept can burn money if a key leaks or a loop runs away.",
    pilot: "A shared link can turn a pilot into an unbounded bill.",
    beta: "Public access multiplies any unbounded spend.",
    ga: "Cost per customer must be bounded below price per customer.",
  },
});
