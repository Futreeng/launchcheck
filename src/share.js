"use strict";
// `launchcheck share`: copy the latest HTML report to an obvious, clearly named place and
// print the exact path, so it can be dragged straight into Slack/email/AirDrop. No hosting,
// no login — a plain file is the right level of complexity for a two-person company.
// Extension point: --to <dir> (e.g. a synced shared folder) once one exists.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const store = require("./store");
const { mkdirp, slugify, IS_WIN } = require("./util");

function desktopDir() {
  if (IS_WIN) {
    // Respects OneDrive "Desktop backup" redirection, which a naive ~/Desktop would miss.
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('Desktop')"], { encoding: "utf8", windowsHide: true });
    const p = (r.stdout || "").trim();
    if (p && fs.existsSync(p)) return p;
  }
  for (const p of [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Downloads"), os.homedir()]) if (fs.existsSync(p)) return p;
  return os.homedir();
}

function share(target, { to } = {}) {
  const last = store.latestRuns(target, 1)[0];
  if (!last) throw new Error("no launchcheck run found for this project — run `launchcheck run` first");
  const src = path.join(store.paths(target).runs, last.run_id, "report.html");
  if (!fs.existsSync(src)) throw new Error(`report for ${last.run_id} is missing at ${src}`);
  const dir = to ? mkdirp(path.resolve(to)) : desktopDir();
  const date = last.started_at.slice(0, 10);
  let dest = path.join(dir, `launchcheck-${slugify(last.project)}-${date}.html`);
  if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") !== fs.readFileSync(src, "utf8")) dest = path.join(dir, `launchcheck-${slugify(last.project)}-${date}-${last.run_id.slice(11, 19).replace(/-/g, "")}.html`);
  fs.copyFileSync(src, dest);
  return { dest, run: last, bytes: fs.statSync(dest).size };
}

module.exports = { share, desktopDir };
