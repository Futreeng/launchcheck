"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const U = require("./util");

async function runBatch(projectsFile, opts = {}) {
  if (!fs.existsSync(projectsFile)) throw new Error(`Projects file not found: ${projectsFile}`);
  const portfolio = JSON.parse(fs.readFileSync(projectsFile, "utf8"));
  const projects = portfolio.projects || [];
  if (!projects.length) throw new Error("No projects defined in " + projectsFile);

  const filter = opts.only ? opts.only.split(",").map((s) => s.trim()) : null;
  const filtered = filter ? projects.filter((p) => filter.includes(p.id)) : projects;
  if (!filtered.length) throw new Error(`No projects matched: ${opts.only}`);

  const reportsDir = U.expand(portfolio.reports_dir || "~/Desktop/launchcheck-reports");
  U.ensureDir(reportsDir);

  const results = [];
  const startTime = Date.now();

  U.log("batch", `Starting evaluations of ${filtered.length} project(s) → ${reportsDir}`);

  for (const proj of filtered) {
    const projPath = U.expand(proj.path);
    if (!fs.existsSync(projPath)) {
      U.log("batch", `⊘ ${proj.id}: path not found (${projPath})`);
      results.push({ id: proj.id, name: proj.name, ok: false, reason: "path not found" });
      continue;
    }

    U.log("batch", `→ ${proj.id}: running...`);
    const startProj = Date.now();
    const args = [
      "bin/launchcheck.js",
      "run",
      projPath,
      "--yes",
      ...(opts.model ? ["--model=" + opts.model] : []),
      ...(opts.lenses ? ["--lenses=" + opts.lenses] : []),
    ];

    try {
      await new Promise((resolve, reject) => {
        const child = spawn("node", args, { stdio: "pipe", shell: true, timeout: opts.timeout || 7200000 });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("exit", (code) => {
          if (code === 0 || code === 1) resolve(); // 0=ok, 1=error but ran
          else reject(new Error(`exit ${code}: ${stderr.slice(-500)}`));
        });
        child.on("error", reject);
      });

      const historyDir = path.join(projPath, ".launchcheck", "history");
      const latest = fs.readdirSync(historyDir).sort().pop();
      const record = JSON.parse(fs.readFileSync(path.join(historyDir, latest), "utf8"));

      const elapsed = Math.round((Date.now() - startProj) / 1000);
      U.log("batch", `✓ ${proj.id}: ${record.verdict} (${record.findings_count} findings, ${elapsed}s, $${record.cost_usd})`);

      results.push({
        id: proj.id,
        name: proj.name,
        stage: proj.stage,
        owner: proj.owner,
        ok: true,
        verdict: record.verdict,
        findings: record.findings_count,
        blockers: record.blockers_count,
        unknowns: record.could_not_verify_count,
        cost: record.cost_usd,
        elapsed,
        runId: record.run_id,
        timestamp: record.timestamp,
        rubricVersion: record.rubric_version,
      });
    } catch (e) {
      U.log("batch", `✗ ${proj.id}: ${e.message}`);
      results.push({ id: proj.id, name: proj.name, ok: false, reason: e.message });
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const totalCost = results.filter((r) => r.cost).reduce((a, b) => a + (b.cost || 0), 0);
  const readyCount = results.filter((r) => r.verdict === "READY").length;
  const caveatCount = results.filter((r) => r.verdict === "READY WITH CAVEATS").length;
  const notReadyCount = results.filter((r) => r.verdict === "NOT READY").length;

  U.log("batch", ``);
  U.log("batch", `Summary: ${readyCount} READY, ${caveatCount} READY WITH CAVEATS, ${notReadyCount} NOT READY out of ${results.filter((r) => r.ok).length} evaluated`);
  U.log("batch", `Total cost: $${totalCost.toFixed(2)}, time: ${Math.round(totalTime / 60)}min`);

  // Write summary report
  const summaryPath = path.join(reportsDir, `portfolio-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ timestamp: new Date().toISOString(), portfolio: portfolio.name, results, totalCost, totalTime }, null, 2));
  U.log("batch", `Summary: ${summaryPath}`);

  // Write HTML summary
  const htmlPath = path.join(reportsDir, `portfolio-${new Date().toISOString().slice(0, 10)}.html`);
  fs.writeFileSync(htmlPath, renderPortfolioHtml(portfolio, results));
  U.log("batch", `Dashboard: ${htmlPath}`);

  return { ok: true, results, totalCost, totalTime, summaryPath, htmlPath };
}

function renderPortfolioHtml(portfolio, results) {
  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px; background: #fafafa; }
    h1 { margin-bottom: 10px; color: #1a1a1a; font-size: 28px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #f0f0f0; padding: 12px; text-align: left; font-weight: 600; border-bottom: 1px solid #ddd; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #fafafa; }
    .ready { color: #059669; font-weight: 600; }
    .caveats { color: #d97706; font-weight: 600; }
    .not-ready { color: #dc2626; font-weight: 600; }
    .unknown { color: #999; }
    .summary { margin-top: 30px; padding: 20px; background: white; border-radius: 8px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge.ready { background: #d1fae5; color: #065f46; }
    .badge.caveats { background: #fed7aa; color: #92400e; }
    .badge.not-ready { background: #fee2e2; color: #991b1b; }
  `;

  const rows = results
    .filter((r) => r.ok)
    .map(
      (r) =>
        `<tr>
      <td><strong>${r.name}</strong> <code style="color:#666;font-size:12px">${r.id}</code></td>
      <td>${r.stage || "?"}</td>
      <td>${r.owner || "?"}</td>
      <td><span class="badge ${r.verdict.toLowerCase().replace(/ /g, "-")}">${r.verdict}</span></td>
      <td>${r.findings || 0}</td>
      <td>${r.blockers || 0}</td>
      <td class="unknown">${r.unknowns || 0}</td>
      <td>$${r.cost?.toFixed(2) || "?"}</td>
    </tr>`
    )
    .join("");

  const ready = results.filter((r) => r.ok && r.verdict === "READY").length;
  const caveats = results.filter((r) => r.ok && r.verdict === "READY WITH CAVEATS").length;
  const notReady = results.filter((r) => r.ok && r.verdict === "NOT READY").length;
  const failed = results.filter((r) => !r.ok).length;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Futreeng Launch Readiness — Portfolio</title>
  <style>${css}</style>
</head>
<body>
  <h1>Futreeng Launch Readiness</h1>
  <div class="meta">${portfolio.name} · ${new Date().toLocaleString()}</div>

  <div class="summary">
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px;">
      <div>
        <div style="font-size: 24px; font-weight: 600; color: #059669;">${ready}</div>
        <div style="color: #666; font-size: 14px;">READY to launch</div>
      </div>
      <div>
        <div style="font-size: 24px; font-weight: 600; color: #d97706;">${caveats}</div>
        <div style="color: #666; font-size: 14px;">READY WITH CAVEATS</div>
      </div>
      <div>
        <div style="font-size: 24px; font-weight: 600; color: #dc2626;">${notReady}</div>
        <div style="color: #666; font-size: 14px;">NOT READY</div>
      </div>
      <div>
        <div style="font-size: 24px; font-weight: 600; color: #999;">${failed}</div>
        <div style="color: #666; font-size: 14px;">Failed to evaluate</div>
      </div>
    </div>
  </div>

  <table style="margin-top: 30px;">
    <thead>
      <tr>
        <th>Project</th>
        <th>Stage</th>
        <th>Owner</th>
        <th>Verdict</th>
        <th>Findings</th>
        <th>Blockers</th>
        <th>Unknown</th>
        <th>Cost</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <strong>Portfolio Status:</strong> ${ready + caveats > 0 ? `${ready + caveats}/${ready + caveats + notReady} projects ready or near-ready` : `${notReady} projects need work`}
  </div>
</body>
</html>`;
}

module.exports = { runBatch };
