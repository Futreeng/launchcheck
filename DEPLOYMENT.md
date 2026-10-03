# Deployment: Self-hosted & Managed Service

This guide covers deploying launchcheck for self-hosting, as a managed service (Pro tier), or on-premise (Enterprise).

## Three deployment modes

### Mode 1: Self-hosted (Free tier)

Users download the CLI and run it locally.

```bash
npm install -g launchcheck
launchcheck run /path/to/project
```

Reports go to `.launchcheck/` locally. No backend needed.

### Mode 2: Managed service (Pro tier)

We host everything. Users:
1. Create an account at launchcheck.dev
2. Connect their GitHub or upload a repo
3. We run evaluations on our infrastructure
4. Results show up in a dashboard

**Architecture:**

```
User                           launchcheck.dev

CLI (optional)
  ↓                                
  └─→ API (launchcheck.dev/api)
        ↓
      Auth (JWT + Stripe)
        ↓
      Queue (evaluation jobs)
        ↓
      Workers (run evaluations in sandbox)
        ↓
      Storage (S3 or encrypted file storage)
        ↓
      Dashboard (React app)
```

### Mode 3: On-premise (Enterprise)

Enterprise customers deploy the backend themselves.

```
Customer's VPC

User                           Customer's launchcheck

CLI
  ↓
  └─→ API (internal.company.com/launchcheck)
        ↓
      Auth (SAML/OIDC)
        ↓
      Queue (self-hosted)
        ↓
      Workers (runs in isolated subnet)
        ↓
      Storage (customer's encrypted storage)
        ↓
      Dashboard (self-hosted)
```

---

## Self-hosted deployment

No deployment needed. Users install via npm:

```bash
npm install -g launchcheck
launchcheck run /path/to/project
```

launchcheck stores results in `.launchcheck/` locally. If users want to share, they can:

```bash
launchcheck share /path/to/project  # copies to ~/Desktop
```

---

## Managed service deployment (Pro tier)

### Prerequisites

- Node 20+
- PostgreSQL (for storing evaluations, user data, billing)
- Redis (for job queue)
- S3 or equivalent (encrypted file storage)
- Stripe account (for billing)
- SMTP or SendGrid (for email notifications)
- Claude Code API access (for running evaluations)

### Architecture

```
Frontend
  ↓
API Server (Express)
  ├─ /auth/* (JWT, OAuth)
  ├─ /api/projects/* (CRUD)
  ├─ /api/evaluations/* (submit, status, results)
  ├─ /api/dashboard/* (portfolio view)
  └─ /api/billing/* (Stripe webhooks)
  ↓
Job Queue (Bull/Redis)
  ↓
Workers (N instances)
  ├─ Pull job from queue
  ├─ Clone repo (GitHub)
  ├─ Run launchcheck CLI
  ├─ Store results in S3
  └─ Update database
  ↓
Database (PostgreSQL)
  ├─ users
  ├─ projects
  ├─ evaluations
  ├─ findings
  └─ billing_events
  ↓
Storage (S3)
  └─ results/{projectId}/{runId}/
      ├─ report.html
      ├─ report.json
      └─ evidence/
```

### Database schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  stripe_customer_id VARCHAR,
  tier VARCHAR (free, pro, enterprise),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  github_repo VARCHAR,
  name VARCHAR,
  stage VARCHAR (concept, pilot, beta, ga),
  created_at TIMESTAMP
);

-- Evaluations
CREATE TABLE evaluations (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  status VARCHAR (queued, running, complete, failed),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  report_url VARCHAR,
  verdict VARCHAR (not-ready, caveats, ready),
  cost_tokens INTEGER
);

-- Findings (for dashboard aggregation)
CREATE TABLE findings (
  id UUID PRIMARY KEY,
  evaluation_id UUID REFERENCES evaluations(id),
  lens_id VARCHAR,
  severity VARCHAR,
  title VARCHAR,
  blocking BOOLEAN
);

-- Billing
CREATE TABLE billing_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  evaluation_count INTEGER,
  cost_tokens INTEGER,
  billed_at TIMESTAMP
);
```

### Deployment steps

#### 1. Set up infrastructure

```bash
# Provision PostgreSQL
createdb launchcheck
createdb launchcheck_test

# Provision Redis
redis-server

# Create S3 bucket
aws s3 mb s3://launchcheck-reports-prod

# Set up Stripe account & get API key
export STRIPE_API_KEY=sk_live_...

# Get Claude Code API access
export CLAUDE_API_KEY=sk_...
```

#### 2. Deploy backend

```bash
git clone https://github.com/futreeng/launchcheck.git
cd launchcheck

# Create backend directory (new, not in main repo yet)
mkdir -p services/backend

# Copy CLI into backend service
cp -r src bin services/backend/

# Create backend server
cat > services/backend/server.js << 'EOF'
const express = require("express");
const postgres = require("pg");
const redis = require("redis");
const Bull = require("bull");
const stripe = require("stripe");

const app = express();
app.use(express.json());

// ... (see Backend API section below)

app.listen(3000, () => console.log("Backend running on :3000"));
EOF

npm install express pg redis bull stripe

# Run migrations
node services/backend/migrate.js

