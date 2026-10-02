"use strict";
// Central dashboard server for viewing launchcheck evaluations across the portfolio.
// Aggregates all project reports and displays verdicts, trends, costs, and findings.

const path = require("path");
const fs = require("fs");
const os = require("os");

function loadProjectReports(projectsFile) {
  if (!fs.existsSync(projectsFile)) return { projects: [], error: "FutureengProjects.json not found" };

  const projects = JSON.parse(fs.readFileSync(projectsFile, "utf8")).projects || [];
  const reports = [];

  for (const proj of projects) {
    const launchcheckRoot = path.join(proj.path, ".launchcheck");
    const historyDir = path.join(launchcheckRoot, "history");

    if (!fs.existsSync(historyDir)) continue;

    const files = fs
      .readdirSync(historyDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) continue;

    const latestFile = path.join(historyDir, files[0]);
    const record = JSON.parse(fs.readFileSync(latestFile, "utf8"));

    const findings = record.lenses
      ?.flatMap((l) => (l.findings || []).map((f) => ({ ...f, lens: l.id })))
      .filter((f) => f.verification?.verdict !== "refuted") || [];

    reports.push({
      id: proj.id,
      name: proj.name,
      stage: proj.stage,
      owner: proj.owner,
      verdict: record.verdict?.verdict,
      verdictReasons: record.verdict?.reasons,
      cost: record.cost_usd,
      timestamp: record.timestamp,
      runId: record.run_id,
      lensCount: record.lenses?.length || 0,
      findingCount: findings.length,
      confirmedBlockers: findings.filter((f) => f.blocking && f.verification?.verdict === "confirmed").length,
      openBlockers: findings.filter((f) => f.blocking && f.verification?.verdict === "contested").length,
      topFindings: findings.slice(0, 3).map((f) => ({ claim: f.claim, severity: f.severity, id: f.id })),
    });
  }

  return { projects: reports, count: reports.length };
}

function generateDashboardHtml(data) {
  const ready = data.projects.filter((p) => p.verdict === "READY").length;
  const readyWithCaveats = data.projects.filter((p) => p.verdict === "READY_WITH_CAVEATS").length;
  const notReady = data.projects.filter((p) => p.verdict === "NOT_READY").length;
  const totalCost = (data.projects.reduce((s, p) => s + (p.cost || 0), 0) || 0).toFixed(2);

  const rows = data.projects
    .map(
      (p) => `
    <tr class="project-row project-${p.verdict}">
      <td class="project-name"><strong>${p.name}</strong>${p.owner ? `<br/><small>${p.owner}</small>` : ""}</td>
      <td class="project-stage">${p.stage}</td>
      <td class="verdict ${p.verdict}">
        <strong>${p.verdict}</strong>
        ${p.verdictReasons ? `<br/><small>${p.verdictReasons.join("; ")}</small>` : ""}
      </td>
      <td class="blockers">
        <span class="confirmed">${p.confirmedBlockers}</span> confirmed
        <br/>
        <span class="open">${p.openBlockers}</span> open
      </td>
      <td class="findings">
        <strong>${p.findingCount}</strong> total
        <br/>
        <small>${p.lensCount} lenses</small>
      </td>
      <td class="cost">$${p.cost?.toFixed(2) || "0.00"}</td>
      <td class="actions">
        <a href="#" onclick="alert('View ${p.name} report: .launchcheck/runs/${p.runId}/report.html')">Report</a>
      </td>
    </tr>
  `
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>launchcheck Portfolio Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { margin-bottom: 1.5rem; color: #f1f5f9; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: #1e293b;
      border-left: 4px solid #6366f1;
      padding: 1rem;
      border-radius: 6px;
    }
    .summary-card.ready { border-left-color: #10b981; }
    .summary-card.caveats { border-left-color: #f59e0b; }
    .summary-card.not-ready { border-left-color: #ef4444; }
    .summary-card strong { font-size: 2rem; display: block; }
    .summary-card small { color: #94a3b8; }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      text-align: left;
      padding: 1rem;
      background: #334155;
      border-bottom: 1px solid #475569;
      font-weight: 600;
    }
    td {
      padding: 1rem;
      border-bottom: 1px solid #475569;
    }
    tr:last-child td { border-bottom: none; }

    .project-name { font-weight: 600; }
    .project-stage { text-align: center; }
    .verdict {
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 4px;
    }
    .verdict.READY { background: #10b981; color: #1e293b; }
    .verdict.READY_WITH_CAVEATS { background: #f59e0b; color: #1e293b; }
    .verdict.NOT_READY { background: #ef4444; color: #fff; }

    .blockers { text-align: center; }
    .confirmed { color: #ef4444; font-weight: 600; }
    .open { color: #f59e0b; font-weight: 600; }

    .findings { text-align: center; }
    .cost { text-align: right; font-family: monospace; }
    .actions a { color: #6366f1; text-decoration: none; }
    .actions a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 launchcheck Portfolio Dashboard</h1>

    <div class="summary">
      <div class="summary-card ready">
        <small>✅ Ready</small>
        <strong>${ready}</strong>
      </div>
      <div class="summary-card caveats">
        <small>⚠️ With Caveats</small>
        <strong>${readyWithCaveats}</strong>
      </div>
      <div class="summary-card not-ready">
        <small>❌ Not Ready</small>
        <strong>${notReady}</strong>
      </div>
      <div class="summary-card">
        <small>💰 Total Cost</small>
        <strong>$${totalCost}</strong>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th>Stage</th>
          <th>Verdict</th>
          <th>Blockers</th>
          <th>Findings</th>
          <th>Cost</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="margin-top: 2rem; color: #64748b; font-size: 0.875rem;">
      Generated: ${new Date().toISOString().split("T")[0]} |
      <a href="https://github.com/futreeng/launchcheck" style="color: #6366f1;">launchcheck</a>
    </p>
  </div>
</body>
</html>`;

  return html;
}

function startDashboardServer(projectsFile, port = 3000) {
  const express = require("express");
  const app = express();

  app.get("/", (req, res) => {
    const data = loadProjectReports(projectsFile);
    if (data.error) {
      res.status(404).send(data.error);
      return;
    }
    res.type("text/html").send(generateDashboardHtml(data));
  });

  app.get("/api/projects", (req, res) => {
    const data = loadProjectReports(projectsFile);
    res.json(data);
  });

  app.listen(port, "127.0.0.1", () => {
    console.log(`launchcheck dashboard: http://127.0.0.1:${port}`);
  });
}

module.exports = { loadProjectReports, generateDashboardHtml, startDashboardServer };
