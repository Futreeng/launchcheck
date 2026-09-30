const express = require("express");
const { requireAuth } = require("./lib/auth");
const accountRoutes = require("./routes/account");
const reportRoutes = require("./routes/reports");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname + "/public"));

// Every /api route requires a session except this public allowlist.
const PUBLIC = new Set(["/api/signup", "/api/login", "/api/health", "/api/pricing"]);
app.use("/api", (req, res, next) => (PUBLIC.has(req.baseUrl + req.path) ? next() : requireAuth(req, res, next)));

app.use("/api", accountRoutes);
app.use("/api", reportRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`clipscore listening on ${PORT}`));
