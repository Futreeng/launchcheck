"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "third-party-vetting",
  title: "Third-party & dependency security",
  question: "Are dependencies well-maintained, secure, and appropriate for the stage of the project? Do third-party services have proper vetting and agreements?",
  hunt: `
**NPM Package Quality:**
- **Maintenance**: Check publish dates. Flag packages with no updates in 2+ years (likely abandoned).
- **Version specificity**: Avoid using * or latest—pin to exact versions (package-lock.json must exist and be committed).
- **Popular & trusted**: Use npm trends / GitHub stars as proxy. Flag obscure packages for core functionality.
- **Active issues/PRs**: Look for open security issues on GitHub. npx npm audit should have no high/critical vulns.
- **Author reputation**: Single-person packages for critical code are higher risk. Flag if author has no other packages.
- **License compatibility**: MIT, Apache 2.0, BSD → OK. GPL/AGPL → compatibility issues if proprietary. Proprietary → legal review.

**Dependency Tree Risk:**
- **Direct vs transitive**: Flag critical code using packages with many transitive dependencies (supply chain risk).
- **Dependency conflicts**: Multiple versions of the same package → bloat and security risk.
- **Deprecated packages**: npm audit will flag these. Example: node-uuid (deprecated), use uuid instead.
- **Typosquatting**: Check package names carefully (nodee, expresss, etc.). Flag if misspelled vs expected.

**Third-Party Services & APIs:**
- **Data Processors**: Stripe, SendGrid, Segment, etc.—require Data Processing Agreement (DPA) or Business Associate Agreement (BAA) if handling regulated data.
- **Security posture**: Check if they have SOC 2 cert, HIPAA BAA (if health data), PCI cert (if card data).
- **Retention & deletion**: Confirm they honor data deletion requests and document retention periods.
- **Regional compliance**: If GDPR applies, ensure processor is GDPR-compliant (EU or Standard Contract).
- **API rate limits & uptime**: Document SLA. If critical for launch, flag if no SLA or <99% uptime.
- **API versioning**: Flag if using deprecated API versions (likely to break).

**Infrastructure & Hosting:**
- **Cloud provider**: AWS, GCP, Azure—reputable. Flag unknown providers.
- **Backup strategy**: If using managed DBs, confirm automatic backups + point-in-time recovery.
- **SSL/TLS**: All traffic must be encrypted in transit. Flag self-signed certs in production.
- **CDN**: If using CDN (Cloudflare, Akamai), confirm origin is also encrypted.
- **Third-party hosted code**: Avoid loading JS from untrusted CDNs (only cdnjs.cloudflare.com, jsdelivr.net are acceptable fallbacks).

**Vendor Lock-in Risk:**
- **Proprietary services**: Lock into Stripe, Vercel, etc.? Document the cost of migration.
- **Export options**: Can you export data, config, state? Or is it hostage?
- **Discontinuation**: Has vendor gone out of business? Flag services with only 1–2 years of funding.

**Compliance & Audit:**
- **SOC 2 Type II**: Enterprise customers often require it. Flag if using service without SOC 2.
- **Audit logs**: Third-party must provide who accessed what data and when (if handling regulated data).
- **Incident response**: Does vendor have public incident response SLA? Has there been a major breach?`,
  probes: [
    {
      id: "dependency-audit",
      prompt: "Run 'npm audit' and look at high/critical vulnerabilities. For each, check if there's a patch version (npm audit fix) or if you need to switch packages. Report the count and severity.",
      timeout: 60,
    },
    {
      id: "api-integration-test",
      prompt: "Test a critical third-party API (Stripe charge, SendGrid send, auth provider login). Does it work? Are errors handled gracefully? Does it fail over correctly?",
      timeout: 60,
    },
    {
      id: "data-processor-check",
      prompt: "For each third-party that receives user data (Stripe, Segment, auth provider): verify they have a publicly available DPA/BAA or privacy policy explaining data handling.",
      timeout: 45,
    },
  ],
  artifacts: ["files", "env"],
  stageWeights: [0.3, 0.8, 1.2, 1.5],
  typeFactor: { saas: 1.3, sdk: 1.1, internal: 0.6 },
  stageNotes: {
    concept: "Concept: no third parties yet; flag early if planning to use proprietary services.",
    pilot: "Pilot: verify each service has basic auth, encryption, SLA.",
    beta: "Beta: require SOC 2 or equivalent for data processors. Audit dependencies quarterly.",
    ga: "GA: all services must have DPA/BAA, <6mo update cadence, and incident response SLA.",
  },
});
