const crypto = require("crypto");
const db = require("./db");

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const user = token && db.all("users").find((u) => u.token === token);
  if (!user) return res.status(401).json({ error: "auth required" });
  req.user = user;
  next();
}

module.exports = { requireAuth, newToken };
