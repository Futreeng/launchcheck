"use strict";
// Backend interface. Any backend exposes:
//   name, capabilities: { tools: bool }, available() -> {ok, detail},
//   run({ prompt, schema, cwd, readDirs, denyReadGlobs, model, timeoutMs, budgetUsd })
//     -> { ok, output, meta: { backend, model, costUsd, durationMs, ... }, error }
// Swapping the verifier to a different model family (e.g. real Convergence cross-checking)
// means adding one file with this shape and selecting it with --verifier=<name>.

const { createClaudeCodeBackend } = require("./claude-code");
const { createGeminiBackend } = require("./gemini");

const FACTORIES = { "claude-code": createClaudeCodeBackend, gemini: createGeminiBackend };

function getBackend(name) {
  const f = FACTORIES[name];
  if (!f) throw new Error(`unknown agent backend "${name}" (available: ${Object.keys(FACTORIES).join(", ")})`);
  return f();
}

module.exports = { getBackend, BACKENDS: Object.keys(FACTORIES) };
