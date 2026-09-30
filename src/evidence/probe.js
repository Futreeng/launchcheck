"use strict";
// Runtime probing: boot the sandboxed copy of the app (scrubbed env, no real credentials,
// fresh local state), then (1) sweep every discovered route with NO credentials, and later
// (2) execute the specific attack sequences lens agents propose (e.g. sign up as a free
// user, then call a paid endpoint). Only ever talks to 127.0.0.1 on a port we chose.

const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { readJSON, exists, killTree, IS_WIN, truncate } = require("../util");
const { sandboxEnv } = require("../sandbox");
const { isLocalUrl } = require("../safety");

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function detectStart(root, projectCfg, serverFiles) {
  const p = projectCfg.probe || {};
  if (p.start) return { argv: p.start, cwd: p.cwd || ".", source: ".launchcheck/project.json probe.start" };
  const pkg = readJSON(path.join(root, "package.json"), null);
  const start = pkg?.scripts?.start;
  if (start) {
    let m = start.match(/^node\s+([^\s&|;]+)\s*$/);
    if (m) return { argv: ["node", m[1]], cwd: ".", source: `package.json scripts.start (${start})` };
    m = start.match(/^cd\s+(\S+)\s*&&\s*node\s+([^\s&|;]+)\s*$/);
    if (m) return { argv: ["node", m[2]], cwd: m[1], source: `package.json scripts.start (${start})` };
  }
  if (pkg?.main && serverFiles.includes(pkg.main)) return { argv: ["node", pkg.main], cwd: ".", source: "package.json main" };
  for (const c of ["server.js", "index.js", "app.js", "server/server.js", "server/index.js", "server/app.js", "src/server.js", "src/index.js", "backend/server.js", "api/server.js"]) {
    if (serverFiles.includes(c)) return { argv: ["node", c], cwd: ".", source: `detected HTTP listener in ${c}` };
  }
  return null;
}

