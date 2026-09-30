"use strict";
// JSON Schemas for agent output. Enforced by the backend where supported (Claude Code
// --json-schema) and re-checked by validate.js regardless of backend.

const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const CONFIDENCES = ["high", "medium", "low"];

const EVIDENCE = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["file", "artifact"] },
    path: { type: "string", description: "file evidence: repo-relative path with forward slashes" },
    line_start: { type: "integer" },
    line_end: { type: "integer" },
    quote: { type: "string", description: "file evidence: EXACT verbatim text copied from within those lines (<=200 chars). Checked mechanically." },
    artifact_id: { type: "string" },
    excerpt: { type: "string", description: "artifact evidence: EXACT verbatim text copied from the artifact (<=300 chars). Checked mechanically." },
  },
  required: ["kind"],
};

const PROBE = {
  type: "object",
  properties: {
    name: { type: "string" },
    steps: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          method: { type: "string" },
          path: { type: "string", description: "path only, starting with /; {{var}} substitutes captured values; {{rand}} is unique per sequence" },
          headers: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" } }, required: ["name", "value"] } },
          body: { type: "string", description: "JSON-encoded request body, e.g. {\"email\":\"a{{rand}}@example.test\"}" },
          capture: { type: "array", items: { type: "object", properties: { var: { type: "string" }, from: { type: "string", description: "json:<dot.path> into the response body" } }, required: ["var", "from"] } },
          use_cookies: { type: "boolean", description: "default true: cookies set by earlier steps are sent" },
        },
        required: ["method", "path"],
      },
    },
    secure_expectation: { type: "string", description: "what a correctly secured app returns, e.g. '403 on step 3'" },
  },
  required: ["name", "steps", "secure_expectation"],
};

const FINDING = {
  type: "object",
  properties: {
    key: { type: "string", description: "stable kebab-case id for this issue; REUSE the prior run's key if it's the same issue" },
    severity: { type: "string", enum: SEVERITIES },
    confidence: { type: "string", enum: CONFIDENCES },
    blocking: { type: "boolean" },
    claim: { type: "string", description: "specific, technical, falsifiable" },
    why_it_matters: { type: "string" },
    plain_summary: { type: "string", description: "ONE sentence a non-technical teammate understands, no jargon" },
    owner: { type: "string", enum: ["joe", "haron", "both", "either"], description: "haron = frontend/design/marketing work; joe = backend/infra/product" },
    evidence: { type: "array", minItems: 1, items: EVIDENCE },
    probes: { type: "array", maxItems: 4, items: PROBE },
  },
  required: ["key", "severity", "confidence", "blocking", "claim", "why_it_matters", "plain_summary", "owner", "evidence"],
};

const LENS_OUTPUT = {
  type: "object",
  properties: {
    lens: { type: "string" },
    applicability_score: { type: "number", minimum: 0, maximum: 1 },
    applicability_reason: { type: "string" },
    findings: { type: "array", items: FINDING },
    passes: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, claim: { type: "string" }, evidence: { type: "array", minItems: 1, items: EVIDENCE } },
        required: ["key", "claim", "evidence"],
      },
    },
    standing_checks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, status: { type: "string", enum: ["pass", "fail", "could_not_verify"] }, note: { type: "string" }, evidence: { type: "array", items: EVIDENCE } },
        required: ["id", "status", "note"],
      },
    },
    could_not_verify: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          why: { type: "string" },
          what_would_resolve: { type: "string" },
          severity_if_bad: { type: "string", enum: SEVERITIES },
        },
        required: ["question", "why", "what_would_resolve", "severity_if_bad"],
      },
    },
    notes_on_downweighting: { type: "string" },
    resolved_prior_keys: { type: "array", items: { type: "string" } },
  },
  required: ["lens", "applicability_score", "applicability_reason", "findings", "passes", "standing_checks", "could_not_verify", "notes_on_downweighting"],
};

const VERIFIER_OUTPUT = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "the F-id you were given" },
          verdict: { type: "string", enum: ["confirmed", "refuted", "contested"] },
          reasoning: { type: "string" },
          attempted: { type: "string", description: "what you actually did to try to break it" },
          counter_evidence: { type: "array", items: EVIDENCE },
          adjusted_severity: { type: "string", enum: [...SEVERITIES, "unchanged"] },
          adjusted_blocking: { type: "string", enum: ["true", "false", "unchanged"] },
          precedent_used: { type: "string", description: "precedent id if a calibration precedent informed this verdict, else empty" },
        },
        required: ["ref", "verdict", "reasoning", "attempted", "adjusted_severity", "adjusted_blocking"],
      },
    },
    pass_challenges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          verdict: { type: "string", enum: ["holds", "hollow", "contested"] },
          reasoning: { type: "string" },
          evidence: { type: "array", items: EVIDENCE },
        },
        required: ["ref", "verdict", "reasoning"],
      },
    },
  },
  required: ["verdicts", "pass_challenges"],
};

module.exports = { LENS_OUTPUT, VERIFIER_OUTPUT, SEVERITIES, CONFIDENCES };
