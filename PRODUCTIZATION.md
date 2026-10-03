# launchcheck: Productization Complete

**Status:** Ready for open-source launch + managed service development

---

## What changed

launchcheck moved from an internal tool to a market-ready product with three tiers:
1. **Free** — Open-source CLI, self-hosted
2. **Pro** — Managed service, portfolio dashboard (coming Q1 2027)
3. **Enterprise** — Custom lenses, on-premise, VPC isolation (coming Q2 2027)

## Files added

### Core strategy
- **`PRODUCT.md`** — Three-tier business model, go-to-market, competitive positioning, FAQ
- **`ROADMAP.md`** — v1.0–v2.2 feature timeline with quarterly breakdowns
- **`DEPLOYMENT.md`** — Architecture for managed service, database schema, deployment steps

### Developer experience
- **`CONTRIBUTING.md`** — How to contribute, add lenses, report bugs
- **`QUICKSTART.md`** — Get users running in 5 minutes
- **`.github/CODEOWNERS`** — Clear ownership for maintenance
- **`.github/ISSUE_TEMPLATE/bug_report.md`** — Bug report template
- **`.github/ISSUE_TEMPLATE/feature_request.md`** — Feature request template

### Security & compliance
- **`SECURITY.md`** — How your code is handled, credential safety, incident response

### Marketing
- **`docs/landing.html`** — Product landing page (for launchcheck.dev)

### Updated files
- **`README.md`** — Rewritten for external audience (removed "Futreeng's" internal positioning)
- **`package.json`** — Renamed to `launchcheck` (v1.0.0), public license (MIT), added metadata
- **`LICENSE`** — MIT license (open-source)

## What stays the same

- **All 19 lenses** — Unchanged, fully functional
- **All features** — Adversarial verification, evidence validation, sandbox, calibration learning
- **All 36 tests** — Still passing (100%)
- **Zero dependencies** — Still zero npm dependencies
- **CLI interface** — Unchanged (`launchcheck run`, `launchcheck batch`, etc.)

## Ready to launch

