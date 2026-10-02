"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "compliance-privacy",
  title: "Data privacy & state compliance",
  question: "Does the app comply with state privacy laws (CCPA, VPBA, COPPA, etc.) and handle user data securely across all applicable jurisdictions?",
  hunt: `
- CCPA (California): Must have privacy policy, right to delete, right to access, opt-out of sale, no discrimination for exercising rights.
- VPBA (Virginia), Colorado CPA, Connecticut DPA, Utah CPA: Similar to CCPA—right to delete, right to know, opt-out of sale/targeting.
- COPPA (under 13): Parental consent, no marketing, retention limits, no tracking.
- GDPR (EU users): Cookie consent before tracking, privacy policy, data processing agreement if third parties involved.
- **Data storage location**: Flag if collected from regulated regions but stored outside (CA data in EU, EU data in US without standard contract, etc.).
- **Encryption**: Detect if user data is encrypted at rest (AWS KMS, encrypted DB, .env secrets). Flag hardcoded keys or plaintext storage.
- **Data deletion**: Test for DELETE /user or equivalent—manually probe if app has deletion endpoint and verify it actually works.
- **Data access**: Test for GET /user/data or export endpoint—users must be able to retrieve their data in portable format.
- **Third-party risk**: Identify integrations (Stripe, SendGrid, Segment, etc.) that receive user data. Flag if they don't provide data processing agreements.
- **Retention policies**: Look for documented data retention (e.g., "logs kept 30 days", "user profiles indefinitely"). Flag indefinite retention of sensitive data.
- **Data sharing**: If policy claims "we never share user data" but code shares with third parties, flag the contradiction.
- **Children's data**: If targeting children (<13), flag compliance with COPPA: parental consent, no ads, retention limits.
- **Unsubscribe/opt-out**: If sending marketing emails, must have unsubscribe link and mailing address. If selling data, must honor do-not-sell.`,
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
