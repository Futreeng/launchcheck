const express = require("express");
const db = require("../lib/db");
const { newToken } = require("../lib/auth");

const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true }));

router.get("/pricing", (req, res) => res.json({ free: 0, pro: 29 }));

router.post("/signup", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const user = db.insert("users", { email, plan: "free", token: newToken() });
  res.json({ token: user.token, plan: user.plan });
});

// Data export for the signed-in user.
router.get("/export", (req, res) => {
  const mine = db.all("reports").filter((r) => r.userId === req.user.id);
  res.json({ email: req.user.email, reports: mine });
});

// Upgrade to Pro. Stripe isn't wired yet, so billing is mocked unless MOCK_BILLING=false.
router.post("/billing/upgrade", (req, res) => {
  if (process.env.MOCK_BILLING !== "false") {
    db.update("users", req.user.id, { plan: "pro" });
    return res.json({ plan: "pro", mocked: true });
  }
  res.status(501).json({ error: "real billing not implemented" });
});

module.exports = router;
