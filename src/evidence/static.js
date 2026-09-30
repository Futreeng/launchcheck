"use strict";
// Deterministic, read-only scans of the real project directory. Nothing here executes
// project code.

const fs = require("fs");
const path = require("path");
const { git, readText, readJSON, exists } = require("../util");

function gitArtifact(root) {
  const sha = (git(root, ["rev-parse", "HEAD"]) || "").trim() || null;
  if (!sha) {
    return { meta: { sha: null, short: "nogit", dirty: null, branch: null }, artifact: { id: "git", title: "Git state", summary: "not a git repository (or no commits): run is not tied to a commit", content: "No git history available." } };
  }
  const branch = (git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || "").trim();
  const porcelain = (git(root, ["status", "--porcelain"]) || "").split("\n").filter(Boolean).filter((l) => !/\.launchcheck\//.test(l));
  const logLines = (git(root, ["log", "-15", "--date=short", "--pretty=format:%h %ad %an: %s"]) || "").trim();
  const count = (git(root, ["rev-list", "--count", "HEAD"]) || "").trim();
  const lastDate = (git(root, ["log", "-1", "--pretty=format:%cI"]) || "").trim();
  const recent = (git(root, ["rev-list", "--count", "--since=30.days", "HEAD"]) || "").trim();
  const authors = (git(root, ["shortlog", "-sn", "--all", "--no-merges"]) || "").trim();
  const remotes = (git(root, ["remote", "-v"]) || "").replace(/\/\/[^@/\s]+@/g, "//[credentials-removed]@").trim();
  const tags = (git(root, ["tag", "--sort=-creatordate"]) || "").split("\n").filter(Boolean).slice(0, 10);
  const content = [
    `HEAD: ${sha} (${branch})`,
    `commits: ${count}; commits in last 30 days: ${recent}; last commit: ${lastDate}`,
    `working tree: ${porcelain.length ? `DIRTY (${porcelain.length} changed/untracked paths) — this run reflects uncommitted state` : "clean"}`,
    ...porcelain.slice(0, 40).map((l) => `  ${l}`),
    "",
    "recent commits:",
    logLines,
    "",
    "authors (commit counts):",
    authors,
    "",
    `tags: ${tags.join(", ") || "(none)"}`,
    "",
    "remotes:",
    remotes || "(none)",
  ].join("\n");
  return {
    meta: { sha, short: sha.slice(0, 8), dirty: porcelain.length > 0, dirtyCount: porcelain.length, branch },
    artifact: { id: "git", title: "Git state and recent history", command: "git rev-parse/status/log/shortlog/remote", summary: `HEAD ${sha.slice(0, 8)} on ${branch}; ${porcelain.length ? `dirty (${porcelain.length} paths)` : "clean"}; ${count} commits, ${recent} in last 30 days`, content },
  };
}

function filesArtifact(root, files, quarantined) {
  const byExt = {};
  const byTop = {};
  const sizes = [];
  const dataFiles = [];
  for (const f of files) {
    const ext = (path.extname(f) || "(none)").toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
    const top = f.includes("/") ? f.split("/")[0] + "/" : "(root)";
    byTop[top] = (byTop[top] || 0) + 1;
    let size = 0;
    try {
      size = fs.statSync(path.join(root, f)).size;
    } catch {}
    sizes.push([f, size]);
    if (/\.(json|csv|sqlite3?|db|ndjson|jsonl|xlsx)$/i.test(f) && size > 20 * 1024 && !/(package-lock|tsconfig|composer\.lock)/.test(f)) dataFiles.push(`${f} (${Math.round(size / 1024)} KB)`);
  }
  sizes.sort((a, b) => b[1] - a[1]);
  const docs = files.filter((f) => /\.(md|mdx|txt|rst)$/i.test(f));
  const content = [
    `total project files (git tracked + untracked-not-ignored): ${files.length}`,
    "",
    "by top-level directory:",
    ...Object.entries(byTop).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k} ${v}`),
    "",
    "by extension:",
    ...Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `  ${k} ${v}`),
    "",
    "documentation files:",
    ...docs.map((d) => `  ${d}`),
    "",
    "data-like files over 20 KB (check for real personal data):",
    ...(dataFiles.length ? dataFiles.map((d) => `  ${d}`) : ["  (none)"]),
    "",
    "largest files:",
    ...sizes.slice(0, 15).map(([f, s]) => `  ${f} ${Math.round(s / 1024)} KB`),
    "",
    "quarantined credential files (exist on disk; not copied to sandbox; agents denied read):",
    ...(quarantined.length ? quarantined.map((q) => `  ${q}`) : ["  (none)"]),
    "",
    "full file list:",
    ...files.slice(0, 2500).map((f) => `  ${f}`),
    files.length > 2500 ? `  …${files.length - 2500} more` : "",
  ].join("\n");
  return { id: "files", title: "Project file inventory", summary: `${files.length} files, ${docs.length} docs, ${dataFiles.length} data-like files >20KB, ${quarantined.length} quarantined credential files`, content };
}

function envArtifact(root, files) {
  const templates = files.filter((f) => /(^|\/)\.env\.(example|sample|template|dist|defaults)$|(^|\/)env\.example$/i.test(f));
  const documented = new Map();
  for (const t of templates) {
    const text = readText(path.join(root, t)) || "";
    text.split(/\r?\n/).forEach((l, i) => {
      const m = l.match(/^\s*#?\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/);
      if (m && !documented.has(m[1])) documented.set(m[1], `${t}:${i + 1}`);
    });
  }
  const reads = new Map();
  for (const f of files) {
    if (!/\.(m?[jt]sx?|cjs|py)$/.test(f) || /(^|\/)(public|dist|build)\//.test(f)) continue;
    const text = readText(path.join(root, f), 600 * 1024);
    if (!text) continue;
    text.split(/\r?\n/).forEach((l, i) => {
      const re = /process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]|os\.environ(?:\.get)?\(?\[?['"]([A-Z][A-Z0-9_]+)['"]/g;
      let m;
      while ((m = re.exec(l))) {
        const k = m[1] || m[2] || m[3];
        if (!reads.has(k)) reads.set(k, []);
        if (reads.get(k).length < 3) reads.get(k).push(`${f}:${i + 1}`);
      }
    });
  }
  const undocumented = [...reads.keys()].filter((k) => !documented.has(k) && !["NODE_ENV", "PORT"].includes(k)).sort();
  const unused = [...documented.keys()].filter((k) => !reads.has(k)).sort();
  const devFlags = [...reads.keys()].filter((k) => /DEV_|UNLOCK|BYPASS|SKIP_AUTH|DISABLE_AUTH|MOCK|DEBUG|INSECURE/.test(k));
  const content = [
    `env templates: ${templates.join(", ") || "(none found)"}`,
    "",
    "documented variables (name -> where):",
    ...[...documented.entries()].map(([k, v]) => `  ${k}  ${v}`),
    "",
    "variables read in code (name -> first read sites):",
    ...[...reads.entries()].sort().map(([k, v]) => `  ${k}  ${v.join(", ")}`),
    "",
    `read in code but NOT in any env template (${undocumented.length}):`,
    ...undocumented.map((k) => `  ${k}  ${reads.get(k).join(", ")}`),
    "",
    `in a template but never read in code (${unused.length}):`,
    ...unused.map((k) => `  ${k}`),
    "",
    `dev/bypass/mock-looking flags read in code (${devFlags.length}) — the probe runs WITHOUT these set:`,
    ...devFlags.map((k) => `  ${k}  ${reads.get(k).join(", ")}`),
  ].join("\n");
  return { id: "env-example", title: "Environment variables: documented vs read in code (names only, no values)", summary: `${documented.size} documented, ${reads.size} read in code, ${undocumented.length} undocumented, ${devFlags.length} dev/bypass-looking flags`, content, names: [...new Set([...documented.keys(), ...reads.keys()])] };
}

function packageArtifact(root, files) {
  const pkgs = files.filter((f) => /(^|\/)package\.json$/.test(f) && f.split("/").length <= 4);
  const parts = [];
  for (const p of pkgs) {
    const j = readJSON(path.join(root, p), null);
    if (!j) continue;
    parts.push(`## ${p}`, `name: ${j.name || "(none)"}  version: ${j.version || "(none)"}  license: ${j.license || "(none)"}`, "scripts:");
    for (const [k, v] of Object.entries(j.scripts || {})) parts.push(`  ${k}: ${v}`);
    parts.push(`dependencies: ${Object.entries(j.dependencies || {}).map(([k, v]) => `${k}@${v}`).join(", ") || "(none)"}`);
    parts.push(`devDependencies: ${Object.entries(j.devDependencies || {}).map(([k, v]) => `${k}@${v}`).join(", ") || "(none)"}`);
    const lock = path.join(root, path.dirname(p), "package-lock.json");
    if (exists(lock)) {
      const l = readJSON(lock, null);
      parts.push(`package-lock.json: lockfileVersion ${l?.lockfileVersion}, ${Object.keys(l?.packages || {}).length - 1} locked packages`);
    } else parts.push("package-lock.json: (absent)");
    parts.push("");
  }
  return { id: "package-scripts", title: "package.json manifests, scripts and dependency lists", summary: `${pkgs.length} package.json files`, content: parts.join("\n") || "no package.json files found" };
}

