"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { makeValidator } = require("../../src/validate");
const { EvidenceRegistry } = require("../../src/evidence/registry");
const { tmpdir, write } = require("./helpers");

function setup() {
  const root = tmpdir();
  write(root, "server/routes/keys.js", ["const x = 1;", "router.get('/keys', async (req, res) => {", "  const k = await loadKeys(req.user);", "  res.json(k);", "});"].join("\n"));
  const reg = new EvidenceRegistry(path.join(root, "..", path.basename(root) + "-ev"), (s) => s);
  reg.add({ id: "npm-audit-root", title: "audit", summary: "s", content: "## production: critical=1 high=2\n  HIGH qs <6.10 [transitive]" });
  return { root, v: makeValidator({ root, registry: reg, quarantined: [".env"] }) };
}

test("accepts an exact quote on the cited lines", () => {
  const { v } = setup();
  const r = v.check({ kind: "file", path: "server/routes/keys.js", line_start: 2, line_end: 2, quote: "router.get('/keys', async (req, res) => {" });
  assert.equal(r.ok, true);
});

test("relocates a real quote with wrong line numbers, and records it", () => {
  const { v } = setup();
  const r = v.check({ kind: "file", path: "server/routes/keys.js", line_start: 40, line_end: 40, quote: "await loadKeys(req.user)" });
  assert.equal(r.ok, true);
  assert.equal(r.evidence.line_start, 3);
  assert.equal(r.evidence.relocated_from, 40);
});

test("rejects a fabricated quote", () => {
  const { v } = setup();
  const r = v.check({ kind: "file", path: "server/routes/keys.js", line_start: 2, line_end: 3, quote: "try { await loadKeys" });
  assert.equal(r.ok, false);
});

test("rejects missing files, quarantined files, path escapes, and quote-less citations", () => {
  const { v } = setup();
  assert.equal(v.check({ kind: "file", path: "nope.js", line_start: 1, quote: "abcd" }).ok, false);
  assert.equal(v.check({ kind: "file", path: ".env", line_start: 1, quote: "abcd" }).ok, false);
  assert.equal(v.check({ kind: "file", path: "../outside.js", line_start: 1, quote: "abcd" }).ok, false);
  assert.equal(v.check({ kind: "file", path: "server/routes/keys.js", line_start: 2 }).ok, false);
});

test("artifact excerpts must be verbatim", () => {
  const { v } = setup();
  assert.equal(v.check({ kind: "artifact", artifact_id: "npm-audit-root", excerpt: "critical=1 high=2" }).ok, true);
  assert.equal(v.check({ kind: "artifact", artifact_id: "npm-audit-root", excerpt: "critical=0" }).ok, false);
  assert.equal(v.check({ kind: "artifact", artifact_id: "does-not-exist", excerpt: "critical=1" }).ok, false);
});
