const test = require("node:test");
const assert = require("node:assert");
const { score } = require("../lib/scoring");

test("no posts scores 0", () => {
  assert.strictEqual(score([]), 0);
});

test("scores like ratio per view, capped at 100", () => {
  assert.strictEqual(score([{ likes: 5, views: 1000 }]), 5);
  assert.strictEqual(score([{ likes: 900, views: 1000 }]), 100);
});