async function httpRequest(baseUrl, { method = "GET", path: p = "/", headers = {}, body }, jar) {
  const url = new URL(p, baseUrl);
  if (!isLocalUrl(url.href) || url.origin !== new URL(baseUrl).origin) throw new Error(`refusing non-sandbox URL ${url.href}`);
  const h = { ...headers };
  if (jar && jar.size) h.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  let payload;
  if (body !== undefined && body !== null && method !== "GET" && method !== "HEAD") {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) h["content-type"] = "application/json";
  }
  const started = Date.now();
  try {
    const res = await fetch(url, { method, headers: h, body: payload, redirect: "manual", signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    if (jar) for (const c of setCookies) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    return {
      status: res.status,
      ms: Date.now() - started,
      contentType: res.headers.get("content-type") || "",
      location: res.headers.get("location") || undefined,
      setCookie: setCookies.map((c) => c.split("=")[0]),
      bytes: text.length,
      body: text,
    };
  } catch (e) {
    return { status: null, ms: Date.now() - started, error: e.name === "TimeoutError" ? "timeout after 10s" : e.message };
  }
}

// Secrets an app generates/owns itself (token signing, at-rest encryption) — NOT credentials
// for any outside service. Apps that fail loudly without them (good practice) would never
// boot in a scrubbed sandbox, so each gets a fresh random value per run. Anything that
// talks to the outside world (API keys, Stripe, DATABASE_URL, SMTP…) is never filled.
const SELF_SECRET_RE = /^(JWT|SESSION|COOKIE|CSRF|SIGNING|HMAC|TOKEN|AUTH|APP)_?(SECRET|KEY|SIGNING_KEY)$|^(SECRET_KEY|ENCRYPTION_KEY|ENCRYPTION_SECRET|MASTER_KEY|SECRET)$/;
const EXTERNAL_RE = /STRIPE|ANTHROPIC|OPENAI|GEMINI|GOOGLE|GROQ|AWS|AZURE|GITHUB|SLACK|RESEND|SENDGRID|MAILGUN|TWILIO|DATABASE|POSTGRES|REDIS|MONGO|SUPABASE|FIREBASE|BRIGHT|APIFY|INSTAGRAM|TIKTOK|TWITTER|FACEBOOK|LINKEDIN|VERCEL|RENDER|RAILWAY|SENTRY|WEBHOOK/;

function ephemeralSecrets(names) {
  const crypto = require("crypto");
  const out = {};
  for (const n of names) if (SELF_SECRET_RE.test(n) && !EXTERNAL_RE.test(n)) out[n] = crypto.randomBytes(32).toString("hex");
  return out;
}

async function startServer(sb, root, projectCfg, serverFiles, redact, envNames = []) {
  const spec = detectStart(root, projectCfg, serverFiles);
  if (!spec) return { ok: false, reason: "no start command found (no plain `node <file>` start script or detectable server entry). Set probe.start in .launchcheck/project.json, e.g. [\"node\",\"server/server.js\"]." };
  const port = projectCfg.probe?.port || (await freePort());
  const portEnv = projectCfg.probe?.port_env || "PORT";
  const generated = ephemeralSecrets(envNames);
  const extraEnv = { ...generated, ...(projectCfg.probe?.env || {}), [portEnv]: String(port), HOST: "127.0.0.1" };
  const baseRedact = redact;
  const genValues = Object.values(generated);
  redact = (s) => {
    let t = baseRedact(s);
    for (const v of genValues) t = String(t).split(v).join("[EPHEMERAL]");
    return t;
  };
  const argv = spec.argv[0] === "node" ? [process.execPath, ...spec.argv.slice(1)] : spec.argv;
  const cwd = path.join(sb.dir, spec.cwd);
  if (!exists(cwd)) return { ok: false, reason: `start cwd ${spec.cwd} not found in sandbox` };
  let log = "";
  const child = spawn(argv[0], argv.slice(1), { cwd, env: sandboxEnv(sb, extraEnv), windowsHide: true, detached: !IS_WIN, shell: false });
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  let exited = null;
  child.on("exit", (code) => (exited = code));
  child.on("error", (e) => (log += `\n[spawn error] ${e.message}`));
  const baseUrl = `http://127.0.0.1:${port}`;
  const readyPath = projectCfg.probe?.ready_path || "/";
  const deadline = Date.now() + (projectCfg.probe?.boot_timeout_ms || 60000);
  let ready = false;
  while (Date.now() < deadline && exited === null) {
    const r = await httpRequest(baseUrl, { path: readyPath });
    if (r.status !== null) {
      ready = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  const stop = () => {
    killTree(child.pid);
  };
  const command = `${spec.argv.join(" ")}   (cwd: sandbox/${spec.cwd}; env: scrubbed + ${Object.keys(extraEnv).filter((k) => !generated[k]).join(", ")}${Object.keys(generated).length ? `; fresh random per-run values for self-owned secrets: ${Object.keys(generated).join(", ")}` : ""}; start from ${spec.source})`;
  if (!ready) {
    stop();
    return { ok: false, reason: exited !== null ? `server exited with code ${exited} before accepting requests` : `server did not accept requests on port ${port} within the boot timeout (does it honor ${portEnv}?)`, log: redact(log), command };
  }
  return { ok: true, baseUrl, port, command, getLog: () => redact(log), stop, spec, redact, generatedNames: Object.keys(generated) };
}

function fillParams(p) {
  return p.replace(/:(\w+)\??/g, "lc-probe-1").replace(/\*/g, "lc-probe");
}

async function sweep(server, routes, redact) {
  const seen = new Set();
  const targets = [{ method: "GET", path: "/launchcheck-nonexistent-path-404-baseline", file: "(baseline)", line: 0 }];
  for (const r of routes) {
    const method = r.method === "ALL" || r.method === "ANY" ? "GET" : r.method;
    const p = fillParams(r.path);
    const k = `${method} ${p}`;
    if (seen.has(k) || /[()[\]\\^$]/.test(p)) continue;
    seen.add(k);
    targets.push({ method, path: p, file: r.file, line: r.line, prefixKnown: r.prefixKnown });
  }
  const lines = [];
  const results = [];
  for (const t of targets.slice(0, 300)) {
    const res = await httpRequest(server.baseUrl, { method: t.method, path: t.path, body: t.method === "GET" ? undefined : {} });
    const body = redact(truncate((res.body || res.error || "").replace(/\s+/g, " "), 240));
    const statusStr = res.status === null ? `ERR(${res.error})` : String(res.status);
    lines.push(`${t.method.padEnd(6)} ${t.path}  ->  ${statusStr}  ${res.contentType ? `[${res.contentType.split(";")[0]}]` : ""} ${res.bytes ?? 0}B ${res.ms}ms   (${t.file}:${t.line}${t.prefixKnown === false ? ", prefix?" : ""})\n        body: ${body}`);
    results.push({ ...t, status: res.status });
    await new Promise((r) => setTimeout(r, 40));
  }
  const counts = {};
  for (const r of results) {
    const c = r.status === null ? "error" : `${String(r.status)[0]}xx`;
    counts[c] = (counts[c] || 0) + 1;
  }
  return {
    artifact: {
      id: "probe-sweep",
      title: "Unauthenticated probe of every discovered route (sandboxed local instance)",
      command: `HTTP requests to ${server.baseUrl} with NO cookies, NO Authorization header; POST/PUT/PATCH/DELETE send {} — server: ${server.command}`,
      summary: `${results.length} requests: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`,
      content: [
        "Every line is a real request/response against a sandboxed copy of the app (fresh local state, scrubbed env, no real credentials, no dev-bypass flags).",
        "A 2xx on a route that should require auth is a candidate bypass; 401/403 means the gate held; 5xx/ERR on no-credential requests is a reliability signal.",
        "",
        ...lines,
      ].join("\n"),
    },
    results,
  };
}

function getPath(obj, p) {
  return p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function subst(v, vars) {
  if (typeof v === "string") return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  if (Array.isArray(v)) return v.map((x) => subst(x, vars));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x, vars)]));
  return v;
}

