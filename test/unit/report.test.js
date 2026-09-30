"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { renderHtml, renderMarkdown, diffRuns } = require("../../src/report");
const { extractRoutes } = require("../../src/evidence/routes");
const { listProjectFiles } = require("../../src/util");
const { sampleRecord } = require("./helpers");

test("HTML is self-contained: no scripts, no external resources, escaped content, tech detail collapsed", () => {
  const html = renderHtml(sampleRecord(), { artifacts: { git: "HEAD abc" } });
  assert.ok(!/<script/i.test(html.replace(/&lt;script/g, "")), "no <script> tags");
  assert.ok(!/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html), "no external src/href");
  assert.ok(!/@import|url\(/i.test(html), "no CSS imports or url() fetches");
  assert.match(html, /&lt;script&gt;alert\(1\)/, "claim text is escaped");
  assert.match(html, /<details class="tech">/);
  assert.ok(!/<details class="tech" open/.test(html), "technical detail collapsed by default");
  assert.match(html, /NOT READY/);
  assert.match(html, /Waiting on Haron/);
  assert.match(html, /plain F-security-2/, "haron-owned item appears in the callout");
});

test("markdown lists could-not-verify and contested sections", () => {
  const md = renderMarkdown(sampleRecord());
  assert.match(md, /## Could not verify \(1\)/);
  assert.match(md, /## Contested \(1\)/);
});

test("diff: resolved only when the lens ran in both runs", () => {
  const a = sampleRecord();
  const b = sampleRecord({ run_id: "b" });
  b.lenses[0].findings = [b.lenses[0].findings[1]];
  const d = diffRuns(a, b);
  assert.equal(d.resolved.length, 1);
  const c = sampleRecord({ run_id: "c" });
  c.lenses[0].status = "failed";
  c.lenses[0].findings = [];
  const d2 = diffRuns(a, c);
  assert.equal(d2.resolved.length, 0);
  assert.equal(d2.unknown.length, 2);
});

test("route discovery resolves router mount prefixes (fixture)", () => {
  const root = path.join(__dirname, "..", "fixtures", "borderline-saas");
  const routes = extractRoutes(root, listProjectFiles(root));
  const paths = routes.map((r) => `${r.method} ${r.path}`);
  assert.ok(paths.includes("GET /api/reports/:id"), paths.join(", "));
  assert.ok(paths.includes("GET /api/export"));
  assert.ok(routes.every((r) => r.prefixKnown));
});
