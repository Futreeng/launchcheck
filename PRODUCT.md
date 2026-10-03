# launchcheck: Product Strategy

## Vision

Every product launch should be evidence-backed, not hope-backed. launchcheck makes it possible for any team to have the rigor of a launch readiness review without needing specialists in security, compliance, ops, and design.

## Three tiers

### Free: CLI, self-hosted

For teams who want to evaluate their own projects.

- **Cost:** Free (open-source)
- **What you get:**
  - Full launchcheck CLI (19 lenses)
  - All analysis local to your machine
  - HTML/MD/JSON reports
  - Git integration (history, diffs)
  - Org rubric (via `~/.launchcheck/org-rubric.json`)
  
- **Target:** Individual developers, small teams, early-stage startups, open-source maintainers

### Pro: Managed evaluation + portfolio dashboard

For teams who want history, cross-project insights, and integration with Slack/email.

- **Cost:** $149–499/month (based on team size)
- **What you get:**
  - Everything in Free
  - We host and run your evaluations
  - Portfolio dashboard (multi-project view, trends, blockers)
  - Historical comparison (spot improvements since last run)
  - Slack/email summaries
  - API access for CI/CD integration
  - Encrypted result storage (2 years)
  - Priority support
  
- **Target:** Growth-stage startups, mid-market product teams, agencies evaluating client projects

**Pricing model:**
- Startup: $149/mo (up to 5 projects, 2 team members)
- Scale: $299/mo (up to 20 projects, 10 team members)
- Enterprise: $499/mo (unlimited projects, 25+ team members)

### Enterprise: Custom lenses + VPC-isolated evaluation

For regulated industries, SaaS platforms with many teams, or organizations with custom risk profiles.

- **Cost:** Custom (typically $2k–10k/mo depending on scope)
- **What you get:**
  - Everything in Pro
  - Custom lenses (tailored to your compliance regime or risk profile)
  - VPC-isolated evaluation (your code never touches our infrastructure)
  - On-premise deployment option
  - Dedicated support
  - SLA (99.5% uptime)
  - Audit trail and compliance reporting
  
- **Target:** Regulated industries (FinTech, HealthTech, InsureTech), platforms serving enterprise customers, companies with strict data residency requirements

---

## Go-to-market

### Phase 1: Open-source launch (Q4 2026)
- Publish to GitHub + npm
- Blog post: "Why we built launchcheck" (positioning on rigor, adversarial verification)
- Docs for self-hosting
- HN/Reddit posts
- Cold outreach to 50 product teams (offer free Pro tier for feedback)

**Goals:** 500 GitHub stars, 50 CLI installs/month, early user feedback

### Phase 2: Pro tier (Q1 2027)
- Managed evaluation backend (auth, queue, storage)
- Portfolio dashboard (Figma → React)
- Stripe integration
- Onboarding flow (5 minutes to first evaluation)
- Case studies (1–2 early customers)

**Goals:** 10 paid customers, $10k MRR, 1000 GitHub stars

### Phase 3: Enterprise tier + customization (Q2 2027)
- Custom lens builder (UI for defining new lenses)
- Enterprise API
- Self-hosted backend option
- Compliance audit prep materials

**Goals:** 2–3 enterprise customers, $50k MRR

---

## Competitive positioning

| Aspect | launchcheck | Competitors |
|---|---|---|
| **Breadth** | 19 lenses (security → monetization) | Usually 3–5 focused areas |
| **Rigor** | Adversarial verification + evidence validation | Self-reported or LLM only |
| **Cost** | Free tier available | Often $50–500 per evaluation |
| **Transparency** | Open-source, audit-able logic | Closed-box |
| **Integration** | CLI-first, works anywhere | Usually web-first, vendor lock-in |
| **Calibration** | Learning loop (feedback → rubric) | Static rules |

