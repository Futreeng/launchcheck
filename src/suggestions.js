"use strict";
// Automated fix suggestions for common findings.
// Each suggestion includes: description, severity, code snippet, file location.

function suggestionsForFinding(finding, profile) {
  const suggestions = [];
  const { claim, id, lens } = finding;

  if (lens === "security") {
    if (claim.includes("SQL injection") || claim.includes("unescaped query")) {
      suggestions.push({
        title: "Use parameterized queries",
        description: "SQL injection: escape all user input. Use prepared statements.",
        severity: "critical",
        code: `
// Node.js + mysql2
const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);

// Node.js + Prisma
const user = await prisma.user.findUnique({ where: { id: userId } });
        `,
        file: "See db queries in server.js",
      });
    }
    if (claim.includes("missing authentication") || claim.includes("no auth guard")) {
      suggestions.push({
        title: "Add authentication middleware",
        description: "Protected routes must verify user identity before responding.",
        severity: "critical",
        code: `
// Express
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyJWT(token);
    next();
  } catch (e) {
    res.status(403).json({ error: 'Forbidden' });
  }
};

app.get('/api/private', authMiddleware, (req, res) => {
  res.json({ data: 'secret' });
});
        `,
        file: "server.js or middleware file",
      });
    }
    if (claim.includes("CORS") || claim.includes("cross-origin")) {
      suggestions.push({
        title: "Configure CORS properly",
        description: "Only allow requests from trusted origins; never use wildcard '*' for credentials.",
        severity: "high",
        code: `
// Express
const cors = require('cors');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
        `,
        file: "server.js setup",
      });
    }
  }

  if (lens === "compliance-privacy") {
    if (claim.includes("missing privacy policy")) {
      suggestions.push({
        title: "Create a privacy policy",
        description: "Add a public privacy policy explaining data collection, use, retention, and deletion rights.",
        severity: "high",
        code: `
// Add route in server.js
app.get('/privacy', (req, res) => {
  res.type('text/html').send(
    '<h1>Privacy Policy</h1><p>Last updated: ' + new Date().toDateString() + '</p>' +
    '<h2>Data Collection</h2><p>We collect...</p>' +
    '<h2>Data Retention</h2><p>We keep data for 30 days...</p>' +
    '<h2>Your Rights</h2><p>You can delete your account via Settings.</p>'
  );
});
        `,
        file: "server.js or pages/privacy.jsx",
      });
    }
    if (claim.includes("missing delete") || claim.includes("no deletion endpoint")) {
      suggestions.push({
        title: "Add user data deletion endpoint",
        description: "Users must be able to delete their account and data. Implement DELETE /api/user or equivalent.",
        severity: "critical",
        code: `
// Express
app.delete('/api/user', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  await db.users.delete({ where: { id: userId } });
  await db.sessions.deleteMany({ where: { userId } });
  await db.logs.deleteMany({ where: { userId } }); // Delete logs mentioning this user
  res.json({ success: true, message: 'Account deleted' });
});
        `,
        file: "server.js or api/user.js",
      });
    }
    if (claim.includes("missing encryption") || claim.includes("plaintext")) {
      suggestions.push({
        title: "Enable encryption at rest",
        description: "User data must be encrypted in the database. Use AWS KMS, Prisma field encryption, or similar.",
        severity: "critical",
        code: `
// Prisma with encryption
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgres"
  url = env("DATABASE_URL")
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  ssn       String    @db.VarChar(255) // Will be encrypted at application level
}

// Encryption function
import crypto from 'crypto';
const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
const encrypted = cipher.update(ssn, 'utf8', 'hex') + cipher.final('hex');
        `,
        file: "schema.prisma or db config",
      });
    }
  }

  if (lens === "accessibility") {
    if (claim.includes("missing alt text") || claim.includes("image alt")) {
      suggestions.push({
        title: "Add alt text to images",
        description: "Every image needs alt text for screen readers.",
        severity: "high",
        code: `
// React
<img src="/product.jpg" alt="Blue wireless headphones, side view" />

// HTML
<img src="/logo.png" alt="Company logo" />

// Decorative images
<img src="/divider.png" alt="" /> {/* Empty alt for decorative images */}
        `,
        file: "Pages with images",
      });
    }
    if (claim.includes("keyboard")) {
      suggestions.push({
        title: "Ensure keyboard navigation",
        description: "All interactive elements must be reachable via Tab key.",
        severity: "high",
        code: `
// Add tabindex to custom buttons
<div role="button" tabindex="0" onclick="doSomething()">Click me</div>

// Or use native button
<button onclick="doSomething()">Click me</button>

// Handle Enter key
<div role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && doSomething()}>
        `,
        file: "Components with interactive elements",
      });
    }
    if (claim.includes("color contrast")) {
      suggestions.push({
        title: "Improve color contrast",
        description: "Text must have 4.5:1 contrast ratio (normal text) or 3:1 (large text 18pt+).",
        severity: "medium",
        code: `
// CSS: Use sufficient contrast
.text-dark { color: #222222; background: #ffffff; } /* 19:1 contrast */
.text-muted { color: #666666; background: #ffffff; } /* 4.8:1 contrast */

// Check with https://webaim.org/resources/contrastchecker/
        `,
        file: "CSS files or style components",
      });
    }
  }

  if (lens === "data-privacy") {
    if (claim.includes("unencrypted")) {
      suggestions.push({
        title: "Use HTTPS everywhere",
        description: "All traffic must use HTTPS with TLS 1.2+. Never send PII over HTTP.",
        severity: "critical",
        code: `
// Node.js with express
const https = require('https');
const fs = require('fs');
const app = require('./app');

const options = {
  key: fs.readFileSync('privkey.pem'),
  cert: fs.readFileSync('cert.pem'),
};

https.createServer(options, app).listen(443);
        `,
        file: "server.js or deployment config",
      });
    }
  }

  return suggestions;
}

module.exports = { suggestionsForFinding };
