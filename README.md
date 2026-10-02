# launchcheck

Futreeng's internal launch-readiness evaluator. Point it at any project and it tells you, with evidence, where the project stands and what will bite you if you ship now. It proposes a verdict. **You decide.** It never deploys, never fixes anything, and never touches production.

```
node bin/launchcheck.js run C:\path\to\project
```

That's the whole interface for the common case. Everything below is for when you need more.

---

## Setup (once)

1. **Node 20+** (built and tested on Node 24, Windows 11).
2. **Claude Code CLI** installed and logged in (`claude --version`). launchcheck finds it on PATH or at `~/.local/bin/claude.exe`. Override with `LAUNCHCHECK_CLAUDE_BIN`.
3. **Global command** (optional but recommended):
   ```bash
   cd C:\path\to\future-tools\launchcheck
   npm link
   ```
   Now you can run `launchcheck` from anywhere.

**Zero dependencies:** launchcheck has zero npm dependencies on purpose. It adds no supply-chain risk to the projects it evaluates.

## Commands

| Command | What it does |
|---|---|
| `launchcheck run [path]` | Full evaluation (default: current directory). Measured: ~19 min / $14 on a 13-file app; see `history` for Convergence-sized numbers. `--lenses=` subsets cost proportionally less (3 lenses ≈ $3.50). |
| `launchcheck batch [config.json]` | Evaluate multiple projects from a `FutureengProjects.json` config file. Produces a portfolio dashboard showing all projects' verdicts, findings, and costs. `--only=project-id,other-id` to subset. `--lenses=` applies across all projects. |
| `launchcheck share [path]` | Copies the latest HTML report to your Desktop as `launchcheck-<project>-<date>.html` and prints the path. Drag it into Slack or email. |
| `launchcheck diff [path]` | Latest run vs the one before: new / resolved / still present / severity changed. |
| `launchcheck history [path]` | Every past run with verdict, counts, rubric version, cost. |
| `launchcheck calibrate [path]` | After a real launch or incident, tell it what it missed and what it over-flagged. **This is how it gets better.** |
| `launchcheck lenses` | List lens ids (for `--lenses=` and calibration). |

Useful `run` flags. None are required.

- `--stage=concept|pilot|beta|ga`: who you're about to ship **to** (concept = just us, pilot = known testers, beta = public but free, ga = paying customers). Inferred if omitted. If it can't infer confidently and you're at a terminal, it asks **one** question and saves the answer in `.launchcheck/project.json`.
- `--type=saas|sdk|internal`: inferred if omitted.
- `--lenses=security,monetization`: run a subset (cheaper; good for re-checking a fix).
- `--model=` / `--verifier-model=`: defaults `sonnet` / `opus`.
- `--no-probe`, `--no-tests`, `--no-audit`, `--no-exec`: skip runtime steps. Skipped steps show up as **could-not-verify**, never as passes.
- `--yes`: never ask a question; state assumptions instead.
- `--keep-sandbox`: keep the temp copy for inspection.

Exit codes: `0` ran (whatever the verdict), `1` error, `2` bad usage, `3` **refused** (production config / live credentials in scope).

## What a run actually does

1. **Safety gate.** Before anything else, it refuses to run (exit 3, no files written, no process started) if production config or live credentials are in scope:
   - an env file in the project with `NODE_ENV=production`, a live Stripe key, AWS keys, or a remote database URL with credentials;
   - a live-looking secret hardcoded in any project file that would be copied and executed;
   - your shell itself looks like prod.
   
   Ordinary dev credential files (`.env` with dev API keys, `.vercel/`, key files) are **quarantined**: never copied into the sandbox, agents are denied read access, and every known secret value is redacted from all output. The refusal message says how to proceed, e.g. evaluate a clean `git clone` instead.