**Why buy Pro:**
- Portfolio view (see all projects at a glance)
- History (track improvement over time)
- Integration (Slack summaries, CI/CD pipelines)
- Speed (we run evaluations, you don't pay agent costs)

**Why not use free:**
- Managing many projects
- Need historical trends
- Want integrations
- Don't want to manage agent credentials

---

## Metrics & success

### Free tier
- Downloads/month
- GitHub stars
- Issues/feedback quality
- Deployment modes (Docker, GitHub Actions, local)

### Pro tier
- Churn rate (target: <5%/month)
- MRR growth (target: 30%/month in year 1)
- NPS (target: >50)
- Projects per customer (target: 3–5)
- Evaluation frequency (target: 2x/month per project)

### Enterprise
- CAC (customer acquisition cost, target: <$10k)
- LTV (lifetime value, target: >$50k)
- Deal size (target: $30k+)
- Time-to-close (target: 4–8 weeks)

---

## Product roadmap

### Shipped (v1.0)
- 19 lenses with adversarial verification
- Sandbox execution
- Evidence validation
- Org rubric inheritance
- GitHub Actions CI/CD workflows

### Q4 2026 (v1.1)
- Open-source launch
- Self-hosted backend option (for on-premise customers)
- Landing page (marketing site)
- Docs for custom lenses

### Q1 2027 (v2.0 Pro)
- Managed evaluation service
- Portfolio dashboard
- Slack/email notifications
- Stripe billing
- API for CI/CD

### Q2 2027 (v2.1 Enterprise)
- Custom lens builder
- VPC-isolated evaluation
- Self-hosted backend (Docker, Terraform)
- Compliance reporting (SOC 2, ISO 27001 ready)

### Later
- IDE extensions (VS Code, JetBrains)
- GitHub App integration (auto-evaluate on PR)
- Findings as code (remediation suggestions)
- Custom rubric marketplace (shared rubrics from community)
- AI pair programmer (auto-fix common findings)

---

## Non-goals

- **Automatically fixing things.** launchcheck reports findings; you decide what to do.
- **Production deployment.** We never touch your live systems.
- **Legal advice.** We flag missing documents; we don't interpret laws.
- **Visual/UX design judgment.** That's a human call.

---

## FAQ

**Q: Why open-source if you're going to charge for Pro?**
A: Open-source builds trust (you can audit our logic), attracts users, and creates a moat (network effects: more lenses, better community feedback). Most users will be happy self-hosting for free. Pro tier is for teams who want convenience + integrations.

**Q: What if someone forks launchcheck and builds their own managed service?**
A: Good. Competition is healthy. We compete on quality (rigor, new lenses, better accuracy), brand (thought leadership), and service (support, features). Anyone can fork launchcheck, but building trust is hard.

**Q: Who's the customer? Individual developers or enterprises?**
A: Both. Free tier attracts developers and startups. Pro tier is for product teams at growth-stage startups and mid-market. Enterprise tier is for regulated industries and platforms. We grow by moving customers up the stack.

**Q: How do you handle false positives in the lens agents?**
A: Calibration. Every false positive becomes a precedent the verifier sees on future runs. Every false negative becomes a standing check for that lens. The rubric improves over time.

**Q: Can launchcheck replace manual launch reviews?**
A: No. launchcheck surfaces risks; experts make decisions. Our best use case is "did the team think about X?" not "is X actually fine?" A human still decides.

**Q: What if launchcheck doesn't support my language/framework?**
A: Open an issue. The core logic (static analysis, git history, file inventory) is language-agnostic. Lenses that need runtime testing (probes) may be Node.js-specific initially, but we can add support for other runtimes.

**Q: How much does a full evaluation cost in API calls?**
A: Typical evaluation uses 4–6 agent calls per lens (19 lenses), so ~100 calls total. At $0.004/call (Sonnet input), that's ~$0.40 in agent cost. Pro tier amortizes this across many customers and bills upfront, so your cost is low.

---

## Contact

- GitHub: https://github.com/futreeng/launchcheck
- Email: hello@launchcheck.dev
- Twitter: @launchcheck_dev (coming soon)