# Start backend
NODE_ENV=production node services/backend/server.js
```

#### 3. Deploy workers

Workers pull jobs from Redis queue and run evaluations:

```bash
cat > services/backend/worker.js << 'EOF'
const Bull = require("bull");
const { exec } = require("child_process");
const AWS = require("aws-sdk");

const queue = new Bull("evaluations", {
  redis: { host: process.env.REDIS_HOST, port: 6379 }
});

queue.process(async (job) => {
  const { projectId, githubRepo } = job.data;
  
  // Clone repo to temp dir
  const tmpDir = `/tmp/eval-${projectId}`;
  await exec(`git clone ${githubRepo} ${tmpDir}`);
  
  // Run launchcheck
  const { spawn } = require("child_process");
  const proc = spawn("node", ["bin/launchcheck.js", "run", tmpDir, "--json-output"]);
  
  // Capture output
  let report = "";
  proc.stdout.on("data", (data) => { report += data; });
  
  // When done, upload to S3
  proc.on("close", async () => {
    const s3 = new AWS.S3();
    await s3.putObject({
      Bucket: "launchcheck-reports-prod",
      Key: `results/${projectId}/${Date.now()}/report.json`,
      Body: report
    }).promise();
    
    // Update database
    await db.query(
      "UPDATE evaluations SET status = $1, report_url = $2 WHERE project_id = $3",
      ["complete", `s3://launchcheck-reports-prod/results/${projectId}`, projectId]
    );
  });
});

// Handle job failures
queue.on("failed", async (job, err) => {
  await db.query("UPDATE evaluations SET status = $1 WHERE project_id = $2", ["failed", job.data.projectId]);
});
EOF

node services/backend/worker.js
```

#### 4. Deploy frontend (React dashboard)

```bash
cd services/frontend
npm create vite@latest . -- --template react
npm install react-router-dom axios recharts stripe

cat > src/App.jsx << 'EOF'
import { useEffect, useState } from "react";
import axios from "axios";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    axios.get("/api/projects", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    }).then(res => setProjects(res.data));
  }, []);

  return (
    <div>
      <h1>launchcheck Dashboard</h1>
      {projects.map(p => (
        <div key={p.id}>
          <h2>{p.name}</h2>
          <p>Stage: {p.stage}</p>
          {/* Show latest evaluation */}
        </div>
      ))}
    </div>
  );
}
EOF

npm run build
# Deploy dist/ to S3 CloudFront
```

---

## On-premise deployment (Enterprise)

For enterprise customers, provide:

1. **Docker image**
   ```dockerfile
   FROM node:20
   WORKDIR /app
   COPY . .
   RUN npm install
   EXPOSE 3000
   CMD ["node", "services/backend/server.js"]
   ```

2. **Terraform/CloudFormation templates** for AWS/GCP/Azure
   ```hcl
   resource "aws_ecs_cluster" "launchcheck" {
     name = "launchcheck-enterprise"
   }
   
   resource "aws_ecs_service" "launchcheck" {
     name = "launchcheck-service"
     # ...
   }
   ```

3. **Helm chart** for Kubernetes
   ```yaml
   apiVersion: v1
   kind: Namespace
   metadata:
     name: launchcheck
   ---
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: launchcheck-backend
   spec:
     replicas: 3
     # ...
   ```

4. **Installation guide** (docs/INSTALL-ENTERPRISE.md)

---

## Monitoring & ops

### Logs

All components log to CloudWatch/Datadog/ELK:

```javascript
const logger = require("winston");

logger.info("Evaluation started", { projectId, runId });
logger.error("Evaluation failed", { projectId, error });
```

### Alerts

- Queue depth > 100 jobs → scale workers
- Worker CPU > 80% → scale workers
- Database connection pool exhausted → investigate leaks
- S3 upload failures → alert ops
- Stripe billing failures → alert finance

### Metrics

- Evaluations per day
- Average evaluation time
- Success rate
- Cost per evaluation
- Queue depth
- Worker utilization

---

## Cost model (Pro tier)

For launchcheck.dev:

- **Compute**: ~$0.50 per evaluation (2 min CPU)
- **Storage**: ~$0.01 per evaluation (10MB stored 2 years)
- **API calls**: ~$0.40 per evaluation (Claude Code)
- **Bandwidth**: ~$0.01 per evaluation (report download)

**Total cost: ~$0.92 per evaluation**

To break even on $149/mo (startup tier), need ~162 evaluations/month per customer.

Assuming 5 projects × 2 evaluations/month = 10 evaluations/month, that's ~$9/customer/month in cost. Profit margin: 93%.

---

## Security checklist

- [ ] Database encryption (TLS + encrypted backups)
- [ ] S3 encryption (server-side + encryption at rest)
- [ ] Auth (OAuth 2.0 or SAML)
- [ ] Rate limiting (prevent abuse)
- [ ] Audit logging (who accessed what, when)
- [ ] Network isolation (workers in private subnet)
- [ ] Secrets management (AWS Secrets Manager, not env vars)
- [ ] DDoS protection (CloudFlare)
- [ ] VPN option for Enterprise
- [ ] Incident response plan

---

## Next steps

1. **Build backend API** (estimated: 4 weeks)
2. **Build frontend dashboard** (estimated: 2 weeks)
3. **Set up Stripe integration** (estimated: 1 week)
4. **Load test** (estimated: 1 week)
5. **Private beta** (5–10 customers, 2 weeks)
6. **Public launch** (Q1 2027)
