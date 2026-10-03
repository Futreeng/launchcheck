# Security

## Reporting vulnerabilities

If you find a security vulnerability in launchcheck itself, please email security@futreeng.com instead of opening a public issue. Please include:

- Description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact
- Suggested fix (if you have one)

We'll acknowledge receipt within 48 hours and work with you on a fix.

## How launchcheck handles your code

**Your code never leaves your machine.** Here's what launchcheck does with it:

### What launchcheck reads
- Your project files (code, config, docs, lockfiles)
- Environment variable names (not values, see below)
- Routes and API signatures
- Test suite output
- `npm audit` results
- Git history (commits, branches)

### What launchcheck redacts
- All credential values (API keys, passwords, tokens, connection strings)
- Known secret patterns (AWS keys, Stripe tokens, etc.)
- Environment variable values that look like secrets
- Contents of `.env` files and credential files

The redaction is aggressive: if a value looks like it could be a secret, we remove it from all agent output and reports.

### What launchcheck runs
- `npm test` in a sandbox
- `npm audit` in a sandbox
- Your app startup (if probe execution is enabled) in a sandbox

The sandbox is an isolated temporary copy of your repo:
- No access to real credentials or env files
- No inherited shell environment
- No network access except to localhost during probing
- Cleaned up after the run

### What launchcheck sends out
- **Agents** (Claude Code): Your code and redacted evidence. The agent sees only what's needed for its lane (e.g., the security lens doesn't see your monetization code).
- **Reports**: Findings, verdicts, and evidence. Reports are stored locally in `.launchcheck/` unless you share them.

Reports can quote code. Treat them like the code itself—don't share them where the code isn't shared.

### What launchcheck does NOT do
- Modify your code
- Write to your codebase
- Call external APIs (except Claude Code)
- Store data remotely (unless you use the managed service)
- Execute arbitrary commands

## When running the managed service (Pro tier)

If you use launchcheck via our managed service (coming soon), we also:
- Store your evaluation results for historical comparison
- Keep a portfolio dashboard showing your project's history
- Never store your code or evidence beyond the report

You can:
- Delete all your data at any time
- Export your reports anytime
- Opt out of aggregated, anonymized metrics

See the [Privacy Policy](https://launchcheck.dev/privacy) for details.

## Known risks

**Runtime probes** — launchcheck can boot your app and send requests to it. The sandbox prevents network access, but a probe can:
- Trigger database writes (if your app's test mode does that)
- Exhaust CPU/memory (if a probe is malformed)

If this concerns you, run with `--no-exec` to skip runtime checks.

**Agent context size** — Lenses see portions of your codebase. If your codebase is very large (>100K lines), some lenses may not see all of it.

**LLM model behavior** — Lenses use Claude (Sonnet by default). Claude is a language model, not a static checker. It can:
- Miss subtle bugs
- Hallucinate findings
- Misunderstand architecture

That's why we have adversarial verification and mechanical evidence checking. But no tool is perfect.

## Incident response

If launchcheck runs and you see:

1. **A finding that exposes a real security risk**: Good. That's the point. Fix it before shipping.
2. **A finding that's wrong**: Open an issue or email us. We'll help you understand why it fired and may adjust the rubric.
3. **A crash or hang**: Email security@futreeng.com with the stack trace and `.launchcheck/runs/<run-id>/` directory.
4. **Unexpected behavior**: Run with `--debug` and send us the output.

## Credential safety checklist

Before running launchcheck on a project:

- [ ] No `.env.production` or live secrets in the repo
- [ ] No AWS keys, Stripe keys, or other live credentials hardcoded
- [ ] No API keys in test fixtures
- [ ] `.gitignore` excludes credential files

launchcheck will refuse to run if it detects production config or live credentials (exit 3). But it's safer to clean up first.

## Self-hosting

If you self-host the managed service backend:

- [ ] Store all reports in encrypted storage
- [ ] Never log or persist the full codebase
- [ ] Rotate evaluation credentials regularly
- [ ] Use network segmentation (evaluation sandboxes in isolated subnet)
- [ ] Log all evaluation requests (who ran it, when, on what)
- [ ] Have an incident response plan for credential breaches

See [DEPLOYMENT.md](DEPLOYMENT.md) for architecture details.

## Questions?

Email security@futreeng.com or open an issue on GitHub.