2. **Profile.** Infers type and stage from the repo (billing code, servers, deploy configs, stage wording in docs) and states *why* in the report.
3. **Evidence** (deterministic, no LLM):
   - git state;
   - file inventory;
   - env var names documented vs read in code;
   - manifests and a license scan from lockfiles;
   - the credential scan;
   - a static test inventory (tests not run by any script, zero-assertion and `assert(true)` tests);
   - route discovery.
   
   Then in a **sandbox**: a temp copy of what git would commit, minus credential files, with `node_modules` linked read-through, a scrubbed environment (fake HOME, no inherited secrets, no dev-bypass flags), and fresh local state. There it:
   - runs the real test suite (`npm test`);
   - runs a real `npm audit`;
   - boots the app and sends every discovered route a request with **no credentials** (`probe-sweep`).
4. **16 independent lens agents** (Claude Code, read-only tools), one per lane. Each sees only its own lane:
   - functional correctness & tests;
   - security;
   - data & privacy;
   - reliability;
   - performance;
   - cost exposure;
   - ops for a two-person team;
   - dependencies & licensing;
   - docs & bus-factor;
   - monetization correctness;
   - design/UX *completion* (never design taste);
   - legal surface (only "this appears to be missing");
   - **data privacy & state compliance** (CCPA, VPBA, COPPA, GDPR, data retention, encryption, deletion/export endpoints);
   - validation evidence;
   - rollback & incident response;
   - project-specific risk not covered by the rest.
   
   Lenses that can test behavior attach **probe sequences** (e.g. "sign up a free user, then GET the paid report"). Those are executed for real against the sandbox.
5. **Mechanical evidence check.** Every citation is verified: the file exists, the lines exist, and the quoted text is actually there (or the artifact excerpt is actually in the artifact). A claim whose evidence all fails is **dropped**, and listed in "Dropped claims" for transparency.
6. **Adversarial verifier** per lens. It runs in a fresh context on a different model (Opus vs Sonnet), sees only the claims and evidence (not the lens agent's reasoning), and its only job is to break them. It also attacks every claimed "pass" (hollow tests, auth that a probe contradicts, clean audits of empty lockfiles). The merge rules are mechanical:
   - "refuted" without valid counter-evidence becomes **contested**;
   - a claim the verifier ignores is **contested**;
   - a failed verifier leaves claims **unverified**;
   - a pass shown to be hollow becomes a **finding**.

   **Verifier canary:** on every run with a working probe, one verifier also gets a claim launchcheck *knows* is false: "route X has no auth guard", for a route the sweep saw return 401/403. It carries an ordinary-looking id. If the verifier refutes it, the refutation mechanism is demonstrably working. If it **confirms** it, that verifier is rubber-stamping, and every one of its "confirmed" verdicts is downgraded to contested. The result is printed as "Verifier self-check" in every report.
7. **Verdict**, computed by fixed rules (no LLM writes it, so no LLM can soften it):
   - **NOT READY**: any blocking critical/high finding the verifier *confirmed*.
   - **READY WITH CAVEATS**: otherwise, if any of these hold: a blocker is contested; a confirmed serious issue exists; an important lens failed to run; a high-stakes question couldn't be verified.
   - **READY**: none of the above.
   
   The exact rules are printed at the bottom of every report.

## Reading the report

Each run writes `.launchcheck/runs/<run-id>/` in the **target** project, containing `report.html`, `report.md`, `report.json` and `evidence/*.txt`. It also writes a full record to `.launchcheck/history/<timestamp>-<sha>.json`.

- **Severity vs confidence are separate.** Severity is how bad it is if true. Confidence is how sure we are that it's true. High-severity/low-confidence items are shown as exactly that.
- **CONFIRMED** means the verifier tried to refute it and couldn't. **CONTESTED** means a human has to look. **REFUTED** findings are kept at the bottom with the counter-evidence, so you can see what was ruled out and why.
- **Could not verify** is a first-class section. Those items are questions nobody has answered, not passes. If it's ever empty, be suspicious.
- **Downweighted lenses** are listed with the reason. For example, ops tooling isn't expected on a concept. Effective weight = rubric weight × (0.5 + 0.5 × the lens's own applicability score), so a lens can argue its own weight down by at most half.
- **"Found by N separate checks"**: independent lenses often hit the same bug from different angles (an IDOR is a security, privacy and paywall issue). The summary merges them only when they share a key, or cite mostly the same lines *and* make a similar claim. This is deliberately conservative, since hiding a distinct issue is worse than showing a near-duplicate. The full detail lists every lens's finding separately.
- **Since last run** comes from matching stable finding keys across runs. An issue only counts as "resolved" if that lens actually ran both times.

