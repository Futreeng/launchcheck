"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "monetization",
  title: "Business logic & monetization correctness",
  question: "Are tier boundaries enforced server-side (not just hidden in the UI), can a free-tier request reach paid functionality, and can a user be charged without getting a result or get a result without being charged?",
  hunt: `
- Find every paid capability and the server-side check that gates it (entitlement lookup, plan check). For each gate: is it applied on EVERY route that delivers the paid thing (including export/download/regenerate/poll/result endpoints, not just the 'start' endpoint)?
- TEST IT: attach probe sequences — sign up / get a free-tier session, then call paid endpoints directly (start job, fetch result, export). secure_expectation: 402/403. Also try: re-using a free run token on a paid route, skipping the checkout step, calling the 'grant entitlement' / webhook route directly without a valid signature (Stripe webhooks must verify signatures), tampering plan ids or prices in the request body.
- Async job/poll pattern: can a job be charged/metered and then fail with no refund/credit? Can a job's result be fetched by someone who didn't pay (guessable job ids)? Is metering incremented before or after success? Are there double-charge paths on retry?
- Mock billing: if payments are mocked (a fake 'subscribe' that grants entitlements for free), is that mock reachable in production config? Is there a clear, safe switch?
- Promo/discount/free-trial logic: can codes be reused, stacked, or enumerated?
- Pricing shown in UI vs enforced on server vs charged by the processor — do they agree? Cite each.`,
  artifacts: ["probe", "routes", "env-example"],
  canProbe: true,
  stageWeights: [0.2, 0.5, 1.0, 1.5],
  typeFactor: { saas: 1.3, sdk: 0.6, internal: 0.2 },
  stageNotes: {
    concept: "Nothing is sold at concept stage.",
    pilot: "Pilots are usually free; paywall bugs matter only if billing is live.",
    beta: "Paywall bypasses at beta train users to never pay.",
    ga: "Paywall and billing bugs are direct revenue loss.",
  },
});
