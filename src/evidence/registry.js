"use strict";
// Evidence artifacts: the concrete, reproducible things a finding may cite (command output,
// scan results, probe responses). Each is written to a file the agents can Read and that
// the validator later checks citations against.

const path = require("path");
const { writeFileAtomic, mkdirp } = require("../util");

class EvidenceRegistry {
  constructor(dir, redact) {
    this.dir = mkdirp(dir);
    this.redact = redact;
    this.items = new Map();
  }

  add({ id, title, command = null, exitCode = null, durationMs = null, summary = "", content = "" }) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error(`bad artifact id ${id}`);
    const body = this.redact(String(content));
    const header = [
      `# artifact: ${id}`,
      `# title: ${title}`,
      command ? `# command: ${this.redact(command)}` : null,
      exitCode !== null ? `# exit_code: ${exitCode}` : null,
      durationMs !== null ? `# duration_ms: ${durationMs}` : null,
      `# summary: ${this.redact(summary).replace(/\n/g, " ")}`,
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");
    const text = `${header}\n${body}\n`;
    const file = path.join(this.dir, `${id}.txt`);
    writeFileAtomic(file, text);
    const item = { id, title, command: command ? this.redact(command) : null, exitCode, durationMs, summary: this.redact(summary), file, text };
    this.items.set(id, item);
    return item;
  }

  get(id) {
    return this.items.get(id);
  }

  has(id) {
    return this.items.has(id);
  }

  index() {
    return [...this.items.values()].map(({ id, title, summary, file, exitCode }) => ({ id, title, summary, file, exitCode }));
  }
}

module.exports = { EvidenceRegistry };
