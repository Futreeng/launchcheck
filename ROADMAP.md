# launchcheck Roadmap

## v1.0 (Current) ✅

**Open-source launch.** Self-hosted CLI, 19 lenses, full evidence validation and adversarial verification.

- ✅ 19 comprehensive lenses
- ✅ Adversarial verification (Sonnet vs Opus)
- ✅ Evidence validation (mechanical, not LLM)
- ✅ Sandbox execution (no production touches)
- ✅ Org-wide rubric inheritance
- ✅ GitHub Actions CI/CD workflows
- ✅ Calibration learning loop
- ✅ HTML/MD/JSON reports
- ✅ Portfolio batch evaluation
- ✅ Open-source (MIT license)

**No breaking changes expected in v1 minor versions.**

---

## v1.1 (Q4 2026)

**Open-source hardening.** Better docs, IDE extensions, GitHub App.

### New features

- Custom lens builder UI (define new lenses via web form)
- GitHub App integration (auto-evaluate on PR)
- IDE extensions (VS Code, JetBrains)
  - Run launchcheck from editor
  - Show findings inline
  - Fix suggestions via autocomplete
- Findings-as-code (YAML/JSON for auto-remediation)
- Improved codebase size handling (>500K lines)
- Multi-language probe execution (Python, Go, Ruby, etc.)

### Quality improvements

- Better onboarding (guided setup wizard)
- Improved false positive handling
- Performance optimizations (parallel lint, cache)
- Better error messages

### Docs

- Video walkthrough
- Tutorial (30-min end-to-end)
- FAQ expansion
- Community lens examples

---

## v2.0 (Q1 2027)

**Managed service launch.** Pro tier with portfolio dashboard, history, and integrations.

### Backend infrastructure

- Multi-tenant API server (Express)
- PostgreSQL database
- Redis job queue
- S3 result storage
- Stripe billing

### Features

- User accounts (GitHub OAuth)
- Project management (add/edit/delete)
- Evaluation submission (API)
- Evaluation history (2-year retention)
- Portfolio dashboard
  - Multi-project view
  - Trends over time
  - Blockers aggregation
  - Cost tracking
- Notifications
  - Slack channel integration
  - Email summaries (daily/weekly/on-change)
  - Webhooks for CI/CD

### Pricing & billing

- Free tier (unlimited self-hosted, no backend)
- Pro tier ($149–499/mo based on team size)
- Stripe integration
- Usage-based billing (evaluations per month)

### Security

- End-to-end encryption for stored reports
- SOC 2 Type II compliance
- Data residency options (US/EU)
- Audit logging

---

## v2.1 (Q2 2027)

**Enterprise tier.** Custom lenses, on-premise, VPC isolation.

### Features

- Custom lens builder (UI + backend)
- VPC-isolated evaluation
  - Evaluations run in customer's private subnet
  - Code never leaves customer network
- On-premise deployment
  - Docker image
  - Terraform/CloudFormation templates
  - Kubernetes Helm chart
  - Installation guide
- Enterprise API
  - Batch submission
  - Scheduled evaluations
  - Custom webhooks
- SAML/OIDC authentication
- SLA (99.5% uptime guarantee)
- Dedicated support (Slack, email, Zoom)

### Compliance & audit

- SOC 2 audit trail
- ISO 27001 ready
- GDPR data export
- Audit report generation
- Compliance dashboard (CIS, NIST, etc.)

### Pricing

- Enterprise tier ($2k–10k/mo depending on scope)
- Custom SLAs
- Volume discounts

---

## v2.2+ (Late 2027+)

### Potential features

- **AI pair programmer** — Auto-fix common findings
  - Suggest code changes
  - Generate migration scripts
  - Create missing endpoints
- **Rubric marketplace** — Share rubrics with community
  - Industry rubrics (FinTech, HealthTech, etc.)
  - Stage-specific rubrics (concept → GA)
  - Company rubrics (public companies publish their standards)
- **Cross-project patterns** — Trends across portfolio
  - Security hotspots
  - Performance bottlenecks
  - Shared dependencies at risk
- **Predictive analytics**
  - Predict launch readiness based on project history
  - Flag projects likely to have issues
  - Recommended order of evaluation
- **Convergence-style cross-model verification** (if Anthropic exposes cross-model evaluation)
- **Non-Node support** (Python, Go, Rust, etc. – full parity)
- **Mobile app** (iOS/Android for dashboard access on-the-go)

---

## Support & deprecation

### Minimum supported versions

- Node: 20+ (LTS or newer)
- OS: macOS 12+, Windows 10+, Ubuntu 20.04+

### Deprecation policy

- 12 months notice before removing a feature
- Changelog entry marked **DEPRECATED** 2 major versions before removal
- Clear migration path documented

### Breaking changes

- None planned for v1.x
- v2.0 may introduce breaking API changes (noted in changelog)
- v3.0 may require Node 22+

---

## How to request features

1. **Check the roadmap** — Is it already planned?
2. **Open an issue** on GitHub with:
   - What problem you're trying to solve
   - How you'd use the feature
   - Why it matters for launch readiness
3. **Upvote existing issues** (👍 emoji) to show interest
4. **Contribute** — PRs welcome for features on the roadmap

---

## What we won't do

- **Automatically fix things.** launchcheck reports; you decide.
- **Patch production systems.** No deploy automation.
- **Legal/compliance advice.** We flag missing docs; we don't interpret laws.
- **Visual design judgment.** That's your product team's call.
- **Closed-source tiers.** Core will always be open-source.

---

**Last updated:** 2026-10-03
**Next review:** 2026-11-01
