"use strict";
// Best-effort static route discovery (Express-style + Next.js file routes). Its job is to
// give the probe a list of doors to knock on. Anything it misses, lens agents can still
// probe explicitly; anything it can't place under a mount prefix is marked "prefix?".

const path = require("path");
const { readText } = require("../util");

const JS_RE = /\.(c|m)?[jt]sx?$/;
const EXTS = ["", ".js", ".ts", ".cjs", ".mjs", "/index.js", "/index.ts"];

function lineOf(text, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function resolveSpec(fromFile, spec, fileSet) {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const e of EXTS) if (fileSet.has(base + e)) return base + e;
  return null;
}

function extractRoutes(root, files) {
  const fileSet = new Set(files);
  const src = files.filter((f) => JS_RE.test(f) && !/(^|\/)(public|dist|build|static|node_modules|test|tests|__tests__|fixtures?)\//.test(f) && !/\.(test|spec|min)\./.test(f));
  const info = {};
  for (const f of src) {
    const text = readText(path.join(root, f), 800 * 1024);
    if (!text) continue;
    const requires = {};
    let m;
    const reqRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)|import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = reqRe.exec(text))) {
      const r = resolveSpec(f, m[2] || m[4], fileSet);
      if (r) requires[m[1] || m[3]] = r;
    }
    const apps = new Set();
    const appRe = /(?:const|let|var)\s+(\w+)\s*=\s*(?:express|fastify|Fastify)\s*\(/g;
    while ((m = appRe.exec(text))) apps.add(m[1]);
    const mounts = [];
    const useRe = /(\w+)\.use\(\s*(['"`])(\/[^'"`]*)\2\s*,([\s\S]{0,400}?)\)\s*;?\s*(?:\n|$)/g;
    while ((m = useRe.exec(text))) {
      const args = m[4];
      const targets = [];
      const inl = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      let im;
      while ((im = inl.exec(args))) {
        const r = resolveSpec(f, im[1], fileSet);
        if (r) targets.push(r);
      }
      for (const id of args.match(/\b\w+\b/g) || []) if (requires[id]) targets.push(requires[id]);
      mounts.push({ receiver: m[1], prefix: m[3], targets, line: lineOf(text, m.index) });
    }
    const routes = [];
    const routeRe = /\b(\w+)\.(get|post|put|patch|delete|all)\(\s*(['"`])(\/[^'"`]*)\3/g;
    while ((m = routeRe.exec(text))) routes.push({ receiver: m[1], method: m[2].toUpperCase(), path: m[4], line: lineOf(text, m.index) });
    info[f] = { requires, apps, mounts, routes };
  }

  // Resolve mount prefixes: a file mounted at P by a receiver that itself has prefix Q gets Q+P.
  const prefixes = {};
  for (const [f, i] of Object.entries(info)) if (i.apps.size) prefixes[f] = new Set([""]);
  for (let pass = 0; pass < 5; pass++) {
    for (const [f, i] of Object.entries(info)) {
      for (const mt of i.mounts) {
        const parentPrefixes = i.apps.has(mt.receiver) ? [""] : [...(prefixes[f] || [])];
        for (const t of mt.targets) {
          prefixes[t] ||= new Set();
          for (const pp of parentPrefixes) prefixes[t].add((pp + mt.prefix).replace(/\/+$/, "") || "/");
        }
      }
    }
  }

  const out = [];
  for (const [f, i] of Object.entries(info)) {
    for (const r of i.routes) {
      if (i.apps.has(r.receiver)) out.push({ method: r.method, path: r.path, file: f, line: r.line, prefixKnown: true });
      else if (prefixes[f]?.size) for (const p of prefixes[f]) out.push({ method: r.method, path: (p === "/" ? "" : p) + (r.path === "/" ? "" : r.path) || "/", file: f, line: r.line, prefixKnown: true });
      else out.push({ method: r.method, path: r.path, file: f, line: r.line, prefixKnown: false });
    }
  }

  // Next.js file-based routes.
  for (const f of files) {
    let m = f.match(/(?:^|\/)pages\/api\/(.+)\.(?:[jt]sx?)$/);
    if (m) {
      out.push({ method: "ANY", path: "/api/" + m[1].replace(/\/index$/, "").replace(/\[(\w+)\]/g, ":$1"), file: f, line: 1, prefixKnown: true });
      continue;
    }
    m = f.match(/(?:^|\/)app\/(.*)\/route\.(?:[jt]sx?)$/);
    if (m) {
      const text = readText(path.join(root, f)) || "";
      const methods = [...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((x) => x[1]);
      for (const meth of methods.length ? methods : ["GET"]) out.push({ method: meth, path: "/" + m[1].replace(/\([^)]*\)\/?/g, "").replace(/\[(\w+)\]/g, ":$1"), file: f, line: 1, prefixKnown: true });
    }
  }

  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.method} ${r.path} ${r.file}:${r.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function routesArtifact(routes) {
  const content = [
    `${routes.length} route definitions discovered statically (Express-style app/router calls, Next.js file routes).`,
    "Routes marked prefix? were found in a router file whose mount prefix couldn't be resolved statically.",
    "",
    ...routes.map((r) => `${r.method.padEnd(6)} ${r.path}${r.prefixKnown ? "" : "   (prefix?)"}   ${r.file}:${r.line}`),
  ].join("\n");
  return { id: "routes", title: "HTTP routes (static discovery)", summary: `${routes.length} routes (${routes.filter((r) => !r.prefixKnown).length} with unresolved mount prefix)`, content };
}

module.exports = { extractRoutes, routesArtifact };
