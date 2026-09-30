"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "data-privacy",
  title: "Data handling & privacy",
  question: "What personal or customer data is actually stored, where, encrypted or not, is there a retention/deletion story, and is any of it real data from real people that deserves more care than synthetic data?",
  hunt: `
- Inventory what is stored: user records (emails, password hashes — check the hashing), OAuth tokens, scraped third-party personal data (social profiles, posts), payment identifiers, IP addresses, LLM transcripts. Cite the schema/model/write sites.
- Where it lives: flat JSON files, SQLite/sql.js files, Postgres, ephemeral container disk (data that silently disappears on redeploy is BOTH a privacy and a reliability issue — cite the config that makes it ephemeral).
- Real vs synthetic: look for committed data files, reports, exports, fixtures, screenshots, seeds that contain what look like REAL people's handles/emails/content (e.g. a reports/ dir of real accounts, seed files of real creators, pilot-tester lists). Real data committed to git is a finding.
- Deletion: is there an account-deletion or data-deletion path (route + actual delete of all copies incl. derived data/caches/thumbnails)? Retention: is anything swept? If a privacy policy promises deletion, does the code implement it?
- Logs: is PII or full LLM prompts/responses containing user data written to logs?
- Third-party processors: which external services receive user data (LLM providers, scrapers, email senders)? This matters for the privacy policy (legal lens covers whether the document exists; you cover what data actually flows).
- Use probes to check whether one user's data is readable by another or anonymously, where testable.`,
  artifacts: ["files", "routes", "probe", "env-example", "git"],
  canProbe: true,
  stageWeights: [0.4, 0.9, 1.2, 1.4],
  typeFactor: { saas: 1.1, sdk: 0.9, internal: 0.7 },
  stageNotes: {
    concept: "Little or no real user data yet; only committed real data matters.",
    pilot: "Pilot testers are real people; their data needs care even at small scale.",
    beta: "Public users' data at scale.",
    ga: "Customer data with contractual and regulatory weight.",
  },
});
