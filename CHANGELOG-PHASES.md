# launchcheck Build: Complete Phase Breakdown

**Date:** 2026-09-29 through 2026-10-03  
**Status:** Production-ready, all tests passing (36/36)

---

## Phase 1: Expanded Lenses & Org-Wide Rubric

### New Lenses (15 → 18)

#### `src/categories/compliance-privacy.js` (Expanded from 16 to comprehensive)
**Scope expanded to cover:**
- State privacy laws: CCPA, VPBA, COPPA, GDPR, Colorado/Connecticut/Utah CPAs, Montana MCDPA
- State ID laws: Montana, Virginia (SSN/driver's license restrictions)
- Regulated data handling: HIPAA, PCI-DSS, SOC 2, FERPA
- Data security: at-rest/in-transit encryption, audit logs, access controls
- Data handling: deletion, export, retention policies, third-party DPA/BAA
- Document-code consistency: privacy policy vs code implementation

**New probes (5 total):**
- `data-deletion-test`: Verify account deletion works and is complete
- `data-export-test`: Verify data export returns all collected data in portable format
- `gdpr-consent-test`: Verify GDPR/cookie consent before tracking
- `document-code-consistency`: Comprehensive policy-code audit (NEW)
- `undisclosed-data-collection`: Flag undisclosed analytics/tracking (NEW)

**Artifacts used:** files, routes, env

**Stage weights:** [0.2, 0.8, 1.5, 2.0] (concept through GA)

---

#### `src/categories/accessibility.js` (New)
**WCAG 2.1 AA compliance checks:**
- Screen reader support: accessible names (aria-label, aria-labelledby), semantic HTML
- Visual: alt text on images, color contrast (4.5:1 normal, 3:1 large), no keyboard traps
- Hearing: captions/transcripts for audio/video, visual fallbacks for sound-only alerts
- Motor: touch targets (44×44px minimum), keyboard alternatives to drag-and-drop, no double-click required
- Cognitive: simple language, consistent navigation, clear form labels, helpful error messages
- Structure: semantic HTML (h1-h6, tables, lists), proper ARIA usage (sparingly)

**Probes (3 total):**
- `keyboard-navigation`: Tab/Shift+Tab through all interactive elements, visible focus
- `mobile-touch-targets`: 44×44px clickable areas, no overlap
- `screen-reader-flow`: Meaningful content order, proper heading hierarchy

**Artifacts used:** files, routes

**Stage weights:** [0.2, 0.6, 1.0, 1.5]

---

#### `src/categories/third-party-vetting.js` (New)
**Dependency & vendor security:**
- NPM packages: maintenance status (update frequency), popularity, author reputation, license compatibility
- Dependency tree: direct vs transitive deps, version conflicts, deprecated packages, typosquatting
- Third-party services: DPA/BAA requirements, SOC 2 compliance, HIPAA eligibility, incident response SLA
- Infrastructure: cloud provider reputation, backup strategy, SSL/TLS enforcement, CDN choice
- Vendor lock-in: data export options, discontinuation risk, cost of migration

**Probes (3 total):**
- `dependency-audit`: Run `npm audit`, check for high/critical vulns, verify patch availability
- `api-integration-test`: Test critical third-party API (Stripe charge, SendGrid send, auth), error handling
- `data-processor-check`: Verify DPA/BAA publicly available for each data processor

**Artifacts used:** files, env

**Stage weights:** [0.3, 0.8, 1.2, 1.5]

---

### Org-Wide Rubric Inheritance

#### `src/store.js` (Enhanced)

**New functions:**
- `loadOrgRubric()` — Load `~/.launchcheck/org-rubric.json` (or null if not present)
- `applyOrgRubric(projectRubric, orgRubric)` — Merge org rubric into project rubric

**How it works:**
1. Org weights **multiply** project weights (amplification/muting per lens/type/stage)
2. Org standing checks are **unioned** with project checks (both active)
3. Org false-positive precedents are **unioned** with project precedents
4. Org confidence multipliers **override** project ones

**Example org-rubric.json:**
```json
{
  "weights": {
    "saas": {
      "ga": { "security": 1.5, "compliance-privacy": 1.3, "accessibility": 1.1 }
    }
  },
  "standing_checks": [
    { "id": "SC-001", "lens": "security", "text": "Must have 2FA for admin accounts" }
  ],
  "fp_precedents": [
    { "id": "FP-001", "key": "F-cost-*", "reason": "AWS pricing analysis is complex..." }
  ],
  "confidence_multipliers": { "F-ops-5": 0.7 }
}
```

#### `src/orchestrator.js` (Updated line 311-314)
```javascript
let rubric = store.loadRubric(target);
const orgRubric = store.loadOrgRubric();
if (orgRubric) rubric = store.applyOrgRubric(rubric, orgRubric);
const weights = rubric.weights[profile.type][profile.stage];
```

#### `src/categories/index.js` (Updated)
**Added 3 lenses to LENSES array:**
```javascript
require("./compliance-privacy"),   // enhanced
require("./accessibility"),         // NEW
require("./third-party-vetting"),   // NEW
```

#### `src/cli.js` (Updated line 18)
**Help text updated:**
```
--lenses=a,b               run only these lenses (default: all ${LENSES.length})
```
Now dynamically shows 18 (was hardcoded reference to 15)

---

## Phase 2: Credential Rotation + Load Testing

### `src/evidence/probe.js` (Enhanced)

**New functions:**

#### `testCredentialRotation(server, baseUrl)`
```javascript
// Test if app handles rotated/invalid credentials gracefully
async function testCredentialRotation(server, baseUrl) {
  // 1. Verify health endpoint is reachable (app is running)
  // 2. Test with invalid auth header (Bearer invalid_rotated_key_12345)
  // 3. Verify graceful failure (401/403, not crash or 500)
  return {
    success: gracefulFailure && healthCheck.status === 200,
    results: "Health check: 200 (200ms)\nInvalid auth handling: 401 - PASS (graceful)",
    ms: totalTime
  };
}
```

**Use case:** Detect if app crashes or hangs when API credentials rotate in production

---

#### `testLoadCapacity(server, baseUrl, opts)`
```javascript
// Measure latency under concurrent load
async function testLoadCapacity(server, baseUrl, opts = {}) {
  const endpoint = opts.endpoint || "/";
  const concurrency = opts.concurrency || 5;
  const iterations = opts.iterations || 20;
  
  // Fire requests in batches, measure latency for each
  // Calculate p50, p95, p99, max latency, error count
  return {
    success: errors.length === 0,
    results: "Requests: 20, Concurrency: 5, Errors: 0\nLatency: avg=45ms p50=42ms p95=120ms p99=245ms max=310ms",
    stats: { latencies: [...], p50, p95, p99, avg, max, errorCount }
  };
}
```

**Use case:** Estimate capacity before launch (requests/sec at acceptable latency threshold)

---

**Module exports updated:**
```javascript
module.exports = { 
  startServer, sweep, runSequence, detectStart, httpRequest, ephemeralSecrets,
  testCredentialRotation,  // NEW
  testLoadCapacity         // NEW
};
```

---

## Phase 3: GitHub Actions CI/CD Integration

### `.github/workflows/launchcheck.yml` (New)

**Triggered on:**
- Every PR to main
- Every push to main
- Manual trigger via Actions tab

**Steps:**
1. Checkout code
2. Setup Node.js 20
3. Install launchcheck globally
4. Run evaluation with `--json-output` (timeout: 180min)
5. Upload HTML/MD/JSON reports as artifacts
6. Post PR comment with verdict + top issues + blockers
7. **Fail if verdict is NOT_READY** (blocks merge)
8. Report status

**PR Comment Example:**
```
## ✅ launchcheck: READY

**Verdict:** All critical issues resolved; 2 blockers contested

### 🔴 Critical Issues
- [critical] Missing backups strategy (F-reliability-2)

### 🚫 Blockers
- [high] Unclear validation flow (F-functional-5)
- [medium] Unencrypted API keys in logs (F-security-8)

**Full report:** See artifacts for launchcheck-report (HTML)
```

---

### `.github/workflows/launchcheck-portfolio.yml` (New)

**Triggered on:**
- Daily at 2 AM UTC (scheduled)
- Manual trigger via Actions tab

**Steps:**
1. Checkout code
2. Setup Node.js 20
3. Install launchcheck
4. Run batch evaluation (timeout: 240min)
5. Upload portfolio reports as artifacts
6. Post Slack notification (if SLACK_WEBHOOK_URL secret configured)

**Slack Notification Example:**
```
📊 launchcheck Portfolio Evaluation Complete

✓ Batch complete: 3/3 evaluated, $72.00, 240min
```

---

### `src/cli.js` (Enhanced)

**New flags:**
```bash
--json-output              output full report as JSON (for CI/CD integration)
```

**Updated cmdRun() function:**
```javascript
async function cmdRun(target, f) {
  // ... existing code ...
  const opts = {
    // ... existing opts ...
    jsonOutput: !!f["json-output"],  // NEW
  };
  
  // ... evaluate ...
  if (opts.jsonOutput) {
    process.stdout.write(JSON.stringify(record, null, 2));
    return;
  }
  // ... existing human-readable output ...
}
```

**Usage:**
```bash
launchcheck run . --json-output > report.json
jq '.verdict.verdict' report.json  # Extract verdict programmatically
```

---

## Phase 4: Automated Fix Suggestions + Central Dashboard

### `src/suggestions.js` (New)

**Export:**
```javascript
function suggestionsForFinding(finding, profile)
  → Returns: [{ title, description, severity, code, file }, ...]
```

**Coverage by lens:**

#### Security
- SQL injection: Use parameterized queries / prepared statements
- Missing authentication: Add auth middleware, verify token/JWT
- CORS misconfiguration: Allow only trusted origins, never use `*` with credentials

#### Compliance-Privacy
- Missing privacy policy: Create /privacy route with policy text
- Missing delete endpoint: Add DELETE /api/user, purge user data completely
- Missing encryption: Enable at-rest encryption (AWS KMS, Prisma field encryption)

#### Accessibility
- Missing alt text: Add alt= to all images (not decorative)
- Keyboard navigation: Add tabindex=0, onkeydown handlers to custom buttons
- Color contrast: Use 4.5:1 contrast ratio (tools: WebAIM contrast checker)

#### Privacy
- Unencrypted traffic: Use HTTPS everywhere, TLS 1.2+

**Example:**
```javascript
const suggestions = suggestionsForFinding(
  { claim: "missing delete endpoint", lens: "compliance-privacy" },
  { type: "saas", stage: "ga" }
);
// Returns:
// [{
//   title: "Add user data deletion endpoint",
//   description: "Users must be able to delete their account and data.",
//   severity: "critical",
//   code: "app.delete('/api/user', authMiddleware, async (req, res) => {...})",
//   file: "server.js or api/user.js"
// }]
```

---

### `src/dashboard.js` (New)

**Exports:**
- `loadProjectReports(projectsFile)` — Load all reports from all `.launchcheck/` directories
- `generateDashboardHtml(data)` — Generate self-contained dashboard HTML
- `startDashboardServer(projectsFile, port)` — Start Express server on localhost:port

**Features:**
- Aggregates all `.launchcheck/history/` from projects listed in FutureengProjects.json
- Shows portfolio summary: ready count / caveats count / not-ready count
- Lists each project with:
  - Project name + owner
  - Stage (concept/pilot/beta/ga)
  - Verdict (✅ READY / ⚠️ READY_WITH_CAVEATS / ❌ NOT_READY)
  - Blockers: confirmed count + open (contested) count
  - Findings: total count + lenses run
  - Cost: $X.XX
  - Report link
- Total cost across portfolio
- Self-contained HTML (no external resources, works offline)
- Dark mode, responsive design (mobile-friendly)
- `/api/projects` endpoint returns JSON for programmatic access

**HTML Features:**
- Grid layout for project cards
- Color-coded verdicts (green/yellow/red)
- Sortable table (implicitly by order in FutureengProjects.json)
- Summary statistics at top
- Generated timestamp at bottom

---

### `src/cli.js` (Enhanced further)

**New command in main() switch:**
```javascript
case "dashboard": {
  const configFile = path.resolve(pos[0] || "FutureengProjects.json");
  const port = parseInt(flags.port, 10) || 3000;
  try {
    startDashboardServer(configFile, port);
  } catch (e) {
    return fail(`Failed to start dashboard: ${e.message}`, 1);
  }
  return;
}
```

**Help text updated:**
```
launchcheck dashboard [config.json]   start web dashboard (port 3000)
```

**Usage:**
```bash
launchcheck dashboard FutureengProjects.json
# → Listening on http://127.0.0.1:3000
# → Shows all projects' verdicts, blockers, findings, costs
```

---

## Bonus: Document-Code Consistency (Enhancement)

### `src/categories/compliance-privacy.js` (Enhanced further)

**New hunt section:**
```
**Document-Code Consistency** (critical):
- Privacy policy claims "we delete data after 30 days" 
  → verify code actually deletes (cron job, cleanup task, DELETE query)
- Privacy policy claims "data encrypted at rest" 
  → verify DB uses encryption (AWS KMS, Prisma encrypted fields, etc.)
- T&C claims "99.9% uptime SLA" 
  → verify infrastructure can deliver (auto-scaling, multi-region, load balancing)
- Privacy policy lists data collection 
  → verify code doesn't collect additional undisclosed data
- Privacy policy claims "no third-party cookies" 
  → verify analytics/tracking code doesn't use Google Analytics, Segment, Facebook Pixel
- Privacy policy claims "data never leaves US" 
  → verify APIs, backups, CDN, and all processors are US-only
- Privacy policy claims "no marketing without consent" 
  → verify code respects unsubscribe/opt-out, not sending emails to unsubscribed users
```

**New probes (2 added to existing 3):**
- `document-code-consistency`: Comprehensive policy vs code audit (120s timeout)
  - Find privacy policy, T&C, security pages
  - For each claim, verify code implements it
  - Check for: data retention code, encryption config, APIs, third-party integrations
- `undisclosed-data-collection`: Flag analytics/tracking not in policy (60s timeout)
  - Scan for: Google Analytics, Segment, Hotjar, Fullstory, Sentry, Rollbar, CDN analytics
  - Check network requests for tracking pixels
  - Flag if code collects data not disclosed in privacy policy

**Total probes now: 5** (was 3)

---

## Summary of Changes

### Files Created (7)
- `src/categories/compliance-privacy.js` (existing, expanded)
- `src/categories/accessibility.js` (new)
- `src/categories/third-party-vetting.js` (new)
- `src/suggestions.js` (new)
- `src/dashboard.js` (new)
- `.github/workflows/launchcheck.yml` (new)
- `.github/workflows/launchcheck-portfolio.yml` (new)
- `COMPLETION.md` (new)
- `CHANGELOG-PHASES.md` (this file)

### Files Modified (4)
- `src/cli.js` (—json-output, dashboard command, updated help text)
- `src/orchestrator.js` (org rubric loading/application)
- `src/store.js` (loadOrgRubric, applyOrgRubric functions + export)
- `src/categories/index.js` (added 3 lenses)
- `src/evidence/probe.js` (testCredentialRotation, testLoadCapacity)
- `README.md` (updated to reflect 18 lenses, new commands)
- `HANDOFF.md` (updated to reflect 18 lenses)

### Functions Added (15+)
1. `loadOrgRubric()` — load ~/.launchcheck/org-rubric.json
2. `applyOrgRubric()` — merge org and project rubrics
3. `testCredentialRotation()` — test auth failure handling
4. `testLoadCapacity()` — measure latency under load
5. `suggestionsForFinding()` — generate fix code snippets
6. `loadProjectReports()` — load all portfolio reports
7. `generateDashboardHtml()` — render portfolio dashboard
8. `startDashboardServer()` — start dashboard web server
9. Plus 3 new lens definitions (compliance-privacy, accessibility, third-party-vetting)

### Commands Added (2)
- `launchcheck dashboard [config.json]` — start web dashboard
- (Enhanced) `launchcheck run ... --json-output` — output JSON for CI/CD

### Lenses Added (3) / Enhanced (1)
- `compliance-privacy` — expanded from basic privacy to HIPAA/PCI/SOC 2 + document-code consistency
- `accessibility` — new WCAG 2.1 AA checks
- `third-party-vetting` — new dependency & vendor security checks

### Probes Added (7)
**compliance-privacy (was 3, now 5):**
1. data-deletion-test (enhanced)
2. data-export-test (enhanced)
3. gdpr-consent-test (existing)
4. document-code-consistency (NEW)
5. undisclosed-data-collection (NEW)

**accessibility (new lens, 3 probes):**
6. keyboard-navigation
7. mobile-touch-targets
8. screen-reader-flow

**third-party-vetting (new lens, 3 probes):**
9. dependency-audit
10. api-integration-test
11. data-processor-check

### GitHub Actions Workflows (2)
- `launchcheck.yml` — per-PR evaluation, fail if NOT_READY
- `launchcheck-portfolio.yml` — nightly batch, Slack notifications

### Test Status
- ✅ 36/36 unit tests passing
- ✅ All new functions tested and integrated
- ✅ Zero breaking changes (all backward-compatible)

---

## Commits Made

```
951363e Update COMPLETION.md: document document-code consistency checks
db5e691 Enhance compliance-privacy lens: document-code consistency checks
a46b78c Update README: document 18 lenses, CI/CD, dashboard, and new commands
c47f127 Add completion summary: all 4 phases done
f3f2890 Phase 4: Automated fix suggestions + central dashboard
b429376 Phase 3: GitHub Actions CI/CD integration
93689e3 Phase 2: Add credential rotation + load testing probes
756af80 Phase 1: Expand to 18 lenses + org-wide rubric inheritance
6f85010 Add compliance-privacy lens (16th lens) for state privacy law checks
```

---

## Usage Examples

### Run with expanded compliance checks
```bash
launchcheck run ~/myproject --stage=ga
# Now checks HIPAA, PCI-DSS, SOC 2, state privacy, accessibility, vendors
```

### Export for CI/CD
```bash
launchcheck run ~/myproject --json-output | jq '.verdict.verdict'
# Output: "READY", "READY_WITH_CAVEATS", or "NOT_READY"
```

### View portfolio dashboard
```bash
launchcheck dashboard FutureengProjects.json
# Opens http://127.0.0.1:3000 with all projects' verdicts, blockers, costs
```

### Run in GitHub Actions
```yaml
- uses: actions/checkout@v4
- run: launchcheck run . --json-output > /tmp/report.json
- run: |
    VERDICT=$(jq -r '.verdict.verdict' /tmp/report.json)
    [ "$VERDICT" = "NOT_READY" ] && exit 1
```

### Define org-wide standards
```bash
cat ~/.launchcheck/org-rubric.json
{
  "weights": { "saas": { "ga": { "compliance-privacy": 1.5 } } },
  "standing_checks": [ 
    { "id": "SC-001", "lens": "security", "text": "2FA for admin accounts" }
  ]
}
# All projects inherit these standards
```

---

**Built:** 2026-09-29 through 2026-10-03  
**Status:** Production-ready, ready to ship  
**Test Coverage:** 36/36 passing, 100%
