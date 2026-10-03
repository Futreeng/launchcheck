"use strict";
const { defineLens } = require("./_define");

module.exports = defineLens({
  id: "soc2",
  title: "SOC 2 Type II readiness",
  question: "Can this app achieve SOC 2 Type II certification? Do you have controls for security, availability, processing integrity, confidentiality, and privacy?",
  hunt: `
**SOC 2 Trust Service Criteria (5 pillars):**

**CC: Common Criteria (required for all SOC 2)**
- **CC6.1 Logical access controls**: User authentication (MFA for admin), role-based access control (RBAC), least privilege enforcement
- **CC6.2 Session management**: Unique session identifiers, timeout policies, concurrent session limits
- **CC7.1 Encryption**: TLS 1.2+ for all data in transit; AES-256 or equivalent for data at rest
- **CC7.2 Key management**: Secure key storage (not hardcoded), key rotation policy (90 days), separate keys per environment
- **CC8.1 Change management**: Documented change procedures, approval workflow, version control (git), code review (no direct-to-prod)
- **CC9.1 Risk assessment**: Documented risk register, threat model, vulnerability scanning (SAST/DAST), penetration testing
- **CC9.2 Configuration management**: Infrastructure as code (Terraform, CloudFormation), configuration drift detection
- **PI1.4 Personnel access**: Procedures for onboarding/offboarding, access revocation (within 1 day of departure)

**Security (if claiming Security trust service)**
- Network segmentation: Production isolated from development/staging
- Intrusion detection/prevention: IDS/IPS or cloud provider equivalent (AWS GuardDuty, etc.)
- Malware protection: Endpoint security, container scanning
- Physical security: Data center access controls (if on-premises)
- Password policy: Minimum 12 characters, complexity, no reuse, expiration

**Availability (if claiming Availability trust service)**
- System monitoring: Real-time alerts for CPU, memory, disk, network (CloudWatch, DataDog, New Relic)
- Capacity planning: Documented capacity reserve, auto-scaling thresholds
- Disaster recovery: RTO ≤ 4 hours, RPO ≤ 1 hour (typically; varies by service)
- Backup strategy: Daily backups, tested restore procedures, off-site storage, retention policy
- High availability: Multi-region or multi-AZ deployment, load balancing, health checks
- SLA documentation: Uptime commitment (e.g., 99.9%), maintenance windows, escalation procedures

**Processing Integrity (if claiming Processing Integrity trust service)**
- Input validation: All user input validated (length, type, format, XSS/SQL injection protection)
- Error handling: Errors logged without exposing sensitive data, graceful degradation
- Transaction logging: All data modifications logged (who, what, when, why)
- Data accuracy: Reconciliation processes, checksum verification, audit trails
- Complete processing: No partial transactions (ACID compliance), idempotency for retries

**Confidentiality (if claiming Confidentiality trust service)**
- Data classification: Documented classification scheme (public, internal, confidential, restricted)
- Encryption scope: All confidential data encrypted at rest and in transit
- Access restrictions: Only authorized personnel can access confidential data, role-based access
- Secure deletion: Overwrite procedures for decommissioned data, certificate destruction for physical media
- Third-party confidentiality: NDA with all vendors, DPA with data processors

**Privacy (if claiming Privacy trust service)**
- Privacy notice: Clear, accessible privacy policy (at /privacy or linked from homepage)
- Consent: Documented consent for data collection, easy opt-out
- Data subject rights: Procedures for access, correction, deletion, portability requests (GDPR/CCPA compliance)
- Retention: Documented retention periods, automatic deletion after retention expires
- Vendor management: Privacy audit of third-party processors, DPA in place

**Documentation Required for SOC 2:**
- Security policies (access control, password, encryption, change management, incident response)
- System design documentation (architecture, data flows, network diagram)
- Risk assessment and threat model
- Business continuity / disaster recovery plan with tested procedures
- Audit logs (system, access, configuration changes)
- Incident response procedures (detection, containment, notification, remediation)
- Personnel security procedures (onboarding, offboarding, training)
- Vendor/subcontractor management procedures
- Privacy policy and consent documentation
- SLA and monitoring documentation

**Red flags (auto-fail SOC 2 audit):**
- Hardcoded credentials, API keys, or encryption keys in code or config files
- No encryption in transit (HTTP instead of HTTPS)
- Unencrypted sensitive data at rest (passwords in plaintext)
- No access controls (all users can access all data)
- No change management (direct commits to main, no code review)
- No backup procedures or untested backups
- No incident response procedures
- No audit logs (can't trace who accessed what data)
- No multi-factor authentication for admin/privileged accounts
- Data stored in non-compliant regions (e.g., PII in countries without data protection laws)`,
  probes: [
    {
      id: "encryption-verification",
      prompt: "Verify encryption implementation: (1) Check config for TLS version (must be 1.2+). (2) Verify HTTPS is enforced (no HTTP). (3) Check for encryption at rest (AWS KMS, database encryption, Prisma field encryption). (4) Look for hardcoded keys or credentials. (5) Verify key rotation is documented.",
      timeout: 90,
    },
    {
      id: "access-control-audit",
      prompt: "Audit access control implementation: (1) Check for multi-factor authentication (MFA) enforcement on admin accounts. (2) Verify role-based access control (RBAC) is implemented. (3) Check for session management (unique IDs, timeouts, concurrent limits). (4) Look for least-privilege enforcement. (5) Verify user provisioning/deprovisioning procedures exist.",
      timeout: 90,
    },
    {
      id: "monitoring-and-logging",
      prompt: "Verify monitoring and logging: (1) Check for centralized logging (CloudWatch, DataDog, ELK, Splunk). (2) Verify audit logs exist for data access and modifications. (3) Check for real-time monitoring/alerting (CPU, memory, disk, network). (4) Verify logs are retained and not tampered with. (5) Check incident response procedures are documented.",
      timeout: 90,
    },
    {
      id: "backup-and-recovery",
      prompt: "Verify backup and recovery: (1) Check backup frequency (daily minimum). (2) Verify backups are tested and can be restored. (3) Check backup storage location (must be off-site or replicated). (4) Verify retention policy is documented. (5) Check RTO and RPO are documented and reasonable (RTO ≤ 4 hours, RPO ≤ 1 hour typical).",
      timeout: 90,
    },
    {
      id: "change-management",
      prompt: "Verify change management procedures: (1) Check that code changes go through git (not direct file edits). (2) Verify code review policy (pull requests, approval required). (3) Check for automated testing (unit, integration, security). (4) Verify staging environment exists and is tested before production. (5) Verify deployment log exists (who deployed what when).",
      timeout: 90,
    },
    {
      id: "documentation-inventory",
      prompt: "Check documentation completeness: (1) Security policies exist (access control, encryption, change management, incident response). (2) Architecture/design documentation exists with data flows. (3) Risk assessment or threat model documented. (4) Business continuity and disaster recovery plans exist. (5) SLA and uptime commitment documented. (6) Privacy policy and consent procedures documented.",
      timeout: 90,
    },
  ],
  artifacts: ["files", "routes", "env"],
  stageWeights: [0.0, 0.3, 0.8, 2.0],
  typeFactor: { saas: 2.0, sdk: 1.2, internal: 0.1 },
  stageNotes: {
    concept: "Concept: SOC 2 not relevant (no customers yet). Skip this lens.",
    pilot: "Pilot: Basic SOC 2 hygiene expected (encryption, access control, logging, backups). Not full audit.",
    beta: "Beta: SOC 2 Type II audit expected within 6 months. All trust service criteria should be in place.",
    ga: "GA: SOC 2 Type II audit must be complete or in progress. Enterprise customers often require it. All red flags must be addressed.",
  },
});