// Execute one agent-proposed probe sequence. Each sequence gets its own cookie jar and
// variables; {{rand}} is unique per sequence (for unique signup emails).
async function runSequence(server, seq, idx, redact) {
  const vars = { rand: `lc${Date.now().toString(36)}${idx}` };
  const jar = new Map();
  const out = [];
  const steps = (seq.steps || []).slice(0, 8);
  for (const [i, raw] of steps.entries()) {
    const step = subst(raw, vars);
    const method = String(step.method || "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method) || typeof step.path !== "string" || !step.path.startsWith("/")) {
      out.push(`step ${i + 1}: SKIPPED (invalid method/path: ${method} ${step.path})`);
      continue;
    }
    let body = step.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const headers = {};
    for (const h of step.headers || []) if (h && h.name && !/^host$/i.test(h.name)) headers[h.name] = String(h.value ?? "");
    const res = await httpRequest(server.baseUrl, { method, path: step.path, headers, body }, step.use_cookies === false ? null : jar);
    let json = null;
    try {
      json = JSON.parse(res.body || "");
    } catch {}
    for (const c of step.capture || []) {
      if (!c || !c.var || !c.from) continue;
      if (c.from.startsWith("json:") && json) vars[c.var] = getPath(json, c.from.slice(5));
    }
    out.push(
      `step ${i + 1}: ${method} ${step.path}${Object.keys(headers).length ? `  headers: ${redact(JSON.stringify(headers))}` : ""}${body !== undefined ? `  body: ${redact(truncate(JSON.stringify(body), 300))}` : ""}\n  -> ${res.status === null ? `ERR(${res.error})` : res.status} ${res.contentType ? `[${res.contentType.split(";")[0]}]` : ""} ${res.ms}ms${res.setCookie?.length ? ` set-cookie: ${res.setCookie.join(",")}` : ""}${res.location ? ` location: ${res.location}` : ""}\n  body: ${redact(truncate((res.body || "").replace(/\s+/g, " "), 500))}`
    );
    await new Promise((r) => setTimeout(r, 80));
  }
  return out.join("\n");
}

module.exports = { startServer, sweep, runSequence, detectStart, httpRequest, ephemeralSecrets };
