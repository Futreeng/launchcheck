"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { inspect, makeRedactor, formatRefusal } = require("../../src/safety");
const { tmpdir, write, fakeLiveStripeKey } = require("./helpers");

const cleanEnv = { PATH: process.env.PATH };

test("refuses when an env file in the target declares production + live Stripe key", () => {
  const root = tmpdir();
  write(root, "server.js", "require('dotenv').config()\n");
  write(root, ".env.production", `NODE_ENV=production\nSTRIPE_SECRET_KEY=${fakeLiveStripeKey()}\n`);
  const r = inspect(root, ["server.js"], { env: cleanEnv });
  assert.equal(r.refuse, true);
  const msg = formatRefusal(r, root);
  assert.match(msg, /REFUSED/);
  assert.match(msg, /NODE_ENV=production/);
  assert.match(msg, /live Stripe key/);
  assert.ok(!msg.includes(fakeLiveStripeKey()), "refusal message must never print the secret");
});

test("refuses when a remote database URL with credentials is configured", () => {
  const root = tmpdir();
  write(root, ".env", "DATABASE_URL=postgres://app:hunter2secret@db.prod.railway.app:5432/main\n");
  assert.equal(inspect(root, [], { env: cleanEnv }).refuse, true);
});

test("documentation placeholder DB URLs don't refuse (regression: RENDER_DEPLOYMENT.md in Convergence)", () => {
  const root = tmpdir();
  write(root, "DEPLOY.md", "DATABASE_URL=postgres://user:pass@host:5432/db\nor postgresql://app:${DB_PASSWORD}@db.example.com/x\n");
  assert.equal(inspect(root, ["DEPLOY.md"], { env: cleanEnv }).refuse, false);
});

test("dev .env with ordinary API keys is quarantined, not refused", () => {
  const root = tmpdir();
  write(root, ".env", "NODE_ENV=development\nANTHROPIC_API_KEY=sk-ant-dev-abcdefghijklmnopqrstu\n");
  write(root, ".vercel/project.json", '{"orgId":"x"}');
  const r = inspect(root, [], { env: cleanEnv });
  assert.equal(r.refuse, false);
  assert.deepEqual(r.quarantined.sort(), [".env", ".vercel/project.json"]);
  assert.ok(r.redactValues.includes("sk-ant-dev-abcdefghijklmnopqrstu"));
});

test("refuses on a live secret hardcoded in a project file; allowlist exempts deliberate fakes", () => {
  const root = tmpdir();
  write(root, "config.js", `module.exports = { stripe: "${fakeLiveStripeKey()}" }\n`);
  assert.equal(inspect(root, ["config.js"], { env: cleanEnv }).refuse, true);
  assert.equal(inspect(root, ["config.js"], { env: cleanEnv, allowlist: ["config.js"] }).refuse, false);
});

test("refuses when the shell itself looks like production", () => {
  const root = tmpdir();
  assert.equal(inspect(root, [], { env: { ...cleanEnv, NODE_ENV: "production" } }).refuse, true);
});

test("refuses non-local probe URLs", () => {
  const root = tmpdir();
  assert.equal(inspect(root, [], { env: cleanEnv, probeUrl: "https://scalecraft.onrender.com" }).refuse, true);
  assert.equal(inspect(root, [], { env: cleanEnv, probeUrl: "http://localhost:3000" }).refuse, false);
});

test("redactor removes known values and secret patterns", () => {
  const redact = makeRedactor(["supersecretvalue123"]);
  const out = redact(`a supersecretvalue123 b ${fakeLiveStripeKey()} c postgres://u:pw12345@remote.host/db`);
  assert.ok(!out.includes("supersecretvalue123"));
  assert.ok(!out.includes(fakeLiveStripeKey()));
  assert.ok(!out.includes("pw12345"));
});
