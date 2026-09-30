const express = require("express");
const db = require("../lib/db");
const { score } = require("../lib/scoring");

const router = express.Router();

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await res.json();
  return j.content?.[0]?.text || "";
}

// Start an analysis. Any signed-in user, any number of times.
router.post("/reports", async (req, res) => {
  const { handle, posts = [] } = req.body || {};
  const report = db.insert("reports", { userId: req.user.id, handle, score: score(posts), status: "running" });
  const insight = await callClaude(`Write a growth plan for the creator @${handle}. Their posts: ${JSON.stringify(posts)}`);
  db.update("reports", report.id, { status: "done", summary: insight.slice(0, 200), premiumPlan: insight });
  res.json({ id: report.id });
});

// Report page data. Includes the full premium growth plan.
router.get("/reports/:id", (req, res) => {
  const report = db.all("reports").find((r) => r.id === Number(req.params.id));
  if (!report) return res.status(404).json({ error: "not found" });
  res.json(report);
});

// Premium plan only, for Pro users.
router.get("/reports/:id/premium", (req, res) => {
  if (req.user.plan !== "pro") return res.status(402).json({ error: "upgrade required" });
  const report = db.all("reports").find((r) => r.id === Number(req.params.id) && r.userId === req.user.id);
  if (!report) return res.status(404).json({ error: "not found" });
  res.json({ premiumPlan: report.premiumPlan });
});

module.exports = router;
