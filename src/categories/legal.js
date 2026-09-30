"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "legal",
  title: "Legal/compliance surface",
  question: "Does anything customer-facing collect data or take payment without a privacy policy or terms of service existing anywhere, and does anything obviously touch a regulated category?",
  hunt: `
- FLAG ONLY WHAT IS FACTUALLY MISSING OR FACTUALLY CONTRADICTED. You are not a lawyer and must not give legal analysis or opinions on adequacy. Say that explicitly in notes_on_downweighting.
- Does a privacy policy exist (file, route, page)? Terms of service? Refund/cancellation terms if anything is sold? Are they linked from signup/checkout? Cite the files/routes or their absence (a search that found nothing is evidence only if you cite the search artifact or list the places you looked in could_not_verify).
- Documents that are drafts or placeholders ("[Company Name]", "TBD", "lawyer review pending") — cite.
- Obvious regulated categories: payments (PCI scope if card data touches the server), children's data, health data, scraping third-party personal data at scale, marketing email (unsubscribe link + postal address), EU users (cookie consent) — flag presence, not compliance.
- A promise in a policy that the code contradicts (e.g. "we delete your data on request" with no deletion path): cite both the policy line and the code.`,
  artifacts: ["files", "routes"],
  stageWeights: [0.1, 0.5, 1.0, 1.3],
  typeFactor: { saas: 1.2, sdk: 0.8, internal: 0.3 },
  stageNotes: {
    concept: "No customers, no customer-facing legal surface yet.",
    pilot: "Pilot testers' data still warrants a stated policy.",
    beta: "Collecting public users' data requires a privacy policy.",
    ga: "Taking payment requires terms and a privacy policy.",
  },
});