## Portfolio: Batch evaluation across Futreeng projects

Create a `FutureengProjects.json` file:

```json
{
  "name": "Futreeng Product Portfolio",
  "projects": [
    {
      "id": "convergence-app",
      "name": "Convergence",
      "path": "~/OneDrive/Desktop/convergence-app/convergence-app",
      "stage": "ga",
      "owner": "Joe & Haron"
    },
    {
      "id": "clipscore",
      "name": "ClipScore",
      "path": "~/Desktop/clipscore",
      "stage": "pilot",
      "owner": "Joe"
    }
  ],
  "reports_dir": "~/Desktop/launchcheck-reports"
}
```

Then:

```
launchcheck batch FutureengProjects.json
```

Evaluates all projects in parallel (5 concurrent agents per project), collects results, and produces:
- `portfolio-<date>.json` — raw verdicts, findings counts, costs
- `portfolio-<date>.html` — dashboard showing all projects' status at a glance

Use `--only=convergence-app,clipscore` to run a subset. Use `--lenses=security,monetization` to spot-check just one lens across all projects (~$3–4 per project).

## Handing a report to Haron

```
launchcheck share C:\path\to\project
```

It prints something like `C:\Users\jlpan\Desktop\launchcheck-convergence-app-2026-09-29.html`. Drag that file into Slack or attach it to an email. It's a single self-contained file: no JavaScript, no external fonts or images, no network requests, nothing else from the repo needed. It opens by double-clicking in any browser, in light or dark mode.

What Haron sees first:
- the verdict in plain words;
- the 3–5 things that matter most, one sentence each;
- a **"Waiting on Haron"** box listing anything blocked on frontend/design/marketing work;
- what couldn't be checked.

All technical evidence, including the raw artifacts, is embedded below that in a collapsed "Full technical detail" section.

To drop it somewhere else (e.g. a shared folder once you have one): `launchcheck share <path> --to=D:\Shared\reports`.

## Calibration: how it gets better

After a real launch or incident, run:

```
launchcheck calibrate C:\path\to\project
```

It asks two things. Or you can script it with flags:

```
launchcheck calibrate <path> --missed="Thumbnails on ephemeral disk vanished on redeploy" --lens=reliability --severity=high --blocking --note="beta launch 10/2"
launchcheck calibrate <path> --false-positive=F-security-3 --reason="Route is only reachable from the admin VPN"
```

**Something it missed (false negative)** does three things:
- It becomes a named **standing check** (`SC-001`, …) for that lens. Every future run must report pass / fail / could-not-verify on it. If the lens doesn't report it, it shows as *unknown*, never as a pass. A fail with evidence becomes a finding automatically.
- That lens's weight goes up by 0.15 for this project's type/stage. The same delta is recorded in `~/.launchcheck/type-weights.json`, so new projects of the same type start with it. Existing projects keep their own rubric.
- It's appended verbatim to `.launchcheck/lessons/<project>.md`.

**Something it over-flagged (false positive)** does three things:
- It becomes a **precedent** (`FP-001`, …) the verifier is shown on every future run: "we flagged this shape of thing before and it turned out fine because X; does that apply here?"
- Findings with that key are down-ranked (confidence multiplier ×0.7, floor 0.3; below 0.75 the confidence drops a level).
- It's appended verbatim to the lessons file.

