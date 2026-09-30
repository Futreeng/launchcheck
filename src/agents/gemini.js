"use strict";
// EXPERIMENTAL / UNTESTED backend: Google Gemini via REST, for genuinely cross-family
// adversarial verification (the Convergence idea: Claude produces, Gemini attacks).
// Written against the public generateContent API but never run end-to-end, because no
// Gemini key was available while building v1. The report records which backend and model
// verified each lens, so a run using this is always identifiable.
//
// Gemini here has no file tools, so verify.js sends it an evidence bundle (the cited file
// excerpts +/- context and the probe transcripts) instead of repo access.

function createGeminiBackend() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return {
    name: "gemini",
    capabilities: { tools: false },
    available() {
      return key ? { ok: true, detail: "GEMINI_API_KEY set (experimental backend)" } : { ok: false, detail: "GEMINI_API_KEY not set" };
    },
    async run({ prompt, schema, model = process.env.LAUNCHCHECK_GEMINI_MODEL || "gemini-2.5-pro", timeoutMs = 10 * 60 * 1000 }) {
      const started = Date.now();
      const body = {
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nReturn ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      };
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const j = await res.json();
        const meta = { backend: "gemini", model, costUsd: null, durationMs: Date.now() - started, turns: 1 };
        if (!res.ok) return { ok: false, error: `Gemini API ${res.status} (upstream, not launchcheck): ${JSON.stringify(j).slice(0, 400)}`, meta };
        const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
        try {
          return { ok: true, output: JSON.parse(text), meta };
        } catch {
          return { ok: false, error: `Gemini returned non-JSON: ${text.slice(0, 300)}`, meta };
        }
      } catch (e) {
        return { ok: false, error: `Gemini request failed: ${e.message}`, meta: { backend: "gemini", model, durationMs: Date.now() - started } };
      }
    },
  };
}

module.exports = { createGeminiBackend };
