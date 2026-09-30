"use strict";
// Mechanical evidence enforcement. An agent saying "see sessions.js:31" proves nothing;
// this checks that the cited file exists, the lines exist, and the quoted text is actually
// there (or that the artifact excerpt is actually in the artifact). Claims whose evidence
// all fails are DROPPED — never softened into something vaguer and kept.

const fs = require("fs");
const path = require("path");
const { readText, toPosix } = require("./util");

function norm(s) {
  return String(s || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Agents sometimes elide the middle of a quote ("foo(...) … bar"). Every non-trivial
// segment must appear, in order.
function containsQuote(haystack, quote) {
  const h = norm(haystack);
  const segs = norm(quote)
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  if (!segs.length) return false;
  let from = 0;
  for (const s of segs) {
    const i = h.indexOf(s, from);
    if (i < 0) return false;
    from = i + s.length;
  }
  return true;
}

function makeValidator({ root, registry, quarantined = [], evidenceDir }) {
  const cache = new Map();
  const q = new Set(quarantined);
  const rootAbs = path.resolve(root);
  const evAbs = evidenceDir ? path.resolve(evidenceDir) : null;

  function fileLines(rel) {
    if (!cache.has(rel)) {
      const t = readText(path.join(rootAbs, rel), 4 * 1024 * 1024);
      cache.set(rel, t === null ? null : t.split(/\r?\n/));
    }
    return cache.get(rel);
  }

  function toRel(p) {
    let s = String(p || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (/^[a-zA-Z]:\//.test(s) || s.startsWith("/")) {
      const abs = path.resolve(s);
      if (evAbs && abs.startsWith(evAbs)) return { artifact: path.basename(abs).replace(/\.txt$/, "") };
      const rel = path.relative(rootAbs, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return { outside: true };
      s = toPosix(rel);
    }
    if (s.split("/").includes("..")) return { outside: true };
    return { rel: s };
  }

  function checkArtifact(ev, id) {
    const a = registry.get(id);
    if (!a) return { ok: false, reason: `artifact "${id}" does not exist` };
    const ex = ev.excerpt || ev.quote;
    if (!ex || norm(ex).length < 4) return { ok: false, reason: `artifact ${id} cited without an excerpt` };
    if (!containsQuote(a.text, ex)) return { ok: false, reason: `excerpt not found in artifact ${id}` };
    return { ok: true, evidence: { kind: "artifact", artifact_id: id, excerpt: String(ex).slice(0, 400) } };
  }

  function check(ev) {
    if (!ev || typeof ev !== "object") return { ok: false, reason: "malformed evidence" };
    if (ev.kind === "artifact" || (ev.artifact_id && !ev.path)) return checkArtifact(ev, ev.artifact_id);
    const r = toRel(ev.path);
    if (r.artifact) return checkArtifact(ev, r.artifact);
    if (r.outside || !r.rel) return { ok: false, reason: `path outside project: ${ev.path}` };
    const rel = r.rel;
    if (rel.startsWith(".launchcheck/")) return { ok: false, reason: "launchcheck's own history is not evidence about the project" };
    if (q.has(rel)) return { ok: false, reason: `quarantined credential file ${rel} cannot be cited` };
    const lines = fileLines(rel);
    if (lines === null) {
      if (!fs.existsSync(path.join(rootAbs, rel))) return { ok: false, reason: `file does not exist: ${rel}` };
      return { ok: false, reason: `file unreadable/binary: ${rel}` };
    }
    const quote = ev.quote || ev.excerpt;
    if (!quote || norm(quote).length < 4) return { ok: false, reason: `${rel} cited without a verbatim quote` };
    let ls = Number.isInteger(ev.line_start) ? ev.line_start : null;
    let le = Number.isInteger(ev.line_end) ? ev.line_end : ls;
    if (ls !== null && le !== null && le < ls) [ls, le] = [le, ls];
    if (ls !== null && ls >= 1 && ls <= lines.length) {
      const lo = Math.max(0, ls - 4);
      const hi = Math.min(lines.length, (le || ls) + 3);
      if (containsQuote(lines.slice(lo, hi).join("\n"), quote)) {
        return { ok: true, evidence: { kind: "file", path: rel, line_start: ls, line_end: Math.min(le || ls, lines.length), quote: String(quote).slice(0, 300) } };
      }
    }
    // Quote is real but the line numbers are off: relocate rather than discard (the anchor is
    // still concrete), and record that we did.
    if (!containsQuote(lines.join("\n"), quote)) return { ok: false, reason: `quote not found in ${rel}${ls ? `:${ls}` : ""}` };
    const qlen = Math.max(1, norm(quote).split(" ").length);
    const span = Math.min(60, Math.max(1, (le && ls ? le - ls + 1 : 1) + 6, Math.ceil(qlen / 4)));
    for (let i = 0; i < lines.length; i++) {
      if (containsQuote(lines.slice(i, i + span).join("\n"), quote)) {
        let end = i;
        while (end < i + span - 1 && !containsQuote(lines.slice(i, end + 1).join("\n"), quote)) end++;
        let start = end;
        while (start > i && !containsQuote(lines.slice(start, end + 1).join("\n"), quote)) start--;
        return { ok: true, evidence: { kind: "file", path: rel, line_start: start + 1, line_end: end + 1, quote: String(quote).slice(0, 300), relocated_from: ls } };
      }
    }
    return { ok: false, reason: `quote not found in ${rel}${ls ? `:${ls}` : ""}` };
  }

  function checkAll(list) {
    const valid = [];
    const invalid = [];
    for (const ev of list || []) {
      const r = check(ev);
      if (r.ok) valid.push(r.evidence);
      else invalid.push({ evidence: ev, reason: r.reason });
    }
    return { valid, invalid };
  }

  return { check, checkAll };
}

module.exports = { makeValidator, containsQuote, norm };
