"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "security",
  title: "Security",
  question: "Is authentication/authorization actually enforced at runtime, do secrets stay out of the client and logs, what is the injection surface (SQL/NoSQL/command/prompt), and what does a real dependency audit say?",
  hunt: `
- AUTH MUST BE TESTED, NOT READ. The probe-sweep artifact shows what every discovered route returned to a request with NO credentials against a sandboxed copy of the app. A route that returns 2xx with real data while it should require auth is a finding; cite the probe line. If code looks guarded but the probe shows otherwise, trust the probe. If the sandbox didn't boot, say so under could_not_verify rather than assuming.
- Attach probe sequences to any authz suspicion you can test: e.g. sign up as user A, create a resource, sign up as user B, read A's resource by id (IDOR); call an admin route with a normal user token; send a forged/expired JWT; call with an 'Authorization: Bearer x'. Say what a secure app would return in secure_expectation.
- Secrets: API keys or tokens reachable from client-side code (public/, static bundles, config.js served to the browser), keys logged to console, keys in error responses. The secrets-scan artifact covers committed credentials (quarantined env files are off-limits to you by design; don't try to read them).
- Encryption claims (e.g. "API keys encrypted at rest with AES-256-GCM"): check the actual implementation — IV reuse, key derived from a hardcoded/default secret, fallback to plaintext when the key env var is missing.
- Injection: string-built SQL, shell exec with user input, path traversal in file reads/serving, eval. PROMPT INJECTION for LLM-backed features: user-controlled or scraped third-party content (profiles, posts, web pages) concatenated into prompts that also carry instructions/tools/secrets, and model output trusted as structured data or rendered as HTML without escaping.
- Session/JWT: default or weak secrets, missing expiry, tokens in localStorage vs httpOnly cookie, CORS with credentials and wildcard/reflected origin, missing rate limits on auth endpoints, dev bypass flags (e.g. an env var that disables auth) and whether they can be turned on accidentally in prod.
- Dependency vulns: use the npm-audit artifacts (real audit output). Weight by whether the vulnerable path is reachable, not by raw count.`,
  artifacts: ["probe", "routes", "secrets-scan", "npm-audit", "server-log", "env-example"],
  canProbe: true,
  stageWeights: [0.5, 0.9, 1.3, 1.5],
  typeFactor: { saas: 1.1, sdk: 1.0, internal: 0.8 },
  stageNotes: {
    concept: "No outside users yet; only issues that would leak credentials or data now matter.",
    pilot: "Known testers only, but their data and your API keys are real.",
    beta: "Public exposure: anyone can probe it.",
    ga: "Public + money: breaches are business-ending for a two-person company.",
  },
});
