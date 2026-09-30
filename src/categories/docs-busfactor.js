"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "docs-busfactor",
  title: "Documentation & bus-factor",
  question: "Could someone — or Joe six months from now — stand this project back up from the docs alone? For a two-person company this IS the disaster-recovery plan.",
  hunt: `
- Walk the README's setup steps against the repo like a newcomer would: do the commands exist (package.json scripts), do referenced files exist, are all required env vars listed (compare env-example keys with the process.env reads in code — list vars read in code but undocumented)?
- Doc drift: claims in README/STATUS/handoff docs that the code contradicts (stack, auth mechanism, ports, "done" checklists). Cite the doc line AND the code line.
- Knowledge that lives only in one person's head: deploy steps, which hosting account, how to rotate keys, where the DB is, how to restore — present in docs or not.
- Doc sprawl: many overlapping handoff/status docs with conflicting instructions is a real bus-factor problem (which one is true?). Name the conflicting files.
- Cross-platform traps a future maintainer will hit (e.g. scripts that only work in bash on a Windows-primary team).`,
  artifacts: ["files", "env-example", "package-scripts", "git"],
  stageWeights: [0.8, 0.9, 1.0, 1.1],
  typeFactor: { saas: 1.0, sdk: 1.2, internal: 1.0 },
  stageNotes: {
    concept: "Even a concept is lost if only one head knows how it runs.",
    pilot: "Pilot support needs whoever is awake to be able to run it.",
    beta: "Public users need recovery to be possible for either founder.",
    ga: "Revenue depends on anyone being able to restore it.",
  },
});
