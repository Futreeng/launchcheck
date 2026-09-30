"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "ops",
  title: "Operational readiness (two-person team)",
  question: "Realistically for two people with no on-call team: is there enough logging to debug an 11pm incident, a version marker so a stale deploy is instantly visible, and backups of everything stateful?",
  hunt: `
- Do NOT grade against enterprise practice (no on-call rotation, no SRE runbooks expected). Grade against: could Joe debug a production failure from logs alone at 11pm?
- Logging: structured or at least consistent; request ids; errors logged with stack + which upstream; no logging of secrets. Error tracking (Sentry etc.) present or absent — cite.
- Version marker: an endpoint/header/footer that shows the deployed git sha or build id, so "is the fix live?" has an instant answer. Cite it or its absence.
- Health endpoint that checks real dependencies (and does not lie — see reliability).
- Stateful things and their backups: databases, uploaded files/thumbnails, JSON datastores. Is anything on ephemeral disk? Is there any backup or export job? A managed DB with a trial/credit expiry is a stateful risk; cite the doc that says so if present.
- Deploy config: how is it deployed (render.yaml, vercel.json, Dockerfile, railway.json)? Are required env vars documented next to it? Does a missing env var fail loudly at boot or silently degrade?
- Admin/observability: can the team see spend, errors, signups without querying the DB by hand?`,
  artifacts: ["files", "env-example", "server-log", "git"],
  stageWeights: [0.2, 0.5, 1.0, 1.3],
  typeFactor: { saas: 1.1, sdk: 0.7, internal: 0.6 },
  stageNotes: {
    concept: "A concept isn't deployed for others; ops tooling isn't expected yet.",
    pilot: "A pilot needs just enough logging to debug tester reports.",
    beta: "Public incidents need logs, a version marker, and backups.",
    ga: "Paying customers make backups and debuggability non-negotiable.",
  },
});