const COPYLEFT_RE = /\b(A?GPL|LGPL|SSPL|EUPL|OSL|CPAL|MPL|CC-BY-SA|CC-BY-NC)/i;

function licensesArtifact(root, files) {
  const locks = files.filter((f) => /(^|\/)package-lock\.json$/.test(f));
  const rows = [];
  for (const lf of locks) {
    const l = readJSON(path.join(root, lf), null);
    for (const [k, v] of Object.entries(l?.packages || {})) {
      if (!k) continue;
      const name = k.replace(/^.*node_modules\//, "");
      let lic = v.license;
      if (!lic) {
        const pj = readJSON(path.join(root, path.dirname(lf), k, "package.json"), null);
        lic = pj?.license || (typeof pj?.licenses?.[0] === "object" ? pj.licenses[0].type : null);
      }
      rows.push({ lock: lf, name, version: v.version, license: lic ? String(lic) : "(none)", dev: !!v.dev, optional: !!v.optional });
    }
  }
  const byLicense = {};
  for (const r of rows) byLicense[r.license] = (byLicense[r.license] || 0) + 1;
  const flagged = rows.filter((r) => COPYLEFT_RE.test(r.license) || /\(none\)|UNLICENSED|SEE LICENSE|UNKNOWN/i.test(r.license));
  const content = [
    `lockfiles: ${locks.join(", ") || "(none — license data unavailable)"}`,
    `packages: ${rows.length} (${rows.filter((r) => !r.dev).length} non-dev)`,
    "",
    "count by license string:",
    ...Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
    "",
    `flagged (copyleft / missing / custom) — ${flagged.length}:`,
    ...flagged.map((r) => `  ${r.name}@${r.version}  ${r.license}  ${r.dev ? "dev" : "PROD"}${r.optional ? " optional(platform-specific)" : ""}  [${r.lock}]`),
    "",
    "Note: these are license STRINGS from package metadata, not legal analysis.",
  ].join("\n");
  return { id: "licenses", title: "Dependency licenses from lockfiles", summary: `${rows.length} packages, ${flagged.length} flagged (copyleft/missing/custom)`, content };
}

function secretsArtifact(safety, scopeFileCount) {
  const content = [
    `files scanned for committed credentials: ${scopeFileCount} (git tracked + untracked-not-ignored)`,
    `high-confidence credential hits in those files: ${safety.scopeHits.length} (any hit would have refused the run)`,
    "",
    "credential-bearing files found on disk and QUARANTINED (not copied to sandbox, agents denied read; key NAMES only):",
    ...safety.envFiles.map((e) => `  ${e.file}: keys = ${e.keys.join(", ") || "(none)"}`),
    ...safety.quarantined.filter((q) => !safety.envFiles.some((e) => e.file === q)).map((q) => `  ${q}`),
    safety.quarantined.length ? "" : "  (none)",
    "patterns checked: Stripe live keys, AWS access keys, private keys, GitHub/Slack/Anthropic/OpenAI/Google/Groq/Resend tokens, database URLs with passwords for non-local hosts.",
    "Gitignore status of quarantined files is in the git artifact / .gitignore.",
  ].join("\n");
  return { id: "secrets-scan", title: "Credential scan and quarantine list", summary: `${safety.scopeHits.length} committed-credential hits; ${safety.quarantined.length} credential files quarantined`, content };
}

const TEST_FILE_RE = /(^|\/)[^/]*[._-](test|spec)\.[cm]?[jt]sx?$|(^|\/)(test|tests|__tests__)\/.*\.[cm]?[jt]sx?$/;
const ASSERT_RE = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\bt\.(?:is|not|ok|notOk|equal|deepEqual|same|throws|rejects|true|false|match)\s*\(|\.should\b|\bstrictEqual\s*\(|\bdeepStrictEqual\s*\(|\bok\s*\(|\bthrows\s*\(/g;
const TRIVIAL_RE = /expect\(\s*(true|1|!0)\s*\)\s*\.\s*(toBe|toEqual|toBeTruthy)\(\s*(true|1)?\s*\)|assert(?:\.ok|\.equal|\.strictEqual)?\(\s*true\s*[,)]|assert\.(?:strict)?[eE]qual\(\s*(1|true)\s*,\s*\1\s*[,)]|expect\(\s*true\s*\)/g;
const CASE_RE = /\b(?:it|test)(?:\.only|\.skip)?\s*\(/g;

function testInventoryArtifact(root, files) {
  const testFiles = files.filter((f) => TEST_FILE_RE.test(f) && !/(^|\/)(fixtures?|__fixtures__|mocks?)\//.test(f));
  const pkgs = files.filter((f) => /(^|\/)package\.json$/.test(f)).map((f) => ({ f, j: readJSON(path.join(root, f), null) })).filter((p) => p.j);
  const scripts = pkgs.flatMap((p) => Object.entries(p.j.scripts || {}).filter(([k]) => /test/.test(k)).map(([k, v]) => ({ pkg: p.f, dir: path.posix.dirname(p.f), name: k, cmd: v })));
  const autoRunner = scripts.find((s) => /\b(jest|vitest|mocha|ava|tap|playwright)\b|node\s+--test(\s*$|\s+\S*\/?\s*$)/.test(s.cmd));
  const rows = [];
  for (const f of testFiles) {
    const text = readText(path.join(root, f)) || "";
    const asserts = (text.match(ASSERT_RE) || []).length;
    const trivial = (text.match(TRIVIAL_RE) || []).length;
    const cases = (text.match(CASE_RE) || []).length;
    const base = path.posix.basename(f);
    const referenced = scripts.filter((s) => s.cmd.includes(base) || s.cmd.includes(f) || s.cmd.includes(path.posix.relative(s.dir === "." ? "" : s.dir, f)));
    const status = referenced.length ? `run by ${referenced.map((s) => `${s.pkg}#${s.name}`).join(", ")}` : autoRunner ? `possibly discovered by runner in ${autoRunner.pkg}#${autoRunner.name}` : "NOT referenced by any test script";
    rows.push({ f, asserts, trivial, cases, status });
  }
  const notRun = rows.filter((r) => r.status.startsWith("NOT"));
  const noAssert = rows.filter((r) => r.asserts === 0);
  const content = [
    "test scripts:",
    ...(scripts.length ? scripts.map((s) => `  ${s.pkg}#${s.name}: ${s.cmd}`) : ["  (none)"]),
    "",
    `test files: ${rows.length}; not referenced by any script: ${notRun.length}; zero assertions: ${noAssert.length}; files with trivial assertions: ${rows.filter((r) => r.trivial).length}`,
    "",
    "per file: assertions / trivial assertions / test cases / how it runs",
    ...rows.map((r) => `  ${r.f}: asserts=${r.asserts} trivial=${r.trivial} cases=${r.cases} — ${r.status}`),
    "",
    "Counts are regex-based (static); the verifier and functional lens must read the files to judge what the assertions check.",
  ].join("\n");
  return { id: "test-inventory", title: "Test file inventory (static)", summary: `${rows.length} test files; ${notRun.length} not run by any script; ${noAssert.length} with zero assertions; ${rows.filter((r) => r.trivial).length} with trivial assertions`, content };
}

module.exports = { gitArtifact, filesArtifact, envArtifact, packageArtifact, licensesArtifact, secretsArtifact, testInventoryArtifact };
