# launchcheck Quick Start

Get a launch-readiness evaluation in 5 minutes.

## Prerequisites

- **Node 20+** — Verify with `node --version`
- **Claude Code CLI** — `claude --version` (we use Claude Sonnet for analysis)

If you don't have Claude Code yet: `npm install -g @anthropic-ai/claude-cli`

## Installation

```bash
npm install -g @jlpanetta/launchcheck
```

Verify it installed:
```bash
launchcheck --version
```

## Evaluate your project

```bash
cd /path/to/your/project
launchcheck run
```

That's it. launchcheck will:

1. **Analyze** your code across 19 lenses (security, compliance, performance, etc.)
2. **Test** your app (runs `npm test` and `npm audit` in a sandbox)
3. **Probe** your routes (if applicable)
4. **Verify** findings (challenges its own claims to reduce false positives)
5. **Report** a verdict: **NOT READY**, **READY WITH CAVEATS**, or **READY**

### Wait, what's the verdict mean?

- **NOT READY** — Critical issues block launch. Fix these first.
- **READY WITH CAVEATS** — You can ship, but watch these issues. Address them soon.
- **READY** — No blockers. Go ship.

The verdict is yours to interpret. launchcheck proposes; you decide.

## Where's the report?

Reports go to `.launchcheck/runs/<run-id>/`:

- **`report.html`** — Open in a browser. Read this first. It's self-contained (no external resources).
- **`report.md`** — Markdown version. Good for pasting into tickets or Slack.
- **`report.json`** — Full data (machine-readable). For CI/CD integration.

Example:
```bash
open .launchcheck/runs/latest/report.html
```

## Want to share the report?

Copy it to your desktop in one command:

```bash
launchcheck share
# Outputs: ~/Desktop/launchcheck-my-project-2026-10-03.html
```

It's a single self-contained file. Email it, drag it into Slack, whatever. Works offline.

## What if you want to evaluate multiple projects?

Create a `projects.json`:

```json
{
  "projects": [
    {
      "id": "api",
      "name": "API Service",
      "path": "~/repos/api-service",
      "stage": "ga"
    },
    {
      "id": "web",
      "name": "Web App",
      "path": "~/repos/web-app",
      "stage": "beta"
    }
  ]
}
```

Then:
```bash
launchcheck batch projects.json
```

Evaluates all projects in parallel. Produces:
- `portfolio-<date>.html` — Dashboard showing all projects
- `portfolio-<date>.json` — Raw data

## Useful flags

```bash
launchcheck run [path]
  --stage=ga              # GA, beta, pilot, or concept
  --type=saas             # SaaS, SDK, or internal
  --lenses=security,compliance  # Run only specific lenses (faster)
  --no-probe              # Skip runtime testing (faster)
  --no-tests              # Skip npm test (faster)
  --json-output           # Output JSON for CI/CD
  --keep-sandbox          # Keep temp copy after run (for debugging)
```

### Example: Quick security spot-check

```bash
launchcheck run --lenses=security --no-probe
```

Takes ~2 minutes instead of 10. Good for re-checking a fix.

## Integration with GitHub Actions

Add to your `.github/workflows/launchcheck.yml`:

```yaml
name: launchcheck
on: [pull_request, push]

jobs:
  launchcheck:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-cli
      
      - name: Install launchcheck
        run: npm install -g launchcheck
      
      - name: Run launchcheck
        run: launchcheck run . --json-output > /tmp/report.json
      
      - name: Check verdict
        run: |
          VERDICT=$(jq -r '.verdict.verdict' /tmp/report.json)
          echo "Verdict: $VERDICT"
          [ "$VERDICT" = "NOT_READY" ] && exit 1 || exit 0
      
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: launchcheck-report
          path: .launchcheck/
```

Now every PR gets evaluated. Failing launch-readiness checks fail the CI.

## Want to improve the rubric over time?

After a real incident or launch, run:

```bash
launchcheck calibrate
```

This lets you record:
- **False negatives** — "This broke in prod; we should have caught it"
- **False positives** — "We flagged this but it's actually fine because..."

launchcheck learns and adjusts weights automatically.

## Need help?

- **Check the README:** `README.md` has full docs
- **See all commands:** `launchcheck --help`
- **Report a bug:** `https://github.com/futreeng/launchcheck/issues`
- **Security issue?** Email `security@futreeng.com`

## What happens with my code?

- Runs locally (no uploads by default)
- Redacts all secrets
- Reports stored in `.launchcheck/` (you control)
- Sandbox execution (no prod touches)
- See `SECURITY.md` for full details

## Cost?

Free to run. launchcheck costs ~$0.40/run in Claude API calls (agent analysis). You only pay if using Pro tier (managed service, coming Q1 2027).

## Next steps

1. Run `launchcheck run` on your project
2. Read the HTML report
3. Share findings with your team
4. Fix blockers before shipping
5. Re-run after fixes to verify
6. Record outcomes via `launchcheck calibrate` if needed

---

**Ready to ship with confidence?** Start with `launchcheck run`. 🚀
