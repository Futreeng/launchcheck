# Contributing to launchcheck

First, thanks for wanting to improve launchcheck. We're working to make launch-readiness evaluation rigorous and trustworthy.

## What we need help with

- **New lenses** — Categories of risk we haven't thought of yet. See [src/categories/](src/categories/) for the shape.
- **Probe improvements** — More specific ways to detect problems (e.g., verify backup restore actually works, not just that backups exist).
- **Evidence validation** — Catching false claims mechanically (hardcoded secrets, circular dependencies, etc.).
- **Documentation** — Use launchcheck, hit a wall? Tell us. Write a guide.
- **Bug reports** — Found a false positive? A false negative? A crash? Open an issue with the report and the project path.

## Setup

1. **Node 20+** (we test on Node 24, Windows 11).
2. **Claude Code CLI** (`claude --version`, or we won't be able to run the lenses).
3. Clone the repo:
   ```bash
   git clone https://github.com/futreeng/launchcheck.git
   cd launchcheck
   npm install
   ```
4. Run tests:
   ```bash
   npm test
   ```

All tests should pass. If they don't, check that Claude Code is available on PATH.

## Code style

- No dependencies by design (keeping supply-chain risk low).
- Default to no comments. Add one only if the WHY is non-obvious.
- Default to no error handling for things that can't happen. Trust internal guarantees.
- Prefer small, single-purpose functions over abstractions.
- Keep test-to-code ratio high; aim for 100% mechanical coverage on critical paths (evidence validation, verdict logic).

## Adding a lens

Lenses live in [src/categories/](src/categories/). Copy an existing one:

```javascript
// src/categories/my-lens.js
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "my-lens",
  title: "My Lens Title",
  question: "What are you checking for?",
  hunt: `
    **What to look for:**
    - Thing 1
    - Thing 2
  `,
  probes: [
    {
      id: "probe-1",
      prompt: "Check for X. Look in files A, B, C.",
      timeout: 60,
    },
  ],
  artifacts: ["files", "routes", "env"],
  stageWeights: [0.0, 0.3, 0.8, 2.0], // concept, pilot, beta, ga
  typeFactor: { saas: 2.0, sdk: 1.2, internal: 0.1 },
  stageNotes: {
    concept: "Not relevant at concept stage.",
    pilot: "Basic checks expected.",
    beta: "All checks should pass.",
    ga: "Must pass.",
  },
});
```

Then register it in [src/categories/index.js](src/categories/index.js):

```javascript
const myLens = require("./my-lens");
const LENSES = [
  // ... existing lenses ...
  myLens,
];
```

Run tests to verify it wires up:

```bash
npm test
```

## Fixing a false positive

If launchcheck flagged something that's actually fine:

1. Open an issue with:
   - The exact finding text
   - Why it's a false positive
   - What the code actually does
   - The lens ID
2. We'll add a precedent to the rubric so it downranks similar findings next time.

## Fixing a false negative

If launchcheck missed something real:

1. Open an issue with:
   - What broke or what you wish we'd caught
   - Project path (if public) or code snippet
   - The lens ID (or which lens should have caught it)
   - How serious it is (blocking, high, medium, low)
2. We'll either add a probe or tighten an existing one.

## Testing your changes

```bash
npm test
```

Should be green before opening a PR. If you added a lens, add a test for it in [test/unit/](test/unit/):

```javascript
describe("my-lens", () => {
  it("detects X", async () => {
    const finding = await run("my-lens", { /* fixture */ });
    assert(finding.some(f => f.title.includes("X")));
  });
});
```

## PR guidelines

- One lens per PR, or one improvement per PR.
- Title: "Add my-lens" or "Improve probe-x" or "Fix false positive in security lens".
- Description: Why are we making this change? What does it do? Any risks?
- Tests must pass.

## Code of conduct

Be kind. launchcheck is used by real teams making real decisions. We're solving a hard problem together.
