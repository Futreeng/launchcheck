"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "compliance-privacy",
  title: "Data privacy & regulated compliance",
  question: "Does the app comply with privacy laws (CCPA, GDPR, HIPAA, PCI-DSS, SOC 2) and handle user data securely across all applicable jurisdictions?",
  hunt: `
**Privacy Laws:**
- CCPA (California): Privacy policy, right to delete, right to access, opt-out of sale, no discrimination for exercising rights.
- VPBA (Virginia), Colorado CPA, Connecticut DPA, Utah CPA, Montana MCDPA: Right to delete, right to know, opt-out of sale/targeting. Flag if collected from these states.
- COPPA (under 13): Parental consent, no marketing, retention limits, no tracking.
- GDPR (EU users): Cookie consent before tracking, privacy policy, DPA if third parties process data.
- State ID/doxxing laws (Montana, Virginia, etc.): Restrict how ID data (SSN, driver's license) is used/stored. Flag if collecting but policy vague.

**Regulated Data (if handling):**
- **HIPAA** (health data): Requires encryption at rest/transit, audit logs, BAAs with processors, patient rights (access, amendment, deletion).
- **PCI-DSS** (credit cards): No card data storage (tokenize instead), encryption, annual audits. Flag any hardcoded card handling.
- **SOC 2** (enterprise SaaS): Document controls, encryption, access logs, disaster recovery. Flag if targeting enterprise without SOC 2 claim.
- **FERPA** (education): Family Education Rights and Privacy Act—student records need parental consent, audit trails.

**Data Security & Handling:**
- **Data storage location**: Flag if CA data in EU, EU data in US without Standard Contract, health data outside HIPAA-compliant regions.
- **Encryption**: Detect at-rest encryption (AWS KMS, encrypted DB). Flag plaintext, hardcoded keys, or unencrypted backups.
- **Data deletion**: Test DELETE /user—verify it's not just soft-delete, actually purges from backups.
- **Data export**: Test GET /user/data—must return portable format (JSON, CSV), include all collected data.
- **Access logs**: If regulated, must log who accessed what data and when. Flag if no audit trail.
- **Third-party risk**: Integrations (Stripe, SendGrid, Segment) that receive PII must have DPA/BAA. Flag if none.
- **Retention policies**: Document data retention for each data category. Flag "forever" for sensitive data, missing retention for logs.
- **Document-Code Consistency** (critical):
  - Privacy policy claims "we delete data after 30 days" → verify code actually does this (cron job, cleanup task, or explicit DELETE)
  - Privacy policy claims "data encrypted at rest" → verify DB uses encryption (AWS KMS, Prisma encrypted fields, etc.)
  - T&C claims "99.9% uptime SLA" → verify infrastructure can deliver (not shared hosting, has auto-scaling, multi-region, etc.)
  - Privacy policy lists what data is collected → verify code doesn't collect additional undisclosed data (analytics, tracking pixels, etc.)
  - Privacy policy claims "no third-party cookies" → verify analytics/tracking code doesn't use third-party trackers (Google Analytics, Segment, Facebook Pixel)
  - T&C claims "data never leaves US" → verify APIs, backups, CDN, and all processors are US-only
  - Privacy policy claims "no marketing emails without consent" → verify code respects unsubscribe/opt-out (not sending emails to unsubscribed users)
- **Children's data**: COPPA requires parental consent, no tracking, no advertising. Flag if app doesn't enforce.
- **Unsubscribe/opt-out**: Marketing emails need unsubscribe link + postal address. Do-not-sell requests must be honored.`,
  probes: [
    {
      id: "data-deletion-test",
      prompt: "Test the data deletion flow: create an account, sign in, find and trigger account/data deletion, verify profile is gone or inaccessible. Check privacy policy for retention claims (e.g., 'deleted after 30 days').",
      timeout: 60,
    },
    {
      id: "data-export-test",
      prompt: "Test data export/access flow: sign in, find 'download my data' or export endpoint, verify it returns ALL user data in portable format (JSON, CSV). Check privacy policy claims about what data is collected.",
      timeout: 60,
    },
    {
      id: "gdpr-consent-test",
      prompt: "If app has analytics or tracking: check for GDPR/cookie consent banner. Verify consent is obtained BEFORE third-party tracking fires (Google Analytics, Segment, etc.). Check privacy policy for third-party tracking disclosures.",
      timeout: 30,
    },
    {
      id: "document-code-consistency",
      prompt: "Find and review privacy policy, terms of service, and security/compliance pages. For each claim about data handling (retention, encryption, storage location, third-party sharing, deletion, export), verify the code actually implements it. Look for: (1) data retention code (cron jobs, cleanup tasks), (2) encryption config in DB/code, (3) APIs that respect deletion/export, (4) third-party integrations match disclosed list.",
      timeout: 120,
    },
    {
      id: "undisclosed-data-collection",
      prompt: "Check if privacy policy lists all data collected. Review app code and network requests for analytics, tracking pixels, session recording (Hotjar, Fullstory, etc.), CDN analytics, error tracking (Sentry, Rollbar), or marketing pixels. Flag if code collects data not mentioned in privacy policy.",
      timeout: 60,
    },
  ],
  artifacts: ["files", "routes", "env"],
  stageWeights: [0.2, 0.8, 1.5, 2.0],
  typeFactor: { saas: 1.3, sdk: 1.0, internal: 0.4 },
  stageNotes: {
    concept: "Concept stage: privacy compliance not yet in scope; flag if data collection starts early.",
    pilot: "Pilot testers' PII warrants state compliance checks; at least one privacy policy required.",
    beta: "Public beta: all state laws apply to your jurisdiction + EU (if accessible). Must have deletion/export.",
    ga: "GA: full compliance required. Every state with users must be covered. Encryption and third-party audits expected.",
  },
});
