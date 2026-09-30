"use strict";
// Production / credential safety gate. Runs before anything else touches the target.
//
// Policy (see README "Safety"):
//  - REFUSE if production config or live credentials would be in scope: the shell we run in
//    looks like prod, an env file in the target declares production / live payment keys /
//    remote database or cloud credentials, a live secret sits in a file that would be copied
//    into the sandbox, or a probe URL isn't local.
//  - QUARANTINE every other credential-bearing file (dev .env files, .vercel/, key files):
//    never copied into the sandbox, agents are denied read access, and every known secret
//    value is redacted from anything written or shown.

const fs = require("fs");
const path = require("path");
const { readText, listAllFiles } = require("./util");

// High-confidence patterns only. A noisy scanner here would make the tool refuse to run on
// every project, which just teaches people to bypass it.
const SECRET_PATTERNS = [
  { type: "stripe_live_secret", re: /\b[sr]k_live_[0-9A-Za-z]{20,}\b/g, prod: true },
  { type: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/g, prod: true },
  { type: "private_key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/g, prod: true },
  { type: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { type: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { type: "openai_key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/g },
  { type: "google_api_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { type: "groq_key", re: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { type: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: "resend_key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g },
];

const DB_URL_RE = /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?):\/\/([^\s:@'"`/]+):([^\s@'"`]+)@([^\s/:'"`?]+)/g;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal", "db", "postgres", "redis", "mongo", "mysql"]);

// Documentation placeholders like postgres://user:pass@host must not trigger a refusal.
const PLACEHOLDER_HOST = /^(host|hostname|your[-_]?host|example\.(com|org)|db\.example\.com|<.*>|\$\{?.*\}?|xxx+|server|domain)$/i;
const PLACEHOLDER_PASS = /^(pass(word)?|pw|pwd|secret|changeme|xxx+|\*+|<.*>|\$\{?.*\}?|your[-_]?password|\.\.\.)$/i;
function isPlaceholderDbUrl(user, pass, host) {
  return PLACEHOLDER_HOST.test(host) || PLACEHOLDER_PASS.test(pass) || /[<{$]/.test(pass) || /^(user(name)?|<.*>)$/i.test(user) && /^(pass(word)?)$/i.test(pass);
}

function isLocalHost(host) {
  return LOCAL_HOSTS.has(String(host).toLowerCase()) || /\.local$|\.localhost$/.test(String(host).toLowerCase());
}

function isLocalUrl(u) {
  try {
    const url = new URL(u);
    return isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

const ENV_TEMPLATE_RE = /(^|\/)\.env\.(example|sample|template|dist|defaults)$|(^|\/)env\.example$/i;
const ENV_FILE_RE = /(^|\/)\.env(\.[^/]+)?$|(^|\/)[^/]+\.env$/i;
const CRED_FILE_RE = /(^|\/)(\.vercel|\.netlify|\.aws|\.gcloud|\.azure|\.ssh)\/|(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$|\.(pem|key|p12|pfx|keystore|jks)$|(^|\/)(credentials|service-?account[^/]*|secrets?)\.(json|ya?ml)$|(^|\/)\.npmrc$|(^|\/)\.pypirc$/i;

function isEnvFile(rel) {
  return ENV_FILE_RE.test(rel) && !ENV_TEMPLATE_RE.test(rel);
}

function isCredentialFile(rel) {
  return isEnvFile(rel) || CRED_FILE_RE.test(rel);
}

function parseEnv(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out.push({ name: m[1], value: v });
  }
  return out;
}

// Classify one key=value without ever returning the value itself.
function classifyEnvPair(name, value) {
  const markers = [];
  if (/^(NODE_ENV|APP_ENV|ENV|ENVIRONMENT|RAILS_ENV|RACK_ENV|FLASK_ENV|DJANGO_ENV|VERCEL_ENV)$/i.test(name) && /^prod(uction)?$/i.test(value)) {
    markers.push(`${name}=production`);
  }
  if (/^[sr]k_live_/.test(value) || /^pk_live_/.test(value)) markers.push(`${name} is a live Stripe key`);
  if (/^AKIA[0-9A-Z]{16}$/.test(value)) markers.push(`${name} is an AWS access key`);
  DB_URL_RE.lastIndex = 0;
  const db = DB_URL_RE.exec(value);
  if (db && !isLocalHost(db[4]) && !isPlaceholderDbUrl(db[2], db[3], db[4])) markers.push(`${name} holds credentials for a remote database host (${db[4]})`);
  return markers;
}

function scanTextForSecrets(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of SECRET_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(line))) hits.push({ line: i + 1, type: p.type, prod: !!p.prod, value: m[0] });
    }
    DB_URL_RE.lastIndex = 0;
    let m;
    while ((m = DB_URL_RE.exec(line))) {
      if (!isLocalHost(m[4]) && !isPlaceholderDbUrl(m[2], m[3], m[4])) {
        hits.push({ line: i + 1, type: "remote_db_credentials", prod: true, value: m[0] });
      }
    }
  });
  return hits;
}

function mask(v) {
  v = String(v);
  return v.length <= 8 ? "****" : `${v.slice(0, 4)}…(${v.length} chars)`;
}

/**
 * @param {string} root absolute target path
 * @param {string[]} scopeFiles files that would be copied into the sandbox / read as the project
 * @param {object} opts { probeUrl, allowlist: [relpaths with known-fake secrets], env: process.env }
 */
function inspect(root, scopeFiles, opts = {}) {
  const env = opts.env || process.env;
  const allow = new Set((opts.allowlist || []).map((s) => s.replace(/\\/g, "/")));
  const refusals = [];
  const quarantined = [];
  const redactValues = new Set();
  const envFiles = [];
  const scopeHits = [];

  // 1. The shell we're running in.
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    const m = classifyEnvPair(k, v);
    if (m.length) refusals.push({ where: "your current shell environment", why: m.join("; ") });
    if (/KEY|SECRET|TOKEN|PASSWORD|PASS|DATABASE_URL|DSN/i.test(k) && v.length >= 12) redactValues.add(v);
  }

  // 2. Credential files anywhere in the target, including gitignored ones.
  for (const rel of listAllFiles(root)) {
    if (!isCredentialFile(rel)) continue;
    quarantined.push(rel);
    if (!isEnvFile(rel)) continue;
    const text = readText(path.join(root, rel), 512 * 1024);
    if (text === null) continue;
    const pairs = parseEnv(text);
    const markers = [];
    for (const { name, value } of pairs) {
      if (value.length >= 8) redactValues.add(value);
      markers.push(...classifyEnvPair(name, value));
    }
    envFiles.push({ file: rel, keys: pairs.map((p) => p.name), productionMarkers: markers });
    if (markers.length) refusals.push({ where: rel, why: markers.join("; ") });
  }

  // 3. Live secrets inside files that would be copied into the sandbox and executed.
  for (const rel of scopeFiles) {
    if (isCredentialFile(rel)) continue; // quarantined, never copied
    if (allow.has(rel)) continue;
    const text = readText(path.join(root, rel));
    if (text === null) continue;
    for (const h of scanTextForSecrets(text)) {
      redactValues.add(h.value);
      scopeHits.push({ file: rel, line: h.line, type: h.type, masked: mask(h.value) });
    }
  }
  if (scopeHits.length) {
    refusals.push({
      where: scopeHits.map((h) => `${h.file}:${h.line}`).slice(0, 10).join(", "),
      why: `live-looking credential(s) in project files that would be copied into the sandbox and loaded when the app runs (${[...new Set(scopeHits.map((h) => h.type))].join(", ")}). Rotate and remove them. If one is a deliberate fake, list the file under "fake_secret_allowlist" in .launchcheck/project.json`,
    });
  }

  // 4. Probe target must be local.
  if (opts.probeUrl && !isLocalUrl(opts.probeUrl)) {
    refusals.push({ where: `--probe-url ${opts.probeUrl}`, why: "launchcheck only ever probes localhost; it never sends requests to a deployed environment" });
  }

  return {
    refuse: refusals.length > 0,
    refusals,
    quarantined: [...new Set(quarantined)].sort(),
    envFiles,
    scopeHits,
    redactValues: [...redactValues].filter((v) => v.length >= 8).sort((a, b) => b.length - a.length),
  };
}

function makeRedactor(values) {
  const exact = values.filter((v) => v.length >= 8);
  return function redact(text) {
    if (text === null || text === undefined) return text;
    let s = String(text);
    for (const v of exact) if (s.includes(v)) s = s.split(v).join("[REDACTED]");
    for (const p of SECRET_PATTERNS) {
      p.re.lastIndex = 0;
      s = s.replace(p.re, `[REDACTED:${p.type}]`);
    }
    DB_URL_RE.lastIndex = 0;
    s = s.replace(DB_URL_RE, (m, proto, user, pass, host) => `${proto}://${user}:[REDACTED]@${host}`);
    return s;
  };
}

// Deep-redact any JSON-able structure.
function redactDeep(obj, redact) {
  if (typeof obj === "string") return redact(obj);
  if (Array.isArray(obj)) return obj.map((x) => redactDeep(x, redact));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = redactDeep(v, redact);
    return out;
  }
  return obj;
}

function formatRefusal(result, target) {
  const lines = [
    "",
    "launchcheck REFUSED to run: production config or live credentials are in scope.",
    `Target: ${target}`,
    "",
  ];
  for (const r of result.refusals) lines.push(`  - ${r.where}: ${r.why}`);
  lines.push(
    "",
    "launchcheck never runs with production config or real credentials in scope. It does not",
    "print secret values, and it has not started any process or sent any request.",
    "",
    "Ways forward:",
    "  - Move the production env file out of the project directory (keep it in your secret manager).",
    "  - Or evaluate a clean checkout that has no env files:",
    `      git clone "${target}" %TEMP%\\lc-clean  (or /tmp/lc-clean)  &&  launchcheck run <that dir>`,
    "  - If a flagged value is a deliberate fake used in tests, add the file to",
    '    "fake_secret_allowlist" in .launchcheck/project.json.',
    ""
  );
  return lines.join("\n");
}

module.exports = {
  inspect,
  makeRedactor,
  redactDeep,
  formatRefusal,
  isLocalUrl,
  isLocalHost,
  isEnvFile,
  isCredentialFile,
  scanTextForSecrets,
  parseEnv,
  classifyEnvPair,
  SECRET_PATTERNS,
};