`rubric.json` is plain JSON and hand-editable. Every change bumps `version`, adds a `changelog` entry saying what changed and why, and snapshots `rubric-history/rubric.vN.json`. To revert, copy an old snapshot over `rubric.json`. The lessons `.md` file is the human-readable log; **`rubric.json` is what changes behavior.**

## Per-project settings: `.launchcheck/project.json`

Optional. Created when you answer the stage question.

```json
{
  "profile": { "stage": "beta" },
  "fake_secret_allowlist": ["test/fixtures/stripe-webhook.json"],
  "probe": {
    "start": ["node", "server/server.js"],
    "cwd": ".",
    "port_env": "PORT",
    "ready_path": "/health",
    "env": { "SOME_NON_SECRET_FLAG": "1" }
  }
}
```

`probe.env` must never hold real credentials. It goes through the same safety scan.

## Should `.launchcheck/` be committed?

Your call. History and the rubric are the tool's memory, and committing them makes "better or worse since last week" survive a laptop loss. Everything in them is redacted of known secret values, but reports do quote code. Treat them like the code itself.

## Architecture

```
bin/launchcheck.js        CLI entry
src/cli.js                command parsing
src/orchestrator.js       the pipeline above
src/safety.js             refusal, quarantine, redaction
src/detect.js             type/stage inference (+ the one question)
src/sandbox.js            temp copy + scrubbed env
src/evidence/             static scans, routes, test/audit execution, runtime probe
src/categories/           one module per lens: question, what to hunt, stage weights
src/prompts.js            lens and verifier prompts
src/agents/               backend interface: claude-code (tested), gemini (experimental)
src/validate.js           mechanical evidence checking
src/verify.js             adversarial pass + merge rules
src/verdict.js            deterministic verdict
src/report.js, html.js    Markdown / self-contained HTML / diff
src/calibrate.js          learning loop
src/store.js              .launchcheck/ layout
test/unit/                node --test suite (npm test)
test/fixtures/borderline-saas/   a small SaaS with planted issues (see scripts/make-fixture.js)
```

**Adding a lens:** add a file in `src/categories/` using `defineLens` (copy an existing one) and list it in `src/categories/index.js`. Existing projects pick up its default weight automatically.

**Cross-model verification (the Convergence idea):** the verifier backend is pluggable (`src/agents/index.js`). Today both roles use Claude Code, so "different model" means Opus verifying Sonnet: same family, independent context. That is weaker than true cross-family disagreement. `--verifier=gemini` exists (needs `GEMINI_API_KEY`) but was **never run end-to-end**: no key was available while building v1. Treat it as a starting point and test it before trusting it. Convergence itself doesn't expose a server-side cross-check endpoint (its dual-model orchestration runs in the browser; the server only proxies each provider on its own). Using real Convergence means either adding such an endpoint there or using the gemini backend. Either way, it's one new file with the same `run()` shape.

## Known limits (v1)

- The runtime probe needs a plain `node <file>` start (or `probe.start` in project.json) and an app that honors `PORT`. If the app won't boot, the report says so, and everything runtime-dependent becomes could-not-verify.
- Route discovery is static and Express/Next-shaped. Routes it can't place get probed at their bare path and marked `prefix?`. Lens agents can still probe anything explicitly.
- The sandbox doesn't block outbound network. It relies on having no credentials: paid calls fail rather than being prevented. It links `node_modules` read-through, so a test that writes into `node_modules` writes to the real one.
- Unity / non-Node projects get the static evidence and the agents, but no test execution or runtime probe yet.
- A full run costs real agent usage (see `history` for the actual per-run cost).

## Explicitly out of scope

- **Judging visual/UX design quality.** That's Haron's call. The design lens only asks "wired or placeholder?"
- **Automatically fixing anything** it finds.
- **Any action against a production system.** It refuses when prod config is in scope, and only ever talks to a sandboxed localhost copy.
- **Legal advice.** The legal lens only reports that a document appears to be missing or contradicts the code.
- A hosted portal or login for reports. A plain HTML file is the right size for two people.
