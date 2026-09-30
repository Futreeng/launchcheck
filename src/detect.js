"use strict";
// Project type / stage inference. Every signal that drove the inference is returned so the
// report can show WHY it decided what it decided, and the user can correct it.

const path = require("path");
const readline = require("readline");
const { readText, readJSON, exists } = require("./util");

const SOURCE_RE = /\.(m?[jt]sx?|cjs|py|cs|go|rb|php|java|kt|rs)$/i;
const DOC_RE = /\.(md|mdx|txt|rst)$/i;

function countMatches(text, re) {
  return (text.match(re) || []).length;
}

function readPkgs(root, files) {
  return files
    .filter((f) => /(^|\/)package\.json$/.test(f) && f.split("/").length <= 3)
    .map((f) => ({ file: f, json: readJSON(path.join(root, f), null) }))
    .filter((p) => p.json);
}

function gatherSignals(root, files) {
  const s = {
    billingFiles: [],
    serverFiles: [],
    unity: false,
    library: false,
    cli: false,
    deploy: [],
    stageWords: { concept: 0, pilot: 0, beta: 0, ga: 0 },
    stageWordFiles: { concept: new Set(), pilot: new Set(), beta: new Set(), ga: new Set() },
    notes: [],
  };
  const pkgs = readPkgs(root, files);
  for (const p of pkgs) {
    if (p.json.bin) s.cli = true;
    const deps = { ...(p.json.dependencies || {}) };
    if ((p.json.exports || p.json.main || p.json.module) && !deps.express && !deps.fastify && !deps.koa && !deps.next && !p.json.scripts?.start) s.library = true;
  }
  if (files.some((f) => /^Assets\/.*\.cs$/.test(f)) || files.some((f) => /^ProjectSettings\//.test(f)) || files.some((f) => /\.asmdef$/.test(f))) s.unity = true;
  for (const f of files) {
    if (/(^|\/)(render\.yaml|vercel\.json|netlify\.toml|fly\.toml|railway\.json|Procfile|app\.yaml|Dockerfile|nixpacks\.toml)$/.test(f) || /^\.github\/workflows\/.*deploy/i.test(f)) s.deploy.push(f);
  }
  let scanned = 0;
  for (const f of files) {
    if (scanned > 1500) break;
    const isSrc = SOURCE_RE.test(f) && !/(^|\/)(test|tests|__tests__|fixtures?)\//.test(f) && !/\.(test|spec)\./.test(f);
    const isDoc = DOC_RE.test(f) && !/(^|\/)(archived?|node_modules)\//i.test(f);
    if (!isSrc && !isDoc) continue;
    const text = readText(path.join(root, f), 400 * 1024);
    if (!text) continue;
    scanned++;
    if (isSrc) {
      if (/\b(stripe|paddle|lemonsqueezy|braintree|chargebee)\b|entitlement|paywall|\bcheckout\b|subscription|\bbilling\b|\bpremium\b|\bupgrade\b/i.test(text)) s.billingFiles.push(f);
      if (/express\(\)|fastify\(|new Koa\(|http\.createServer|\.listen\(\s*(PORT|port|process\.env)|FastAPI\(|Flask\(__name__\)/.test(text)) s.serverFiles.push(f);
    }
    if (isDoc) {
      const weight = /readme|status|handoff/i.test(f) ? 2 : 1;
      const add = (stage, n) => {
        if (n) {
          s.stageWords[stage] += n * weight;
          s.stageWordFiles[stage].add(f);
        }
      };
      add("concept", countMatches(text, /\b(concept|prototype|proof[- ]of[- ]concept|pre-pilot|idea stage|not yet built)\b/gi));
      add("pilot", countMatches(text, /\b(pilot|testers?|design partners?|alpha)\b/gi));
      add("beta", countMatches(text, /\b(beta|waitlist|early access|soft launch|deployed to|live at|onrender\.com|vercel\.app|production)\b/gi));
      add("ga", countMatches(text, /\b(paying customers?|live payments?|revenue|subscribers|general availability|MRR)\b/gi));
    }
  }
  return s;
}

function inferType(s) {
  const reasons = [];
  if (s.unity) {
    reasons.push("Unity project layout (Assets/*.cs, ProjectSettings/ or .asmdef)");
    return { type: "sdk", confidence: 0.75, reasons };
  }
  if (s.billingFiles.length >= 2 && s.serverFiles.length) {
    reasons.push(`billing/paywall code in ${s.billingFiles.length} source files (e.g. ${s.billingFiles.slice(0, 3).join(", ")})`);
    reasons.push(`HTTP server in ${s.serverFiles.slice(0, 2).join(", ")}`);
    return { type: "saas", confidence: 0.85, reasons };
  }
  if (s.library && !s.serverFiles.length) {
    reasons.push("package exports a library entry point and runs no server");
    return { type: "sdk", confidence: 0.7, reasons };
  }
  if (s.cli && !s.serverFiles.length) {
    reasons.push("package declares a CLI (bin) and runs no server");
    return { type: "internal", confidence: 0.6, reasons };
  }
  if (s.serverFiles.length) {
    reasons.push(`HTTP server (${s.serverFiles[0]}) but little or no billing code`);
    return { type: "saas", confidence: 0.5, reasons };
  }
  reasons.push("no server, billing, library or Unity signals found");
  return { type: "internal", confidence: 0.4, reasons };
}

function inferStage(s, type) {
  const reasons = [];
  const w = s.stageWords;
  const fileHint = (st) => [...s.stageWordFiles[st]].slice(0, 3).join(", ");
  if (s.deploy.length) reasons.push(`deploy config present: ${s.deploy.slice(0, 4).join(", ")}`);
  for (const st of ["concept", "pilot", "beta", "ga"]) if (w[st]) reasons.push(`${st}-stage wording x${w[st]} (${fileHint(st)})`);

  let stage;
  let confidence;
  const ranked = Object.entries(w).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (w.ga >= 4 && s.deploy.length && type === "saas") {
    stage = "ga";
    confidence = 0.55;
  } else if (s.deploy.length && (w.beta >= 3 || type === "saas")) {
    // Deployed somewhere public. Stricter of the plausible stages, stated as an assumption.
    stage = "beta";
    confidence = w.beta >= 6 ? 0.65 : 0.5;
  } else if (top[1] === 0) {
    stage = s.deploy.length ? "beta" : "pilot";
    confidence = 0.3;
  } else {
    stage = top[0];
    confidence = top[1] >= 2 * (second[1] || 0.5) ? 0.6 : 0.4;
  }
  return { stage, confidence, reasons };
}

const STAGE_QUESTION = {
  prompt: "Who will use what you're about to ship?",
  options: [
    ["concept", "Only us — it's a concept / internal experiment"],
    ["pilot", "A handful of known testers (pilot)"],
    ["beta", "The public, but nobody is paying yet (beta)"],
    ["ga", "Paying customers (general availability)"],
  ],
};

async function askStage(defaultStage) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const lines = [`\n${STAGE_QUESTION.prompt}`];
  STAGE_QUESTION.options.forEach(([id, label], i) => lines.push(`  ${i + 1}) ${label}${id === defaultStage ? "   [default]" : ""}`));
  lines.push(`Choose 1-4 (Enter = ${defaultStage}, saved for next time; override later with --stage): `);
  const answer = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(""), 120000);
    rl.question(lines.join("\n"), (a) => {
      clearTimeout(timer);
      resolve(a);
    });
  });
  rl.close();
  const n = parseInt(answer, 10);
  return n >= 1 && n <= 4 ? STAGE_QUESTION.options[n - 1][0] : null;
}

/**
 * Resolve the profile. Precedence: CLI flag > saved answer in project.json > inference.
 * Asks at most ONE question, only when stage confidence is low and stdin is interactive.
 */
async function resolveProfile(root, files, { flags = {}, saved = {}, interactive = false } = {}) {
  const s = gatherSignals(root, files);
  const t = inferType(s);
  const st = inferStage(s, t.type);
  const assumptions = [];

  let type = t.type;
  let typeSource = "inferred";
  if (flags.type) [type, typeSource] = [flags.type, "flag"];
  else if (saved.type) [type, typeSource] = [saved.type, "saved answer (.launchcheck/project.json)"];
  else if (t.confidence < 0.6) assumptions.push(`Project type assumed "${type}" (low confidence). Re-run with --type=saas|sdk|internal if wrong.`);

  let stage = st.stage;
  let stageSource = "inferred";
  let asked = false;
  if (flags.stage) [stage, stageSource] = [flags.stage, "flag"];
  else if (saved.stage) [stage, stageSource] = [saved.stage, "saved answer (.launchcheck/project.json)"];
  else if (st.confidence < 0.6) {
    if (interactive) {
      const ans = await askStage(st.stage);
      asked = true;
      if (ans) [stage, stageSource] = [ans, "answered"];
      else {
        stageSource = "default after question";
        assumptions.push(`Stage defaulted to "${stage}" (question left blank). Re-run with --stage=concept|pilot|beta|ga if wrong.`);
      }
    } else {
      assumptions.push(`Stage assumed "${stage}" (confidence ${st.confidence}; non-interactive so nobody was asked). Re-run with --stage=concept|pilot|beta|ga if wrong — e.g. --stage=ga if paying customers will use this.`);
    }
  }

  return {
    type,
    stage,
    typeSource,
    stageSource,
    asked,
    inference: { type: t, stage: st },
    signals: { deploy: s.deploy, billingFiles: s.billingFiles.slice(0, 10), serverFiles: s.serverFiles.slice(0, 5), unity: s.unity, stageWords: s.stageWords },
    assumptions,
  };
}

module.exports = { resolveProfile, gatherSignals, inferType, inferStage };
