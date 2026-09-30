#!/usr/bin/env node
"use strict";
// Materialize the "borderline-saas" fixture as a fresh, never-seen git repo outside this
// one, with dependencies installed and a DEV .env (fake key; must be quarantined, not
// refused). Usage: node scripts/make-fixture.js [destDir]
//
// Planted issues (what a correct run should find): paywall bypass on GET /api/reports/:id
// (checks login, not plan), IDOR on the same route (sequential ids, no ownership check),
// mock billing reachable by default, unbounded paid LLM calls, a hollow billing test,
// placeholder UI waiting on design, an async Express 4 handler with no error handling.
// Planted DECOY: routes/account.js GET /export looks unauthenticated in its own file but is
// covered by the global /api middleware in server.js — a claim that it's exposed should be
// refuted by the verifier (the probe returns 401).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const src = path.join(__dirname, "..", "test", "fixtures", "borderline-saas");
const dest = path.resolve(process.argv[2] || path.join(os.tmpdir(), `lc-fixture-clipscore-${Date.now().toString(36)}`));
if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`${dest} exists and is not empty`);
fs.cpSync(src, dest, { recursive: true });
fs.writeFileSync(path.join(dest, ".env"), `NODE_ENV=development\nANTHROPIC_API_KEY=sk-ant-dev-${"x".repeat(12)}fixture${"0".repeat(10)}\nMOCK_BILLING=true\n`);
const sh = (c) => execSync(c, { cwd: dest, stdio: ["ignore", "ignore", "inherit"] });
sh("npm install --no-audit --no-fund");
sh("git init -q");
sh("git add -A");
sh('git -c user.name=fixture -c user.email=fixture@example.test commit -q -m "clipscore pilot build"');
process.stdout.write(dest + "\n");
