"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "dependencies",
  title: "Dependency & licensing risk",
  question: "Are dependencies vulnerable, abandoned, or badly pinned, and is any dependency's license incompatible with selling this commercially?",
  hunt: `
- Use the npm-audit artifacts (real 'npm audit' output) — do not guess vulnerability status. Distinguish prod vs dev deps and reachable vs unreachable paths. If the audit failed (network, no lockfile, near-empty lockfile), that is could_not_verify, not a pass. A lockfile that doesn't cover the real dependency tree (e.g. root lockfile empty while deps live in a subfolder) is worth noting.
- Use the licenses artifact: copyleft (GPL/AGPL/SSPL/LGPL, incl. transitive native binaries), 'UNLICENSED', 'SEE LICENSE IN', or missing licenses in PRODUCTION dependencies of a commercial product. LGPL via dynamically-linked native libs is usually fine but must be stated, not ignored. Say plainly you are flagging license strings, not giving legal advice.
- Dependencies required in code but missing from package.json (they work locally by accident, break in a clean install) — cite the require and the package.json.
- Duplicate/conflicting dependency manifests (two package.json with divergent versions of the same lib), major versions far behind, deprecated packages.
- Unpinned or wildcard versions ("*", "latest"), install scripts from unknown packages.`,
  artifacts: ["npm-audit", "licenses", "package-scripts", "files"],
  stageWeights: [0.4, 0.6, 0.9, 1.1],
  typeFactor: { saas: 1.0, sdk: 1.2, internal: 0.7 },
  stageNotes: {
    concept: "Dependency hygiene can wait until something ships.",
    pilot: "Known-exploitable vulns matter once others run it.",
    beta: "Public exposure makes reachable vulns real.",
    ga: "Selling it makes licensing real.",
  },
});
