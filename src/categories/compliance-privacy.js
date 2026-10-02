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
- **Data sharing contradictions**: Policy claims "no sharing" but code shares with third parties → cite both.
- **Children's data**: COPPA requires parental consent, no tracking, no advertising. Flag if app doesn't enforce.
- **Unsubscribe/opt-out**: Marketing emails need unsubscribe link + postal address. Do-not-sell requests must be honored.`,
  probes: [
    {
      id: "data-deletion-test",
      prompt: "Test the data deletion flow: create an account, sign in, find and trigger account/data deletion, verify profile is gone or inaccessible.",
      timeout: 60,
    },
    {
      id: "data-export-test",
      prompt: "Test data export/access flow: sign in, find 'download my data' or export endpoint, verify it returns user data in a portable format (JSON, CSV).",
      timeout: 60,
    },
    {
      id: "gdpr-consent-test",
      prompt: "If app has analytics or tracking: check for GDPR/cookie consent banner. For EU users (or 'all users'), verify consent is obtained before third-party tracking fires.",
      timeout: 30,
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