### Phase 1: Open-source launch (Q4 2026)
- [ ] Publish to GitHub public (https://github.com/futreeng/launchcheck)
- [ ] Publish to npm public (`npm install -g launchcheck`)
- [ ] Blog post: "Why we built launchcheck" (positioning)
- [ ] HN/Reddit post
- [ ] Cold outreach to 50 product teams (offer free Pro for feedback)

**Expected outcomes:**
- 500 GitHub stars
- 50+ CLI installs/month
- Early user feedback for v1.1

### Phase 2: Pro tier (Q1 2027)
- [ ] Build managed evaluation backend (8 weeks)
- [ ] Build portfolio dashboard (4 weeks)
- [ ] Stripe billing integration (2 weeks)
- [ ] Private beta (10 customers)
- [ ] Public launch

**Expected outcomes:**
- 10 paid customers
- $10k MRR
- 1000 GitHub stars

### Phase 3: Enterprise tier (Q2 2027)
- [ ] Custom lens builder UI
- [ ] VPC-isolated evaluation
- [ ] On-premise deployment (Docker, Terraform, Helm)
- [ ] Enterprise API
- [ ] Sales engineering + support

**Expected outcomes:**
- 2–3 enterprise customers
- $50k MRR

---

## Why this model works

### For users
- **Free tier**: Start immediately, no credit card, self-hosted
- **Pro tier**: Convenience (we manage it), portfolio view, integrations
- **Enterprise tier**: Custom compliance, private network, support

### For us
- **Open-source moat**: Code is auditable → trust → adoption → brand
- **Network effects**: More users → more lenses → more community → harder to fork
- **Revenue scaling**: Free → Pro → Enterprise (classic SaaS funnel)
- **Low friction to trial**: Anyone can run the CLI, see value before paying
- **High margin**: Infrastructure costs ~$0.92/eval, Pro tier charges ~$50–$400/eval

### For the market
- **No alternatives**: No other tool combines 19 lenses + adversarial verification + evidence validation
- **Timing**: Every company shipping now needs launch readiness checks. Current options are: spreadsheets, checklists, or expensive consulting.
- **Defensibility**: Rigor + community → hard to compete against

---

## Competitive positioning

| Aspect | launchcheck | Competitors |
|---|---|---|
| Lenses | 19 (security → monetization) | 3–5 (usually security-only) |
| Verification | Adversarial | None or LLM-only |
| Evidence | Mechanical validation | Self-reported |
| Cost | Free tier available | Usually $50–500/eval |
| Transparency | Open-source, audit-able | Closed-box |
| Integration | CLI-first | Web-first, vendor lock-in |
| Learning | Rubric calibration loop | Static rules |

**Why buy instead of DIY?**
- **Portfolio view** — See all projects at once
- **History** — Track improvement over time
- **Integrations** — Slack, email, CI/CD, webhooks
- **Managed** — We pay for Claude API, you don't

---

## Revenue model

### Free tier
- `npm install -g launchcheck`
- Self-hosted, 100% local
- All features (19 lenses, full evaluation, reports)
- No revenue, but builds adoption + brand

### Pro tier (estimated pricing)
- **Startup** ($149/mo): 5 projects, 2 team members
- **Scale** ($299/mo): 20 projects, 10 team members
- **Business** ($499/mo): Unlimited projects, 25+ team members

Features:
- Managed evaluation (we run it)
- Portfolio dashboard (multi-project view)
- 2-year history
- Slack/email notifications
- API access (for CI/CD)
- Priority support

Cost per customer: ~$10/mo in infrastructure
Gross margin: ~98%

### Enterprise tier
- **Custom**: $2k–10k/mo (based on scope)
- **Features**: Custom lenses, VPC isolation, on-premise, SLA, dedicated support
- **Gross margin**: ~90% (more ops cost)

---

## Success metrics

### Year 1 (Q4 2026 – Q4 2027)

**Open-source (Free tier):**
- 500–1000 GitHub stars
- 1000+ monthly active CLI users
- 50+ contributions from community

**Pro tier:**
- 20–50 paying customers
- $50k–200k ARR
- <5% monthly churn
- >50 NPS

**Enterprise:**
- 2–5 customers
- $50k–150k ARR

**Overall:**
- 2–3 people maintaining (part-time initially)
- 100+ projects evaluated monthly
- <4 week sales cycle for Enterprise

### Year 2+ (if successful)
- Expand to 50+ paying teams
- Launch IDE extensions, GitHub App, API marketplace
- Build partner ecosystem (agencies, consultancies)
- Series A funding to accelerate Enterprise

---

## What's next

1. **Immediate (this week)**
   - [ ] Final GitHub repo setup (public, clear license)
   - [ ] Create launchcheck.dev domain
   - [ ] Write launch blog post ("Why we built launchcheck")

2. **Phase 1a: Soft launch (Nov 2026)**
   - [ ] Post to HN, Reddit, Twitter
   - [ ] Cold outreach to 50 teams
   - [ ] Gather feedback on UX, pricing, messaging

3. **Phase 1b: Harden (Nov–Dec 2026)**
   - [ ] Fix top reported bugs
   - [ ] Improve docs based on feedback
   - [ ] Add IDE extensions (VS Code)
   - [ ] Prepare Pro tier architecture

4. **Phase 2: Pro launch (Jan–Mar 2027)**
   - [ ] Build managed service backend
   - [ ] Build dashboard
   - [ ] Stripe integration
   - [ ] Private beta (10 customers)
   - [ ] Public launch

---

## Files to review

1. **Strategy**: `PRODUCT.md`, `ROADMAP.md`
2. **Technical**: `DEPLOYMENT.md`, `SECURITY.md`
3. **Developer**: `CONTRIBUTING.md`, `QUICKSTART.md`
4. **Marketing**: `docs/landing.html`

---

## Questions?

- **Why open-source?** → Trust + adoption + defensible moat
- **Why not charge for CLI?** → Freemium model drives Pro adoption
- **Why not SaaS from day 1?** → De-risk: prove demand first, build backend once we have customers
- **Why enterprise tier if Pro exists?** → Some customers need custom compliance, network isolation, on-premise
- **What if someone forks it?** → Competition is healthy; we compete on quality, brand, service
- **Will you change the license?** → No. Open-source is core to the strategy.

---

**Status:** ✅ Ready for open-source launch
**Commit:** `b17fa35` (Productize launchcheck: open-source + managed service model)
**Date:** 2026-10-03
**Next review:** 2026-11-01 (after soft launch feedback)
